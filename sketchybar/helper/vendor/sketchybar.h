// sketchybar.h —— 面向本 helper 的极简 sketchybar 客户端封装
//
// 把一串命令 token(等价于 `sketchybar` CLI 的 argv,如 {"--trigger", "event", "K=V"})
// 按 mach 线协议打包后直推 sketchybar 守护进程,零 fork。
// 打包规则(与 SbarLua/CLI 一致):每个 token 以 '\0' 结尾依次拼接,末尾再补一个 '\0'
// 作为参数列表终止符,总长度 = Σ(strlen(token)+1) + 1。
#pragma once

#include "mach.h"
#include <string>
#include <vector>

// 与 sketchybar 守护进程约定的 bootstrap 名(SbarLua 同款)。
inline const char* sketchybar_bootstrap_name() { return "git.felix.sketchybar"; }

// 发送一条命令。成功(拿到守护进程回执)返回 true;两次尝试均失败(端口失效/对端不在)
// 返回 false —— 调用方据此判定 sketchybar 失联并快速失败退出。
inline bool sketchybar_send(const std::vector<std::string>& args) {
  // 缓存端口,失联时再重查一次。
  static mach_port_t cached_port = 0;

  // 打包:token\0token\0...token\0 + 末尾终止 '\0'
  std::string buffer;
  for (const auto& token : args) {
    buffer.append(token);
    buffer.push_back('\0');
  }
  buffer.push_back('\0');

  auto try_send = [&](mach_port_t port) -> char* {
    if (!port) return nullptr;
    return mach_send_message(port, buffer.data(),
                             static_cast<uint32_t>(buffer.size()), true);
  };

  if (!cached_port) cached_port = mach_get_bs_port(sketchybar_bootstrap_name());
  char* response = try_send(cached_port);

  if (!response) {  // 端口可能已失效(sketchybar 重载/退出):重查后再试一次
    cached_port = mach_get_bs_port(sketchybar_bootstrap_name());
    response = try_send(cached_port);
  }

  if (response) {
    free(response);
    return true;
  }
  return false;
}
