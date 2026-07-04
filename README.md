# dot-file

个人 dotfiles 仓库，集中管理 **Claude Code**（skills 与 ccstatusline）、**Neovim**、**WezTerm**，以及 Windows 平铺窗口管理三件套 **komorebi**、**whkd**、**yasb** 的配置，便于在多台机器之间同步、备份与回滚。

## 效果展示

![WezTerm 终端效果](wezterm/img/PixPin_2026-04-21_00-51-30.png)

## 目录结构

```
dot-file/
├── claude/               # Claude Code 配置（对应系统目录 ~/.claude/，去掉前导点以便在资源管理器中显示）
│   ├── ccstatusline/     # ccstatusline 状态栏配置（模型、git 信息、上下文 / 用量进度、重置倒计时）
│   │   └── settings.json # 状态栏布局与显示选项
│   └── skills/           # 技能包（coder / committing-changes / grill-me / grill-with-doc / codebase-memory）
│       ├── codebase-memory/      # 使用代码库知识图谱进行结构化代码查询、调用追踪、影响分析
│       ├── coder/                # 编码行为准则：避免过度设计、外科手术式改动、显式陈述假设、定义可验证的成功标准
│       ├── committing-changes/   # 分析 git 改动并生成提交
│       ├── grill-me/             # 对模糊需求进行严格盘问，达成共识
│       └── grill-with-doc/       # 结合领域模型 / 文档压力测试计划（含 CONTEXT.md、ADR 格式模板）
├── nvim/                 # Neovim 配置（基于 LazyVim，Lua 模块化）
│   ├── init.lua          # 入口文件，加载 config.lazy
│   ├── lua/config/       # 核心配置：lazy.lua（插件引导 + 按需加载 dotnet extra）、options / keymaps / autocmds
│   ├── lua/plugins/      # 自定义插件覆盖：claudecode / colorscheme(tokyonight) / markdown(markview) / oil
│   ├── lua/utils/        # 工具模块：platform.lua（判断 Windows/macOS/Linux/WSL、探测可执行命令）
│   ├── snippets/         # 个人代码片段（friendly-snippets 格式，当前含 markdown）
│   ├── stylua.toml       # StyLua 格式化规则（2 空格缩进、行宽 120）
│   ├── .neoconf.json     # neoconf.nvim / lua_ls LSP 设置
│   └── .gitignore        # 忽略 lazy-lock.json / lazyvim.json 等各机各异、不宜共享的文件
├── wezterm/              # WezTerm 终端模拟器配置（Lua 模块化）
│   ├── wezterm.lua       # 入口文件，组装各子模块
│   ├── appearance.lua    # 配色与窗口外观
│   ├── background.lua    # 背景图片
│   ├── font.lua          # 字体与字号
│   ├── keybindings.lua   # 快捷键与鼠标绑定
│   ├── shell.lua         # 默认 shell 与启动参数
│   ├── domains.lua       # SSH / Unix / WSL 域
│   ├── events.lua        # 自定义事件回调
│   ├── advanced.lua      # 其他高级选项
│   ├── utils/            # 工具模块（platform 平台判断、local_config 本机覆盖加载）
│   ├── img/              # 效果图等静态资源
│   └── local.lua.example # 本机覆盖配置示例（字号、WSL distro）
├── komorebi/             # komorebi 平铺窗口管理器配置（仅 Windows）
│   ├── komorebi.json     # 主配置（BSP 布局、边框、工作区、窗口动画）
│   └── applications.json # 应用特定规则（按应用定制窗口行为）
├── whkd/                 # whkd 热键守护进程配置（仅 Windows）
│   └── whkdrc            # 快捷键绑定（alt 系列，驱动 komorebic）
├── yasb/                 # yasb 状态栏配置（仅 Windows）
│   ├── config.yaml       # 状态栏布局与组件
│   └── styles.css        # 状态栏样式
├── .gitattributes        # 强制文本文件以 LF 入库，避免多机换行符 diff
├── .gitignore            # 忽略 macOS、编辑器、日志、本机覆盖、.spec 与内置 / 不通用 skill 等文件
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

Claude Code 在 `~/.claude/skills/` 下加载技能。将本仓库 `claude/skills` 链接过去：

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

### 3. 链接 Claude Code ccstatusline 配置

`ccstatusline` 的配置位于 `~/.claude/ccstatusline/settings.json`。将本仓库 `claude/ccstatusline` 链接过去后，状态栏会显示当前模型、git 仓库 / 分支 / 改动数量、上下文用量、会话 / 周用量进度与重置倒计时。

#### macOS / Linux

```bash
[ -e ~/.claude/ccstatusline ] && mv ~/.claude/ccstatusline ~/.claude/ccstatusline.backup.$(date +%s)
ln -s /path/to/dot-file/claude/ccstatusline ~/.claude/ccstatusline
```

#### Windows

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\claude\ccstatusline"
$dst = "$env:USERPROFILE\.claude\ccstatusline"
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mklink /D "%USERPROFILE%\.claude\ccstatusline" "\path\to\dot-file\claude\ccstatusline"
```

完成后重启 Claude Code 会话，或重新加载 `ccstatusline`。

### 4. 链接 Neovim 配置

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

首次启动 `nvim` 时 lazy.nvim 会自动安装插件，等待安装完成即可。C#（.NET）相关扩展仅在检测到系统存在 `dotnet` 命令时才加载，未装 .NET SDK 的机器会静默跳过。`lazy-lock.json`、`lazyvim.json` 各机各异，已在 `nvim/.gitignore` 中忽略，不随仓库同步。

### 5. 链接 WezTerm 配置

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

### 6. WezTerm 本机覆盖（每台设备独有的设置）

字号、WSL distro 这种“每台机器最优值不一样”的字段，通过 `wezterm/local.lua` 覆盖（`wezterm/utils/local_config.lua` 会尝试加载它，缺失时静默跳过）。该文件已被 `.gitignore`，不会同步到其他设备。

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
    wsl_distro = "Ubuntu-24.04",   -- WSL distro 名；nil 用默认
}
```

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

由于系统目录是软链接，`git` 操作结果立刻对 Claude Code skills / ccstatusline、Neovim、WezTerm，以及 Windows 的 komorebi、whkd、yasb 生效，无需重新安装。
