// komorebi_provider —— sketchybar 的 komorebi 事件提供器(常驻 C++ helper)
//
// 取代原 plugins/ 下 komorebi_listener.sh + komorebi_query.sh + komorebi_stack.sh:
//   · 原生 AF_UNIX socket 监听 komorebi 通知(取代 nc -lkU)
//   · nlohmann/json 流式解析「无分隔符连续 JSON」通知(取代 jq)
//   · ImageIO/CoreGraphics 把 .icns 转 png + md5 缓存(取代 sips)
//   · mach C API 进程内直推 komorebi_workspace_change 事件(取代 fork `sketchybar --trigger`)
//
// 事件契约(与 lua 侧约定):
//   --trigger komorebi_workspace_change STATUS=<online|offline>
//       FOCUSED=<idx> POPULATED=<c0,c1,...> ICONS=<png,png,...>
//
// 生命周期:
//   · komorebi 断连/未运行 → 广播 STATUS=offline,带退避地重订阅、自愈重连。
//   · mach 推送失败(sketchybar 退出/reload 致端口失效)→ 快速失败 exit(1),
//     交由 lua 在下次配置加载时干净重启(killall + 启新)。

#include "vendor/json.hpp"
#include "vendor/sketchybar.h"

#include <CommonCrypto/CommonDigest.h>
#include <ImageIO/ImageIO.h>
#include <CoreFoundation/CoreFoundation.h>

#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using json = nlohmann::json;

// ─── 配置常量 ───────────────────────────────────────────────────────────────
namespace cfg {
const char* kKomorebic   = "/opt/homebrew/bin/komorebic";  // 绝对路径,兼容受限 PATH
const char* kSockName     = "sketchybar";                  // komorebi 订阅名 = socket 文件名
const char* kEventName     = "komorebi_workspace_change";    // 与 lua 侧约定的自定义事件
const char* kCacheDir      = "/tmp/sketchybar_komorebi_icons";
constexpr int kIconPx      = 64;        // 缓存 png 最大边长,sketchybar 端再缩放
constexpr int kLivenessMs  = 5000;      // 空闲多久(无事件)后轮询一次 komorebi 存活性
constexpr size_t kMaxAcc   = 4u << 20;  // 解析缓冲安全上限(4MB),超限丢弃防失控
}

// 主显示器索引(komorebi monitors.elements 下标),可由环境变量覆盖。
static int g_monitor = 0;
// 调试日志开关:设置 KP_DEBUG 环境变量后向 stderr 打印状态机轨迹。
static bool g_debug = false;
#define DBG(...) do { if (g_debug) { fprintf(stderr, "[kp] " __VA_ARGS__); fputc('\n', stderr); } } while (0)
// 去重:仅在「STATUS|FOCUSED|POPULATED|ICONS」相对上次变化时才推送。
static std::string g_last_payload;

// ─── 小工具 ─────────────────────────────────────────────────────────────────

// 源路径的 MD5 十六进制串,作为图标缓存文件名(与原 shell 的 `md5` 一致,缓存可复用)。
static std::string md5_hex(const std::string& input) {
  unsigned char digest[CC_MD5_DIGEST_LENGTH];
  CC_MD5(input.data(), static_cast<CC_LONG>(input.size()), digest);
  static const char* hex = "0123456789abcdef";
  std::string out;
  out.reserve(CC_MD5_DIGEST_LENGTH * 2);
  for (unsigned char b : digest) {
    out.push_back(hex[b >> 4]);
    out.push_back(hex[b & 0x0f]);
  }
  return out;
}

// 捕获命令的标准输出(用于一次性 `komorebic state`)。失败/无输出返回空串。
static std::string capture(const std::string& command) {
  FILE* pipe = popen(command.c_str(), "r");
  if (!pipe) return "";
  std::string out;
  char buf[8192];
  size_t n;
  while ((n = fread(buf, 1, sizeof(buf), pipe)) > 0) out.append(buf, n);
  pclose(pipe);
  return out;
}

// fork/exec 一次 `komorebic <sub> sketchybar`,静默其输出并等待退出。
static void komorebic_socket_cmd(const char* sub) {
  pid_t pid = fork();
  if (pid == 0) {
    int devnull = open("/dev/null", O_WRONLY);
    if (devnull >= 0) { dup2(devnull, STDOUT_FILENO); dup2(devnull, STDERR_FILENO); }
    execl(cfg::kKomorebic, "komorebic", sub, cfg::kSockName, static_cast<char*>(nullptr));
    _exit(127);
  } else if (pid > 0) {
    int status = 0;
    waitpid(pid, &status, 0);
    DBG("komorebic %s -> exit %d", sub, WIFEXITED(status) ? WEXITSTATUS(status) : -1);
  }
}

// 干净重订阅:先退订旧订阅再订阅,确保 komorebi 至多一条到本 socket 的连接。
static void komorebic_resubscribe() {
  komorebic_socket_cmd("unsubscribe-socket");
  komorebic_socket_cmd("subscribe-socket");
}

// ─── 图标转换(ImageIO,取代 sips)──────────────────────────────────────────

// 把 .icns 源转成 <=kIconPx 的 png 并按 md5 缓存;返回 png 路径,失败返回空串。
static std::string icns_to_png(const std::string& src) {
  if (src.empty() || access(src.c_str(), R_OK) != 0) return "";

  std::string out = std::string(cfg::kCacheDir) + "/" + md5_hex(src) + ".png";
  if (access(out.c_str(), R_OK) == 0) return out;  // 命中缓存

  std::string result;
  CFURLRef src_url = CFURLCreateFromFileSystemRepresentation(
      nullptr, reinterpret_cast<const UInt8*>(src.data()), src.size(), false);
  CGImageSourceRef source = CGImageSourceCreateWithURL(src_url, nullptr);
  if (source) {
    // 直接从源生成缩略图,等价于 sips -Z kIconPx。
    int px = cfg::kIconPx;
    CFNumberRef max_px = CFNumberCreate(nullptr, kCFNumberIntType, &px);
    const void* keys[] = {kCGImageSourceCreateThumbnailFromImageAlways,
                          kCGImageSourceThumbnailMaxPixelSize};
    const void* vals[] = {kCFBooleanTrue, max_px};
    CFDictionaryRef opts = CFDictionaryCreate(
        nullptr, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);

    CGImageRef thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, opts);
    if (thumb) {
      CFURLRef out_url = CFURLCreateFromFileSystemRepresentation(
          nullptr, reinterpret_cast<const UInt8*>(out.data()), out.size(), false);
      CGImageDestinationRef dest =
          CGImageDestinationCreateWithURL(out_url, CFSTR("public.png"), 1, nullptr);
      if (dest) {
        CGImageDestinationAddImage(dest, thumb, nullptr);
        if (CGImageDestinationFinalize(dest)) result = out;
        CFRelease(dest);
      }
      CFRelease(out_url);
      CGImageRelease(thumb);
    }
    CFRelease(opts);
    CFRelease(max_px);
    CFRelease(source);
  }
  if (src_url) CFRelease(src_url);
  return result;
}

// ─── 状态推送 ───────────────────────────────────────────────────────────────

// 组装并推送一条事件;去重后无变化则跳过。mach 推送失败即快速失败退出。
static void emit(const std::string& status, const std::string& focused,
                 const std::string& populated, const std::string& icons) {
  std::string payload = status + "|" + focused + "|" + populated + "|" + icons;
  if (payload == g_last_payload) return;
  g_last_payload = payload;
  DBG("emit %s focused=%s populated=%s icons=%zuB", status.c_str(), focused.c_str(),
      populated.c_str(), icons.size());

  bool ok = sketchybar_send({"--trigger", cfg::kEventName,
                             "STATUS=" + status,
                             "FOCUSED=" + focused,
                             "POPULATED=" + populated,
                             "ICONS=" + icons});
  if (!ok) {
    // sketchybar 失联:不重连端口,直接退出,由 lua 干净重启。
    std::exit(1);
  }
}

static void emit_offline() { emit("offline", "", "", ""); }

// ─── komorebi 状态解析 ───────────────────────────────────────────────────────

// 收集某窗口的 .icns 图标路径(若有)。
static void collect_window_icon(const json& window, std::vector<std::string>& out) {
  if (window.contains("details") && window["details"].contains("icon_path")) {
    const json& path = window["details"]["icon_path"];
    if (path.is_string() && !path.get<std::string>().empty())
      out.push_back(path.get<std::string>());
  }
}

// 按「聚焦目标」优先级收集图标源(与原 listener.sh/stack.sh 同序):
//   maximized → monocle → 聚焦浮动窗口 → 聚焦平铺容器内全部窗口 → 空。
static void collect_focused_icons(const json& workspace, std::vector<std::string>& out) {
  if (workspace.contains("maximized_window") && !workspace["maximized_window"].is_null()) {
    collect_window_icon(workspace["maximized_window"], out);
    return;
  }
  if (workspace.contains("monocle_container") && !workspace["monocle_container"].is_null()) {
    for (const auto& w : workspace["monocle_container"]["windows"]["elements"])
      collect_window_icon(w, out);
    return;
  }
  if (workspace.value("layer", "") == "Floating" &&
      workspace.contains("floating_windows") &&
      workspace["floating_windows"]["elements"].is_array() &&
      !workspace["floating_windows"]["elements"].empty()) {
    const json& fw = workspace["floating_windows"]["elements"];
    int idx = workspace["floating_windows"].value("focused", 0);
    if (idx < 0 || idx >= static_cast<int>(fw.size())) idx = 0;
    collect_window_icon(fw[idx], out);
    return;
  }
  if (workspace.contains("containers") && workspace["containers"]["elements"].is_array() &&
      !workspace["containers"]["elements"].empty()) {
    const json& cs = workspace["containers"]["elements"];
    int idx = workspace["containers"].value("focused", 0);
    if (idx < 0 || idx >= static_cast<int>(cs.size())) idx = 0;
    for (const auto& w : cs[idx]["windows"]["elements"])
      collect_window_icon(w, out);
  }
}

// 从一份 state(根含 monitors)解析并推送在线状态。malformed 时静默跳过(不翻成离线)。
static void emit_from_state(const json& root) {
  try {
    const json& state = root.contains("state") ? root.at("state") : root;
    const json& workspaces =
        state.at("monitors").at("elements").at(g_monitor).at("workspaces");

    std::string focused = std::to_string(workspaces.at("focused").get<int>());

    std::string populated;
    for (const auto& ws : workspaces.at("elements")) {
      size_t count = 0;
      if (ws.contains("containers") && ws["containers"]["elements"].is_array())
        count = ws["containers"]["elements"].size();
      populated += (populated.empty() ? "" : ",") + std::to_string(count);
    }

    std::vector<std::string> icon_srcs;
    int focused_idx = workspaces.at("focused").get<int>();
    const json& ws_elems = workspaces.at("elements");
    if (focused_idx >= 0 && focused_idx < static_cast<int>(ws_elems.size()))
      collect_focused_icons(ws_elems.at(focused_idx), icon_srcs);

    std::string icons;
    for (const auto& src : icon_srcs) {
      std::string png = icns_to_png(src);
      if (!png.empty()) icons += (icons.empty() ? "" : ",") + png;
    }

    emit("online", focused, populated, icons);
  } catch (const std::exception&) {
    // 单条通知字段缺失/越界:跳过,保持上次状态(对齐 jq 的 try…catch empty)。
  }
}

// 主动查一次 `komorebic state`:存活则解析并推送在线状态、返回 true;
// 不可用(komorebi 未运行)则推送离线、返回 false。
// 兼作即时初始化高亮(取代 query.sh + stack.sh)与离线检测的存活探针。
static bool refresh_snapshot() {
  std::string out = capture(std::string(cfg::kKomorebic) + " state 2>/dev/null");
  if (out.empty()) { emit_offline(); return false; }
  try {
    emit_from_state(json::parse(out));
    return true;
  } catch (const std::exception&) {
    emit_offline();
    return false;
  }
}

// ─── 连续 JSON 流框架解析 ────────────────────────────────────────────────────

// 从 buffer[from] 起定位首个完整的顶层 {…} 对象;考虑字符串字面量与转义。
// 完整则置 start/end(end 为对象末字符后一位)返回 true,否则 false(尚不完整)。
static bool next_object(const std::string& buffer, size_t from, size_t& start, size_t& end) {
  size_t open = buffer.find('{', from);
  if (open == std::string::npos) return false;

  int depth = 0;
  bool in_string = false, escaped = false;
  for (size_t i = open; i < buffer.size(); ++i) {
    char c = buffer[i];
    if (in_string) {
      if (escaped)        escaped = false;
      else if (c == '\\') escaped = true;
      else if (c == '"')  in_string = false;
      continue;
    }
    if (c == '"')      in_string = true;
    else if (c == '{') ++depth;
    else if (c == '}' && --depth == 0) {
      start = open;
      end = i + 1;
      return true;
    }
  }
  return false;  // 对象尚未接收完整
}

// 消费 buffer 中所有完整通知对象并推送,擦除已消费前缀,保留残余半包。
static void drain_buffer(std::string& buffer) {
  size_t pos = 0, start = 0, end = 0;
  while (next_object(buffer, pos, start, end)) {
    try {
      emit_from_state(json::parse(buffer.substr(start, end - start)));
    } catch (const std::exception&) {
      // 解析失败:跳过该对象。
    }
    pos = end;
  }
  if (pos > 0) buffer.erase(0, pos);
  if (buffer.size() > cfg::kMaxAcc) buffer.clear();  // 失控保护
}

// 读取一条 komorebi 连接的通知流直至 EOF/出错(对端断开)。
static void serve_connection(int conn_fd) {
  std::string buffer;
  char chunk[65536];
  for (;;) {
    ssize_t n = read(conn_fd, chunk, sizeof(chunk));
    if (n <= 0) return;  // EOF 或读错误 → komorebi 断开
    buffer.append(chunk, static_cast<size_t>(n));
    drain_buffer(buffer);
  }
}

// ─── socket 与主循环 ─────────────────────────────────────────────────────────

// 在 path 上创建并监听 AF_UNIX socket(取代 nc -lkU)。失败返回 -1。
static int make_listen_socket(const std::string& path) {
  if (path.size() >= sizeof(sockaddr_un{}.sun_path)) return -1;
  unlink(path.c_str());

  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return -1;

  sockaddr_un addr{};
  addr.sun_family = AF_UNIX;
  std::strncpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path) - 1);
  // backlog 留余量:komorebi 在事件密集时可能短时间内多次连入(每条通知一次连接)。
  if (bind(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0 || listen(fd, 8) < 0) {
    close(fd);
    return -1;
  }
  return fd;
}

// 等待 listen_fd 上出现可接收的连接,最多 timeout_ms;有连接返回 true。
static bool wait_connectable(int listen_fd, int timeout_ms) {
  pollfd pfd{listen_fd, POLLIN, 0};
  return poll(&pfd, 1, timeout_ms) > 0 && (pfd.revents & POLLIN);
}

int main() {
  std::signal(SIGPIPE, SIG_IGN);  // popen/socket 写端关闭不致命

  g_debug = getenv("KP_DEBUG") != nullptr;
  const char* home = getenv("HOME");
  if (!home) { fprintf(stderr, "komorebi_provider: HOME unset\n"); return 1; }
  if (const char* mon = getenv("KOMOREBI_MONITOR")) g_monitor = atoi(mon);
  setenv("PATH", "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin", 1);

  std::string sock_path =
      std::string(home) + "/Library/Application Support/komorebi/" + cfg::kSockName;
  mkdir(cfg::kCacheDir, 0755);

  // 启动清理:退订残留订阅 + 删旧 socket,确保干净重建。
  komorebic_socket_cmd("unsubscribe-socket");
  int listen_fd = make_listen_socket(sock_path);
  if (listen_fd < 0) {
    fprintf(stderr, "komorebi_provider: cannot create socket at %s\n", sock_path.c_str());
    return 1;
  }

  // komorebi-for-mac 的通知模型:订阅持久有效,komorebi 在「每条事件通知」时新建
  // 一次连接、写入该帧 state、随即关闭(EOF)。故本循环只需持续 accept 每一帧,
  // 不在 EOF 后重订阅(否则会触发 komorebi 重发并陷入自循环)。
  // 离线检测独立于事件连接:空闲超过 kLivenessMs 未收到任何帧时,轮询 komorebic state
  // 作为存活探针 —— 失败判离线,恢复则重订阅以接收后续事件。
  bool online = refresh_snapshot();  // 即时初始化高亮(komorebi 未运行则离线)
  komorebic_resubscribe();           // 订阅一次,后续由 komorebi 主动逐帧连入

  for (;;) {
    if (wait_connectable(listen_fd, cfg::kLivenessMs)) {
      int conn = accept(listen_fd, nullptr, nullptr);
      if (conn < 0) continue;
      DBG("accepted komorebi notification fd=%d", conn);
      serve_connection(conn);  // 读取该帧并渲染,对端随即关闭
      close(conn);
      online = true;
    } else {
      // 一段时间无事件:用 komorebic state 探活,顺带在恢复时刷新快照。
      bool alive = refresh_snapshot();
      if (alive && !online) {
        DBG("komorebi recovered -> resubscribe");
        komorebic_resubscribe();  // komorebi 可能重启过,重新订阅以接收后续事件
      }
      online = alive;
    }
  }
}
