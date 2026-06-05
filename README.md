# dot-file

个人 dotfiles 仓库，集中管理 **Claude Code**、**Neovim**、**WezTerm**、**Yazi**，以及跨平台平铺窗口管理 —— Windows 用三件套 **komorebi**、**whkd**、**yasb**，macOS 用 **komorebi-for-mac** + **skhd** —— 的配置，便于在多台机器之间同步、备份与回滚。

## 效果展示

![WezTerm 终端效果](wezterm/img/PixPin_2026-04-21_00-51-30.png)

## 目录结构

```
dot-file/
├── claude/               # Claude Code 配置（对应系统目录 ~/.claude/，去掉前导点以便在资源管理器中显示）
│   └── skills/           # 技能包（committing-changes / grill-me / planning-implementation）
├── nvim/                 # Neovim 配置（基于 LazyVim，Lua 模块化）
│   ├── init.lua          # 入口文件，加载 config 模块
│   ├── lua/config/       # 核心配置：lazy.lua（插件管理引导）、options / keymaps / autocmds
│   ├── stylua.toml       # StyLua 格式化规则（2 空格缩进、行宽 120）
│   └── .neoconf.json     # neoconf.nvim / lua_ls LSP 设置
├── wezterm/              # WezTerm 终端模拟器配置（Lua 模块化）
│   ├── wezterm.lua       # 入口文件，组装各子模块
│   ├── appearance.lua    # 配色与窗口外观
│   ├── background.lua    # 背景图片（Weeby.png）
│   ├── font.lua          # 字体与字号
│   ├── keybindings.lua   # 快捷键与鼠标绑定
│   ├── tab_style.lua     # 标签栏样式
│   ├── shell.lua         # 默认 shell 与启动参数
│   ├── domains.lua       # SSH / Unix / WSL 域
│   ├── events.lua        # 自定义事件回调
│   ├── advanced.lua      # 其他高级选项
│   ├── utils/            # 工具模块（平台判断、本机覆盖加载）
│   └── local.lua.example # 本机覆盖配置示例（字号、WSL distro）
├── yazi/                 # Yazi 文件管理器配置
│   ├── yazi.toml         # 主配置（显示隐藏文件、用 Neovim 打开）
│   ├── keymap.toml       # 按键映射
│   ├── theme.toml        # 主题
│   ├── package.toml      # 插件 / flavor 包管理
│   ├── flavors/          # 配色 flavor（catppuccin-mocha）
│   └── plugins/          # 插件（smart-enter）
├── komorebi/             # komorebi 平铺窗口管理器配置（仅 Windows）
│   ├── komorebi.json     # 主配置（BSP 布局、边框、Base16 Ashes 主题、工作区）
│   └── applications.json # 应用特定规则（按应用定制窗口行为）
├── whkd/                 # whkd 热键守护进程配置（仅 Windows）
│   └── whkdrc            # 快捷键绑定（alt 系列，驱动 komorebic）
├── yasb/                 # yasb 状态栏配置（仅 Windows）
│   ├── config.yaml       # 状态栏布局与组件
│   └── styles.css        # 状态栏样式
├── komorebi-for-mac/     # komorebi-for-mac 平铺窗口管理器配置（仅 macOS）
│   ├── komorebi.json     # 主配置（Grid 布局、工作区、应用规则路径）
│   └── applications.json # 应用特定规则（忽略系统应用、Finder/Photos 等定制）
├── skhd/                 # skhd 热键守护进程配置（仅 macOS）
│   └── .skhdrc           # 快捷键绑定（alt 系列，驱动 komorebic）
├── sketchybar/           # sketchybar 状态栏配置（仅 macOS，替代 Windows 的 yasb）
│   ├── sketchybarrc      # SbarLua 引导入口（加载 .so 绑定并构建状态栏）
│   ├── bar / default / colors / icons / settings.lua  # 外观、默认样式、配色、字体尺寸
│   ├── items/            # 各组件（工作区圆点、堆叠图标、时钟、分组胶囊）
│   └── helper/           # C++ event provider（komorebi → sketchybar 事件桥接）
│       ├── main.cpp      # 监听 komorebi socket、解析状态、转图标、mach 推事件
│       ├── Makefile      # 构建脚本（make 生成 komorebi_provider，二进制不入库）
│       └── vendor/       # vendored 头文件（sketchybar.h / mach.h / json.hpp）
├── .gitignore            # 忽略 macOS、编辑器、日志与 Claude 本地状态
└── README.md
```

## 使用方法

仓库本身不执行任何自动化安装。推荐通过**软链接**的方式让系统目录指向本仓库，这样修改即时生效，并能通过 git 追溯历史。

### 1. 克隆仓库

macOS / Linux：

```bash
git clone <your-remote-url> /path/to/dot-file
cd /path/to/dot-file
```

Windows（PowerShell）：

```powershell
git clone <your-remote-url> \path\to\dot-file
cd \path\to\dot-file
```

### 2. 链接 Claude Code Skills 配置

#### macOS / Linux

```bash
[ -e ~/.claude/skills ] && mv ~/.claude/skills ~/.claude/skills.backup.$(date +%s)
ln -s /path/to/dot-file/claude/skills ~/.claude/skills
```

#### Windows

> ⚠️ Windows 创建符号链接需要**管理员权限**，或在「设置 → 系统 → 开发者选项」中开启 **开发者模式**。推荐使用 PowerShell（以管理员身份运行）。

```powershell
$src = "\path\to\dot-file\claude\skills"
$dst = "$env:USERPROFILE\.claude\skills"
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```
CMD（管理员）等价写法：

```cmd
mklink /D "%USERPROFILE%\.claude\skills" "\path\to\dot-file\claude\skills"
```

完成后重启 Claude Code 会话生效。技能目录会被 Claude Code 自动加载，按需调用对应 skill 即可。

### 3. 链接 Neovim 配置

#### macOS / Linux

Neovim 默认在 `~/.config/nvim/` 查找配置：

```bash
mkdir -p ~/.config
[ -e ~/.config/nvim ] && mv ~/.config/nvim ~/.config/nvim.backup.$(date +%s)
ln -s /path/to/dot-file/nvim ~/.config/nvim
```

#### Windows

Neovim 在 Windows 下使用 `%LOCALAPPDATA%\nvim`：

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\nvim"
$dst = "$env:LOCALAPPDATA\nvim"
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mklink /D "%LOCALAPPDATA%\nvim" "\path\to\dot-file\nvim"
```

首次启动 `nvim` 时 lazy.nvim 会自动安装插件，等待安装完成即可。

### 4. 链接 WezTerm 配置

#### macOS / Linux

WezTerm 默认在 `~/.config/wezterm/` 或 `~/.wezterm.lua` 查找配置：

```bash
mkdir -p ~/.config
[ -e ~/.config/wezterm ] && mv ~/.config/wezterm ~/.config/wezterm.backup.$(date +%s)
ln -s /path/to/dot-file/wezterm ~/.config/wezterm
```

#### Windows

WezTerm 在 Windows 下依次查找 `%USERPROFILE%\.wezterm.lua`、`%USERPROFILE%\.config\wezterm\wezterm.lua`、`%APPDATA%\wezterm\wezterm.lua`。推荐链接到 `~\.config\wezterm`：

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\wezterm"
$dst = "$env:USERPROFILE\.config\wezterm"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mkdir "%USERPROFILE%\.config"
mklink /D "%USERPROFILE%\.config\wezterm" "path\to\dot-file\wezterm"
```
重启 WezTerm 或按 `Ctrl+Shift+R` 重新加载配置。

### 5. WezTerm 本机覆盖（每台设备独有的设置）

字号、WSL distro 这种"每台机器最优值不一样"的字段，通过 `wezterm/local.lua` 覆盖。该文件已被 `.gitignore`，不会同步到其他设备。

```bash
# macOS / Linux
cp /path/to/dot-file/wezterm/local.lua.example /path/to/dot-file/wezterm/local.lua

# Windows (PowerShell)
Copy-Item \path\to\dot-file\wezterm\local.lua.example \path\to\dot-file\wezterm\local.lua
```

打开 `wezterm/local.lua` 按本机情况填写：

```lua
return {
    font_size  = 14.0,             -- 字号；nil 用默认
    wsl_distro = "Ubuntu-24.04",   -- WSL distro 名；nil 用 "Ubuntu-22.04"
}
```

### 6. 链接 Yazi 配置

#### macOS / Linux

Yazi 默认在 `~/.config/yazi/` 查找配置：

```bash
mkdir -p ~/.config
[ -e ~/.config/yazi ] && mv ~/.config/yazi ~/.config/yazi.backup.$(date +%s)
ln -s /path/to/dot-file/yazi ~/.config/yazi
```

#### Windows

Yazi 在 Windows 下使用 `%APPDATA%\yazi\config\`：

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\yazi"
$dst = "$env:APPDATA\yazi\config"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mkdir "%APPDATA%\yazi"
mklink /D "%APPDATA%\yazi\config" "\path\to\dot-file\yazi"
```

下次启动 `yazi` 即可加载配置；也可以执行 `yazi --help` 确认安装就绪。

### 7. 链接 komorebi 配置（仅 Windows）

> komorebi、whkd、yasb 是一套协同工作的 Windows 平铺窗口管理工具链：**komorebi** 负责平铺与管理窗口，**whkd** 提供驱动 komorebi 的全局快捷键，**yasb** 显示工作区 / 活动窗口等状态栏信息。三者仅在 Windows 下可用，需配合使用。

与其他工具不同，komorebi 默认从用户主目录读取两个散文件 `%USERPROFILE%\komorebi.json` 和 `%USERPROFILE%\applications.json`（后者路径已在 `komorebi.json` 中写死为 `$Env:USERPROFILE/applications.json`），因此分别为这两个文件创建符号链接：

PowerShell（管理员）：

```powershell
$repo = "\path\to\dot-file"
foreach ($f in "komorebi.json", "applications.json") {
    $dst = "$env:USERPROFILE\$f"
    if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
    New-Item -ItemType SymbolicLink -Path $dst -Target "$repo\komorebi\$f"
}
```

CMD（管理员）：

```cmd
mklink "%USERPROFILE%\komorebi.json" "\path\to\dot-file\komorebi\komorebi.json"
mklink "%USERPROFILE%\applications.json" "\path\to\dot-file\komorebi\applications.json"
```

> 注意：文件符号链接用 `mklink`（不带 `/D`），目录才用 `mklink /D`。链接完成后可执行 `komorebic start --whkd` 启动（whkd 配置见下一节）。

### 8. 链接 whkd 配置（仅 Windows）

whkd 在 `%USERPROFILE%\.config\whkdrc` 查找配置文件（直接位于 `.config` 下，不在子目录中），因此对 `whkdrc` 单个文件创建符号链接：

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\whkd\whkdrc"
$dst = "$env:USERPROFILE\.config\whkdrc"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mkdir "%USERPROFILE%\.config"
mklink "%USERPROFILE%\.config\whkdrc" "\path\to\dot-file\whkd\whkdrc"
```

修改 `whkdrc` 后执行 `komorebic reload-configuration`（或快捷键 `alt + shift + o`）即可重载。

### 9. 链接 yasb 配置（仅 Windows）

yasb 在 `%USERPROFILE%\.config\yasb\` 下查找 `config.yaml` 与 `styles.css`：

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\yasb"
$dst = "$env:USERPROFILE\.config\yasb"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mkdir "%USERPROFILE%\.config"
mklink /D "%USERPROFILE%\.config\yasb" "\path\to\dot-file\yasb"
```

`config.yaml` 中已开启 `watch_config` / `watch_stylesheet`，保存后状态栏会自动重载。

### 10. 链接 komorebi-for-mac 配置（仅 macOS）

> komorebi-for-mac 是 komorebi 在 macOS 上的移植，配合 **skhd**（提供驱动 `komorebic` 的全局快捷键）构成 macOS 下的平铺窗管方案，与 Windows 的 komorebi / whkd / yasb 一一对应。两者仅在 macOS 下可用，需配合使用。

komorebi-for-mac 从 `~/.config/komorebi/` 读取 `komorebi.json` 与 `applications.json`（后者路径已在 `komorebi.json` 中写死为 `$HOME/.config/komorebi/applications.json`）。本仓库的 `komorebi-for-mac/` 目录恰好包含这两个文件，因此直接将整个目录链接到 `~/.config/komorebi`（注意链接目标名为 `komorebi`，而非 `komorebi-for-mac`）：

```bash
mkdir -p ~/.config
[ -e ~/.config/komorebi ] && mv ~/.config/komorebi ~/.config/komorebi.backup.$(date +%s)
ln -s /path/to/dot-file/komorebi-for-mac ~/.config/komorebi
```

修改配置后执行 `komorebic reload-configuration`（或快捷键 `alt + shift + o`）即可重载。

### 11. 链接 skhd 配置（仅 macOS）

skhd 默认从用户主目录读取 `~/.skhdrc`。本仓库的配置文件位于 `skhd/.skhdrc`，对该单个文件创建符号链接：

```bash
[ -e ~/.skhdrc ] && mv ~/.skhdrc ~/.skhdrc.backup.$(date +%s)
ln -s /path/to/dot-file/skhd/.skhdrc ~/.skhdrc
```

skhd 会监听配置文件变化并自动重载，保存 `.skhdrc` 后快捷键即时生效。

### 12. 链接 sketchybar 配置并编译 helper（仅 macOS）

> sketchybar 是 macOS 上的状态栏，配合 komorebi-for-mac 显示工作区圆点与聚焦窗口图标，对应 Windows 的 yasb。配置基于 **SbarLua**（Lua 绑定），komorebi 状态由一个常驻 **C++ event provider**（`helper/komorebi_provider`）经 mach 直接推送，取代了早期的 shell 桥接脚本。

sketchybar 从 `~/.config/sketchybar` 读取配置，将整个目录链接过去：

```bash
mkdir -p ~/.config
[ -e ~/.config/sketchybar ] && mv ~/.config/sketchybar ~/.config/sketchybar.backup.$(date +%s)
ln -s /path/to/dot-file/sketchybar ~/.config/sketchybar
```

helper 的二进制不入库，需本地编译一次（依赖均为 macOS 自带：Xcode Command Line Tools 的 `clang++`、CoreFoundation / CoreGraphics / ImageIO 框架；第三方头文件已 vendored，无需联网）：

```bash
cd ~/.config/sketchybar/helper
make
```

编译产物为 `helper/komorebi_provider` 与 `helper/rime_provider`（后者供下一节「鼠须管中英文状态」使用，由 `make` 一并构建）。sketchybar 启动/重载时，lua 会自动干净重启相应 helper（先 `killall` 再启动），因此 `make` 完成后执行 `sketchybar --reload`（或 `brew services restart sketchybar`）即可生效。修改 C++ 源码后需重新 `make` 并 `sketchybar --reload`。

### 13. 链接鼠须管（Squirrel/Rime）中英文状态导出配置（仅 macOS）

> 在 sketchybar 上显示鼠须管**内部** `ascii_mode`（中文 / 西文）状态——取自输入法运行时的真实内部状态，而非 macOS 输入源切换。原理：一个 librime-lua processor（`lua/ascii_mode_export.lua`）通过 `option_update_notifier` 捕获 `ascii_mode` 变化并原子写入 `~/.cache/rime/ascii_mode`，上一节的 `rime_provider` helper 经 kqueue 监听该文件并经 mach 推送 `rime_ascii_mode_change` 事件给 sketchybar 的 `items/rime.lua` 指示器。

鼠须管的 `~/Library/Rime` 目录含词库、用户词典、语言模型与部署产物，不整目录入库；仅对下列 3 个配置文件创建单文件软链接：

```bash
mkdir -p ~/Library/Rime/lua
for f in rime.lua rime_ice.custom.yaml lua/ascii_mode_export.lua; do
  [ -e ~/Library/Rime/$f ] && [ ! -L ~/Library/Rime/$f ] && mv ~/Library/Rime/$f ~/Library/Rime/$f.backup.$(date +%s)
  ln -sfn /path/to/dot-file/rime/$f ~/Library/Rime/$f
done
```

链接后右键菜单栏鼠须管图标 →「重新部署」（或执行 `"/Library/Input Methods/Squirrel.app/Contents/MacOS/Squirrel" --reload`）加载 processor；再确保已按上一节 `make` 出 `rime_provider` 并 `sketchybar --reload`。切换中英文（Caps Lock / Shift）时状态栏即时跟随。

> `rime_ice.custom.yaml` 是雾凇拼音（rime_ice）方案的 patch 文件，仅在使用该方案时生效；若改用其他方案，需把其中 `engine/processors/@before 0: lua_processor@ascii_mode_export` 这条 patch 同样加到对应方案的 `*.custom.yaml`。

## 更新与回滚

```bash
# macOS / Linux
cd /path/to/dot-file
git pull                # 拉取最新配置
git log --oneline -20   # 查看近期改动
git revert <commit>     # 回滚某次变更
```

```powershell
# Windows（PowerShell）
cd \path\to\dot-file
git pull
git log --oneline -20
git revert <commit>
```

由于系统目录是软链接，`git` 操作结果立刻对 Claude Code、Neovim、WezTerm、Yazi，以及 Windows 的 komorebi、whkd、yasb 和 macOS 的 komorebi-for-mac、skhd、sketchybar、鼠须管中英文状态导出生效，无需重新安装（注意 sketchybar 的 C++ helper 在源码变更后需重新 `make`）。

