-- Nerd Font 图标字形(FiraCode Nerd Font)。集中管理便于统一替换。
-- 若某图标显示为方块,说明该字体不含该字形,换用其它 codepoint。
return {
  cpu      = "\u{f4bc}",  -- nf-oct-cpu(芯片)
  memory   = "\u{e266}",  -- nf-fae-chip(内存条,与 CPU 芯片区分)
  wifi     = "\u{f05a9}", -- nf-md-wifi
  wifi_off = "\u{f05aa}", -- nf-md-wifi-off
  volume = {
    high  = "\u{f057e}",  -- nf-md-volume-high
    mid   = "\u{f0580}",  -- nf-md-volume-medium
    low   = "\u{f057f}",  -- nf-md-volume-low
    muted = "\u{f0581}",  -- nf-md-volume-mute
  },
}
