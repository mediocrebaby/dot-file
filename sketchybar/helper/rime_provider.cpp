// rime_provider —— sketchybar 的 Rime ascii_mode 事件提供器(常驻 C++ helper)
//
// Lua 侧 ascii_mode_export.lua 将 Rime 内部 ascii_mode 以原子 rename 写入:
//   ~/.cache/rime/ascii_mode   (值 "cn" 或 "en")
// rename 改变父目录 inode → kqueue EVFILT_VNODE NOTE_WRITE 即时触发 → 本 helper
// 读文件 → 经 mach 直推 sketchybar 自定义事件,零 fork。
//
// 事件契约(与 items/rime.lua 约定):
//   --trigger rime_ascii_mode_change MODE=<cn|en>
//
// 生命周期:
//   · 缓存目录被删除 → 干净退出;由 rime.lua system_woke 订阅重启。
//   · mach 推送失败(sketchybar 退出/reload)→ exit(1),同上由 lua 干净重启。
//
// 调试:设置 RP_DEBUG 环境变量输出状态轨迹到 stderr。

#include "vendor/sketchybar.h"

#include <sys/event.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

// ─── 配置常量 ───────────────────────────────────────────────────────────────
namespace cfg {
  const char* kEventName = "rime_ascii_mode_change";
}

static bool g_debug = false;
#define DBG(...) do { if (g_debug) { fprintf(stderr, "[rp] " __VA_ARGS__); fputc('\n', stderr); } } while (0)

// 去重:仅在值变化时推送事件
static std::string g_last_mode;

// ─── 工具函数 ────────────────────────────────────────────────────────────────

// 读取状态文件,返回 "cn" 或 "en";文件不存在/读失败返回 ""
static std::string read_state(const std::string& path) {
  int fd = open(path.c_str(), O_RDONLY);
  if (fd < 0) return "";
  char buf[16];
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 0) return "";
  buf[n] = '\0';
  std::string s(buf);
  // 去除尾部空白/换行
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == ' '))
    s.pop_back();
  return s;
}

// 读取文件;值变化时推送 sketchybar 事件;mach 失败则退出
static void maybe_emit(const std::string& state_path) {
  std::string mode = read_state(state_path);
  if (mode.empty()) {
    DBG("state file empty or missing, waiting");
    return;
  }
  if (mode == g_last_mode) {
    DBG("mode unchanged (%s), skip", mode.c_str());
    return;
  }
  g_last_mode = mode;
  DBG("emit MODE=%s", mode.c_str());
  bool ok = sketchybar_send({"--trigger", cfg::kEventName, "MODE=" + mode});
  if (!ok) {
    fprintf(stderr, "rime_provider: sketchybar send failed, exiting\n");
    std::exit(1);
  }
}

// ─── 主程序 ──────────────────────────────────────────────────────────────────

int main() {
  std::signal(SIGPIPE, SIG_IGN);  // 管道写端关闭不致命

  g_debug = (getenv("RP_DEBUG") != nullptr);
  const char* home = getenv("HOME");
  if (!home) { fprintf(stderr, "rime_provider: HOME unset\n"); return 1; }

  std::string cache_dir  = std::string(home) + "/.cache/rime";
  std::string state_path = cache_dir + "/ascii_mode";

  // 确保目录存在(Lua 侧 ensure_dir 也会创建;双重保障)
  mkdir(cache_dir.c_str(), 0755);

  int kq = kqueue();
  if (kq < 0) { perror("kqueue"); return 1; }

  // O_EVTONLY:仅用于 kqueue 事件监听,不阻止目录被卸载
  int dir_fd = open(cache_dir.c_str(), O_RDONLY | O_EVTONLY);
  if (dir_fd < 0) {
    fprintf(stderr, "rime_provider: cannot open %s: %s\n",
            cache_dir.c_str(), strerror(errno));
    return 1;
  }

  struct kevent kev;
  // NOTE_WRITE  : 目录内容变化(rename/create/delete)→ ascii_mode 文件被原子替换时触发
  // NOTE_DELETE : 目录被删除 → 干净退出
  // EV_CLEAR    : 边缘触发,每次变化通知一次,不累积
  EV_SET(&kev, dir_fd, EVFILT_VNODE,
         EV_ADD | EV_CLEAR,
         NOTE_WRITE | NOTE_DELETE | NOTE_RENAME,
         0, nullptr);
  if (kevent(kq, &kev, 1, nullptr, 0, nullptr) < 0) {
    perror("rime_provider: kevent register");
    return 1;
  }

  // 启动时读取初始状态(Rime 已运行过时文件已存在,立即推送首个事件)
  maybe_emit(state_path);

  DBG("watching %s", cache_dir.c_str());

  for (;;) {
    struct kevent ev;
    int n = kevent(kq, nullptr, 0, &ev, 1, nullptr);
    if (n < 0) {
      if (errno == EINTR) continue;
      perror("rime_provider: kevent wait");
      return 1;
    }
    if (n == 0) continue;

    if (ev.filter == EVFILT_VNODE) {
      if (ev.fflags & NOTE_DELETE) {
        fprintf(stderr, "rime_provider: cache dir deleted, exiting\n");
        return 1;
      }
      // NOTE_WRITE / NOTE_RENAME: 目录内容变化,重读 ascii_mode 文件
      DBG("vnode event fflags=0x%x", ev.fflags);
      maybe_emit(state_path);
    }
  }
}
