#!/usr/bin/env bash
# 输出当前 Wi-Fi 的 SSID(未连接则为空)。
# macOS 26 上 networksetup 已失效,改用 ipconfig getsummary 读取 SSID。
iface=$(networksetup -listallhardwareports 2>/dev/null | awk '/Wi-Fi/{getline; print $2; exit}')
[ -z "$iface" ] && iface=en0
ipconfig getsummary "$iface" 2>/dev/null \
  | awk -F' SSID : ' '/ SSID/ {print $2; exit}'
