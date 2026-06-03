#!/usr/bin/env bash
# komorebi → sketchybar 事件桥接器(常驻前台进程,由 items/komorebi.lua 以 nohup & 拉起)
#
# 机制:订阅者负责在 <data_dir>/<name>(无后缀)创建并监听 Unix socket,
# komorebi 作为客户端连入,持续写入「连续 JSON」通知流(无换行分隔)。
# 本脚本用 jq --unbuffered 流式解析每条通知,提取三段(竖线分隔):
#   第1段 focused   = 焦点工作区索引
#   第2段 populated = 各工作区平铺容器数(逗号分隔)
#   第3段 icns 列表 = 当前「聚焦目标」各窗口的 .icns 图标路径(分号分隔)
# 仅在 payload 变化时触发自定义事件 komorebi_workspace_change,携带:
#   FOCUSED / POPULATED → 左侧工作区圆点 (items/komorebi.lua)
#   ICONS               → 中间聚焦图标 (items/stack.lua),已转 png 的逗号分隔路径
#
# 关键:左侧与中间都只消费「同一条通知的 .state」。中间不再另起 `komorebic state`
# 命令查询,从而彻底消除「命令 state 滞后于通知」导致的中间图标停留问题。
set -uo pipefail

# 确保 launchd(brew services)受限环境下也能找到 komorebic/jq/sips/sketchybar
export PATH="/opt/homebrew/bin:$PATH"

SOCK_NAME="sketchybar"
DATA_DIR="$HOME/Library/Application Support/komorebi"
SOCK="$DATA_DIR/$SOCK_NAME"
MON="${KOMOREBI_MONITOR:-0}"   # 主显示器索引

# 图标缓存:komorebi 的 icon_path 指向 .icns,sketchybar 无法直接加载,
# 用 sips 转 png 并按源路径 md5 缓存(png 文件名即 md5,无空格,便于逗号拼接传参)
CACHE_DIR="/tmp/sketchybar_komorebi_icons"
ICON_PX=64
mkdir -p "$CACHE_DIR"
icns_to_png() {
  local src="$1" key out
  [ -n "$src" ] && [ -f "$src" ] || return
  key=$(printf '%s' "$src" | md5)
  out="$CACHE_DIR/$key.png"
  [ -f "$out" ] || sips -s format png "$src" --out "$out" -Z "$ICON_PX" >/dev/null 2>&1
  [ -f "$out" ] && printf '%s' "$out"
}

# 清理残留订阅与 socket 文件,确保干净重建
komorebic unsubscribe-socket "$SOCK_NAME" 2>/dev/null
rm -f "$SOCK"

# 先让 nc 就绪监听,再注册订阅(komorebi 此时才能连入)
( sleep 0.6; komorebic subscribe-socket "$SOCK_NAME" 2>/dev/null ) &

# 前台常驻:流式解析通知 → "focused|populated|icns;icns;…" → 变化时转 png 并 trigger
last=""
nc -lkU "$SOCK" \
  | jq --unbuffered -rc '
      try (
        .state.monitors.elements['"$MON"'].workspaces as $w
        | $w.elements[$w.focused] as $ws
        | "\($w.focused)|"
          + ([$w.elements[] | .containers.elements | length] | map(tostring) | join(","))
          + "|"
          # 第3段:当前「聚焦目标」各窗口的 .icns 路径(与 plugins/komorebi_stack.sh 同优先级)
          + ([
              (if   $ws.maximized_window  != null then [ $ws.maximized_window ]
               elif $ws.monocle_container != null then $ws.monocle_container.windows.elements
               elif ($ws.layer == "Floating") and (($ws.floating_windows.elements | length) > 0)
                 then [ $ws.floating_windows.elements[ ($ws.floating_windows.focused // 0) ] ]
               elif ($ws.containers.elements | length) > 0
                 then $ws.containers.elements[ ($ws.containers.focused // 0) ].windows.elements
               else [] end)[]?
              | .details.icon_path // empty
             ] | join(";"))
      ) catch empty
    ' \
  | while IFS= read -r payload; do
      [ "$payload" = "$last" ] && continue
      last="$payload"
      focused="${payload%%|*}"          # 第 1 段
      rest="${payload#*|}"
      populated="${rest%%|*}"           # 第 2 段
      icns="${rest#*|}"                 # 第 3 段:聚焦目标 icns 列表(; 分隔,可能为空)
      # 逐个 .icns → png(已缓存则跳过),拼成逗号分隔的 png 路径列表
      pngs=""
      if [ -n "$icns" ]; then
        IFS=';' read -ra srcs <<< "$icns"
        for src in "${srcs[@]}"; do
          p=$(icns_to_png "$src")
          [ -n "$p" ] && pngs="${pngs:+$pngs,}$p"
        done
      fi
      sketchybar --trigger komorebi_workspace_change \
        FOCUSED="$focused" POPULATED="$populated" ICONS="$pngs"
    done
