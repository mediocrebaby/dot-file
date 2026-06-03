#!/usr/bin/env bash
# 输出「当前聚焦目标」内各窗口应用图标的 png 路径(每行一个,按窗口顺序)。
#
# 聚焦目标按优先级判定:
#   1) maximized_window  —— 最大化窗口(单个)
#   2) monocle_container —— monocle 容器(其内全部窗口)
#   3) layer==Floating   —— 当前聚焦的浮动窗口(单个)
#   4) 聚焦的平铺容器     —— containers.elements[containers.focused] 内全部窗口
#                            (单窗口→1 个图标;堆叠多窗口→全部图标)
#   5) 以上皆无(空工作区)—— 不输出,中间区留空
#
# komorebi state 的 details.icon_path 指向 .icns,而 sketchybar 无法直接加载 .icns,
# 故用 macOS 自带 sips 转成 png 并按源路径 md5 缓存,避免重复转换。
set -uo pipefail

# 确保 launchd(brew services)受限环境下也能找到 komorebic/jq/sips
export PATH="/opt/homebrew/bin:$PATH"

MON="${KOMOREBI_MONITOR:-0}"
CACHE_DIR="/tmp/sketchybar_komorebi_icons"
ICON_PX=64    # 缓存 png 的最大边长;sketchybar 端再 scale 到显示尺寸
mkdir -p "$CACHE_DIR"

komorebic state 2>/dev/null | jq -r '
  .monitors.elements['"$MON"'].workspaces as $w
  | $w.elements[$w.focused] as $ws
  | (
      if   $ws.maximized_window  != null then [ $ws.maximized_window ]
      elif $ws.monocle_container != null then $ws.monocle_container.windows.elements
      elif ($ws.layer == "Floating") and (($ws.floating_windows.elements | length) > 0)
        then [ $ws.floating_windows.elements[ ($ws.floating_windows.focused // 0) ] ]
      elif ($ws.containers.elements | length) > 0
        then $ws.containers.elements[ ($ws.containers.focused // 0) ].windows.elements
      else [] end
    ) as $wins
  | $wins[]? | .details.icon_path // empty
' 2>/dev/null | while IFS= read -r src; do
  [ -z "$src" ] && continue
  [ -f "$src" ] || continue
  key=$(printf '%s' "$src" | md5)
  out="$CACHE_DIR/$key.png"
  [ -f "$out" ] || sips -s format png "$src" --out "$out" -Z "$ICON_PX" >/dev/null 2>&1
  [ -f "$out" ] && printf '%s\n' "$out"
done
