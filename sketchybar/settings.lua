-- 全局常量:路径、字体、尺寸、间距
-- 集中管理,避免各 item 文件散落魔法数字。

local home = os.getenv("HOME")
-- sketchybar 为所有脚本注入 CONFIG_DIR;回退到默认配置目录。
local config_dir = os.getenv("CONFIG_DIR") or (home .. "/.config/sketchybar")

local settings = {
  paths = {
    home = home,
    config = config_dir,
    -- 编译好的 C++ event provider(取代原 plugins 下的 shell 桥接脚本)
    helper = config_dir .. "/helper/komorebi_provider",
    -- komorebi 事件 socket(helper 创建并监听;注意无后缀)
    komorebi_socket = home .. "/Library/Application Support/komorebi/sketchybar",
  },

  font = {
    text = "SF Pro",            -- 文字:macOS 系统字体
    icon = "FiraCode Nerd Font", -- 图标:Nerd Font 字形
  },

  -- bar 整体尺寸(单位为点,Retina 下的视觉尺寸)
  bar = {
    height = 43,
    y_offset = 0,
    padding = 50,   -- bar 左右内边距(增大以拉开最外侧 widget 与屏幕边缘的距离)
    margin = 0,
  },

  -- widget(item)统一外观,复刻 yasb 胶囊
  item = {
    height = 30,          -- 背景胶囊高度
    corner_radius = 15,   -- 保持胶囊形(height/2)
    padding = 4,          -- item 之间的间距(left/right padding)
    label_padding = 9,    -- 文字到胶囊边缘的内边距
    icon_padding = 9,
    gap = 7,              -- 图标与文字之间
  },

  -- 字号
  size = {
    label = 15.0,
    icon = 16.0,
    workspace_dot = 16.0, -- 工作区圆点字号(用 Nerd Font 圆点字形)
  },
}

-- 生成 sketchybar 字体串:"Family:Style:Size"
function settings.font_string(family, style, size)
  return string.format("%s:%s:%.1f", family, style, size)
end

return settings
