-- 组件加载器:按视觉顺序加载各 item。

-- 左侧:komorebi 工作区
require("items.komorebi")

-- 左侧(紧跟工作区):komorebi 堆叠窗口图标
require("items.stack")

-- 右侧系统组件(右侧区:先 require 的更靠右,故顺序为右→左)
require("items.clock")   -- 最右
require("items.wifi")
require("items.volume")
require("items.memory")
require("items.cpu")     -- 最左

-- 分组胶囊(必须在所有成员 item 创建之后)
require("items.brackets")
