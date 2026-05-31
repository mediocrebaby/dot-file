local M = {}

-- 缓存检测结果，避免重复读文件
local cache = {}

-- 读取一个文件的全部内容，读不到返回 nil
local function read_file(path)
  local fd = io.open(path, "r")
  if not fd then
    return nil
  end
  local content = fd:read("*a")
  fd:close()
  return content
end

function M.is_windows()
  return vim.fn.has("win32") == 1 or vim.fn.has("win64") == 1
end

function M.is_macos()
  return vim.fn.has("macunix") == 1
end

function M.is_linux()
  return vim.fn.has("unix") == 1 and not M.is_macos()
end

-- 系统 PATH 中是否存在某个可执行命令
-- 用于按依赖条件加载插件（如 dotnet 缺失时跳过 C# 扩展）
function M.has_executable(name)
  return vim.fn.executable(name) == 1
end

-- 是否运行在 WSL（Windows Subsystem for Linux）内
-- 通过 /proc 内核标识判断：WSL 的内核版本字符串中含有 microsoft / WSL 字样
function M.is_wsl()
  if cache.is_wsl ~= nil then
    return cache.is_wsl
  end

  local result = false
  -- WSL 一定是 Linux 内核；Windows 原生与 macOS 直接排除
  if M.is_linux() then
    local kernel = read_file("/proc/sys/kernel/osrelease") or read_file("/proc/version") or ""
    kernel = kernel:lower()
    result = kernel:find("microsoft") ~= nil or kernel:find("wsl") ~= nil
  end

  cache.is_wsl = result
  return result
end

return M
