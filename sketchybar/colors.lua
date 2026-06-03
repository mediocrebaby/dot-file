-- Catppuccin Mocha 配色(从 yasb styles.css 提取)
-- sketchybar 颜色为 0xAARRGGBB,这里统一加上 0xff 不透明前缀;
-- 需要半透明时用 with_alpha() 派生。

local function rgb(hex)
  -- hex: 0xRRGGBB -> 0xffRRGGBB(完全不透明)
  return 0xff000000 | hex
end

local colors = {
  -- 基础调色板
  rosewater = rgb(0xf5e0dc),
  flamingo  = rgb(0xf2cdcd),
  pink      = rgb(0xf5c2e7),
  mauve     = rgb(0xcba6f7),
  red       = rgb(0xf38ba8),
  maroon    = rgb(0xeba0ac),
  peach     = rgb(0xfab387),
  yellow    = rgb(0xf9e2af),
  green     = rgb(0xa6e3a1),
  teal      = rgb(0x94e2d5),
  sky       = rgb(0x89dceb),
  sapphire  = rgb(0x74c7ec),
  blue      = rgb(0x89b4fa),
  lavender  = rgb(0xb4befe),

  text     = rgb(0xd3d3d3),
  subtext1 = rgb(0xbac2de),
  subtext0 = rgb(0xa6adc8),
  overlay2 = rgb(0x9399b2),
  overlay1 = rgb(0x7f849c),
  overlay0 = rgb(0x6c7086),
  surface2 = rgb(0x585b70),
  surface1 = rgb(0x45475a),
  surface0 = rgb(0x282936),
  base     = rgb(0x1e1e2e),
  mantle   = rgb(0x181825),
  crust    = rgb(0x11111b),

  -- komorebi 工作区圆点(yasb .ws-btn 配色)
  ws_empty     = rgb(0x2f4f4f), -- 空闲:深青灰
  ws_populated = rgb(0x548585), -- 有窗口:青色
  ws_active    = rgb(0xd3d3d3), -- 活动:亮白(拉长成胶囊)

  transparent = 0x00000000,
}

-- 透明度派生:alpha 取 0.0~1.0
function colors.with_alpha(color, alpha)
  if alpha > 1.0 then alpha = 1.0 end
  if alpha < 0.0 then alpha = 0.0 end
  local a = math.floor(alpha * 255.0)
  return (color & 0x00ffffff) | (a << 24)
end

return colors
