#!/usr/bin/env bash
# 输出当前 "焦点工作区索引|各工作区窗口数",例如 "0|3,0,0"。
# 供 sketchybar 启动/重载时立即初始化工作区高亮,无需等待监听器的首个事件。
# 确保 launchd(brew services)受限环境下也能找到 komorebic/jq
export PATH="/opt/homebrew/bin:$PATH"

MON="${KOMOREBI_MONITOR:-0}"
komorebic state 2>/dev/null | jq -r '
  .monitors.elements['"$MON"'].workspaces as $w
  | "\($w.focused)|"
    + ([$w.elements[] | .containers.elements | length] | map(tostring) | join(","))
'
