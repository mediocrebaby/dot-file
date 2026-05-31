# dot-file

个人 dotfiles 仓库，集中管理 **Claude Code**、**Neovim**、**WezTerm** 与 **Yazi** 的配置，便于在多台机器之间同步、备份与回滚。

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

由于系统目录是软链接，`git` 操作结果立刻对 Claude Code、Neovim、WezTerm 与 Yazi 生效，无需重新安装。

