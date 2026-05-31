local platform = require("utils.platform")

-- C#（.NET）扩展按需加载：
-- LazyVim 通过 lazyvim.json 引入的 extra 会在所有平台无条件加载，
-- 而该 extra 的语言服务器、调试器等工具依赖系统中存在 `dotnet` 命令。
-- 在未安装 .NET SDK 的机器（如部分 Linux）上会安装失败并报 “Not Found dotnet command”。
--
-- 这里改为在自己的插件 spec 里按条件 import：
-- 仅当检测到 `dotnet` 命令可用时才引入 dotnet extra，否则返回空表完全跳过。
-- 这样安装了 SDK 的机器（如 Windows）正常获得 C# 支持，未安装的机器静默跳过。
if not platform.has_executable("dotnet") then
  return {}
end

return {
  { import = "lazyvim.plugins.extras.lang.dotnet" },
}
