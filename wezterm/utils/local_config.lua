local M = {}

local ok, loaded = pcall(require, 'local')
if ok and type(loaded) == 'table' then
	for k, v in pairs(loaded) do
		M[k] = v
	end
end

return M
