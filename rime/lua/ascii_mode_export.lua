-- ascii_mode_export: 监听 Rime 内部 ascii_mode 选项变化。
--
-- 触发时机:用户通过 Caps Lock / Shift / 快捷键切换中英文模式;
--          Squirrel 弹出 "中文"/"西文" HUD 的同一时刻。
--
-- 工作方式(单一推送路径):
--   将状态原子写入 ~/.cache/rime/ascii_mode(值 "cn" 或 "en")
--   → rime_provider C++ helper 通过 kqueue 监听父目录变化后经 mach 推 sketchybar 事件。
--   helper 由 sketchybar 在加载/休眠唤醒时拉起;此处不再 os.execute 触发(避免双触发与
--   在按键线程上 fork shell)。
--
-- 两个更新触发点:
--   1. option_update_notifier 回调:ascii_mode 真正切换的瞬间(主路径)。
--   2. func() 每次按键廉价重同步:聚焦 session 的真实 ascii_mode 若与当前显示值不一致
--      则纠正一次 —— 修复"在多个已打开 App(尤其配了 app_options ascii_mode 的
--      VSCode/Obsidian/wezterm)之间 Cmd-Tab 切换时,目标 session 不触发 notifier
--      导致指示器 stale"的问题。注:聚焦后到首次按键之间仍有不可避免的短暂空窗(无焦点钩子)。
--
-- ⚠️ 重要:func() 永远返回 kNoop(2) = 透传给下一个 processor,不消费任何按键。
--    切勿改为 0(kRejected)!本 processor 挂在 engine/processors 的 @before 0(最前端),
--    返回 kRejected 会拦截所有按键,使输入法完全无法输入。
--    连接对象存入 env.ascii_conn 防止被 Lua GC 回收导致回调失效。

local M = {}

local HOME      = os.getenv("HOME") or ""
local CACHE_DIR = HOME .. "/.cache/rime"
local STATE     = CACHE_DIR .. "/ascii_mode"

-- 模块级共享状态(librime-lua 全进程单一 lua_State,故跨 session 共享):
--   last_written: 当前已写入磁盘 / bar 上显示的值,用于去重 + 跨 session 重同步比较。
--   seq:          临时文件名计数器,保证并发 session 各自临时文件名唯一,避免相互覆盖。
local last_written = nil
local seq = 0

-- 确保缓存目录存在
local function ensure_dir()
  os.execute("mkdir -p '" .. CACHE_DIR .. "'")
end

-- 原子写入:先写唯一临时文件,再 os.rename 替换目标。
-- rename 改变父目录 mtime/ctime → kqueue EVFILT_VNODE NOTE_WRITE 即时触发 helper。
-- 去重:值与当前显示一致时直接返回,既省 IO 又避免重复推送事件。
local function write_state(is_ascii)
  local val = is_ascii and "en" or "cn"
  if val == last_written then return end
  seq = seq + 1
  local tmp = STATE .. ".tmp." .. seq
  local f = io.open(tmp, "w")
  if not f then return end
  f:write(val)
  f:close()
  os.rename(tmp, STATE)
  last_written = val
end

function M.init(env)
  ensure_dir()
  -- 连接 option_update_notifier;存入 env 防 GC
  env.ascii_conn = env.engine.context.option_update_notifier:connect(
    function(ctx, name)
      if name == "ascii_mode" then
        write_state(ctx:get_option("ascii_mode"))
      end
    end
  )
  -- 写入基线状态(schema 刚加载时的当前值)
  write_state(env.engine.context:get_option("ascii_mode"))
end

function M.fini(env)
  if env.ascii_conn then
    env.ascii_conn:disconnect()
    env.ascii_conn = nil
  end
end

-- 每次按键廉价重同步,然后透传(不消费按键)。
-- write_state 内有去重,绝大多数按键为无 IO 的空操作;仅当聚焦 session 的真实
-- ascii_mode 与当前显示值不一致(典型:刚 Cmd-Tab 切到另一 App)时才纠正一次。
function M.func(key, env)
  write_state(env.engine.context:get_option("ascii_mode"))
  return 2  -- kNoop:透传给下一个 processor。⚠️ 切勿改为 0(kRejected),见文件头说明。
end

return M
