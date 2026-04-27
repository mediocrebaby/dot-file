local wezterm = require('wezterm')
local M = {}

--- Cells 工具类 (用于构建格式化文本) ---
local Cells = {}
Cells.__index = Cells

function Cells:new()
	return setmetatable({ segments = {} }, self)
end

function Cells:add_segment(segment_id, text, color, attributes)
	color = color or {}
	local items = {}
	if color.bg then
		table.insert(items, { Background = { Color = color.bg } })
	end
	if color.fg then
		table.insert(items, { Foreground = { Color = color.fg } })
	end
	if attributes and #attributes > 0 then
		for _, attr in ipairs(attributes) do
			table.insert(items, attr)
		end
	end
	table.insert(items, { Text = text })
	table.insert(items, "ResetAttributes")
	self.segments[segment_id] = {
		items = items,
		has_bg = color.bg ~= nil,
		has_fg = color.fg ~= nil,
	}
	return self
end

function Cells:update_segment_text(segment_id, text)
	local idx = #self.segments[segment_id].items - 1
	self.segments[segment_id].items[idx] = { Text = text }
	return self
end

function Cells:update_segment_colors(segment_id, color)
	local has_bg = self.segments[segment_id].has_bg
	local has_fg = self.segments[segment_id].has_fg
	if color.bg and has_bg then
		self.segments[segment_id].items[1] = { Background = { Color = color.bg } }
	end
	if color.fg then
		local fg_idx = has_bg and 2 or 1
		if has_fg then
			self.segments[segment_id].items[fg_idx] = { Foreground = { Color = color.fg } }
		end
	end
	return self
end

function Cells:render(ids)
	local cells = {}
	for _, id in ipairs(ids) do
		for _, item in pairs(self.segments[id].items) do
			table.insert(cells, item)
		end
	end
	return cells
end

--- 自定义标签页样式 (圆角药丸形状) ---
local nf = wezterm.nerdfonts
local GLYPH_SCIRCLE_LEFT  = nf.ple_left_half_circle_thick
local GLYPH_SCIRCLE_RIGHT = nf.ple_right_half_circle_thick
local GLYPH_CIRCLE = nf.fa_circle
local GLYPH_ADMIN  = nf.md_shield_half_full
local GLYPH_LINUX  = nf.cod_terminal_linux

local TAB_TITLE_INSET = 4

local tab_title_colors = {
  text_default = { bg = '#45475A', fg = '#1C1B19' },
  text_hover = { bg = '#7188b0', fg = '#1C1B19' },
  text_active = { bg = '#89b4fa', fg = '#11111B' },
  scircle_default = { bg = 'rgba(0, 0, 0, 0.4)', fg = '#45475A' },
  scircle_hover = { bg = 'rgba(0, 0, 0, 0.4)', fg = '#7188b0' },
  scircle_active = { bg = 'rgba(0, 0, 0, 0.4)', fg = '#89b4fa' },
}

local function clean_process_name(proc)
	local a = string.gsub(proc, "(.*[/\\])(.*)", "%2")
	return a:gsub("%.exe$", "")
end

local function create_tab_title(process_name, base_title, max_width, inset)
	local title = base_title
	if not title or title == "" then
		title = process_name
	end
	local available_width = max_width - inset
	if wezterm.column_width(title) > available_width then
		local truncated = ""
		for _, char in utf8.codes(title) do
			local next_str = truncated .. utf8.char(char)
			if wezterm.column_width(next_str) > available_width then
				break
			end
			truncated = next_str
		end
		title = truncated
	end
	return title
end

function M.setup()
	wezterm.on("format-tab-title", function(tab, tabs, panes, config_obj, hover, max_width)
		local process_name = clean_process_name(tab.active_pane.foreground_process_name)
		local is_wsl   = process_name:match("^wsl") ~= nil
		local is_admin = (tab.active_pane.title:match("^Administrator: ") or tab.active_pane.title:match("(Admin)")) ~= nil
		local inset    = (is_admin or is_wsl) and 6 or TAB_TITLE_INSET
		local title    = create_tab_title(process_name, tab.active_pane.title, max_width, inset)

		local tab_state = "default"
		if tab.is_active then
			tab_state = "active"
		elseif hover then
			tab_state = "hover"
		end

		local cells = Cells:new()
		cells
			:add_segment("scircle_left", GLYPH_SCIRCLE_LEFT, tab_title_colors["scircle_" .. tab_state])
			:add_segment("admin",  " " .. GLYPH_ADMIN, tab_title_colors["text_" .. tab_state])
			:add_segment("wsl",    " " .. GLYPH_LINUX, tab_title_colors["text_" .. tab_state])
			:add_segment("title",  " " .. title,        tab_title_colors["text_" .. tab_state],
				{ { Attribute = { Intensity = "Bold" } } })
			:add_segment("padding", " ",                tab_title_colors["text_" .. tab_state])
			:add_segment("scircle_right", GLYPH_SCIRCLE_RIGHT, tab_title_colors["scircle_" .. tab_state])

		local render_order
		if is_admin then
			render_order = { "scircle_left", "admin",  "title", "padding", "scircle_right" }
		elseif is_wsl then
			render_order = { "scircle_left", "wsl",    "title", "padding", "scircle_right" }
		else
			render_order = { "scircle_left", "title",  "padding", "scircle_right" }
		end

		return cells:render(render_order)
	end)
end

return M
