# dot-file

个人 dotfiles 仓库，集中管理 **Claude Code** 与 **WezTerm** 的配置，便于在多台机器之间同步、备份与回滚。

## 效果展示

![WezTerm 终端效果](wezterm/img/PixPin_2026-04-21_00-51-30.png)

## 目录结构

```
dot-file/
├── claude/               # Claude Code 配置（对应系统目录 ~/.claude/，去掉前导点以便在资源管理器中显示）
│   └── skills/           # 技能包（CodeStable cs-* 工作流 + Obsidian / Office / 工具类）
├── wezterm/              # WezTerm 终端模拟器配置（Lua 模块化）
│   ├── wezterm.lua       # 入口文件，组装各子模块
│   ├── appearance.lua    # 配色与窗口外观
│   ├── background.lua    # 背景图片（back.jpg）
│   ├── font.lua          # 字体与字号
│   ├── keybindings.lua   # 快捷键与鼠标绑定
│   ├── tab_style.lua     # 标签栏样式
│   ├── shell.lua         # 默认 shell 与启动参数
│   ├── domains.lua       # SSH / Unix / WSL 域
│   ├── events.lua        # 自定义事件回调
│   └── advanced.lua      # 其他高级选项
├── .gitignore            # 忽略 macOS、编辑器、日志与 Claude 本地状态
└── README.md
```

## 使用方法

仓库本身不执行任何自动化安装。推荐通过**软链接**的方式让系统目录指向本仓库，这样修改即时生效，并能通过 git 追溯历史。

### 1. 克隆仓库

macOS / Linux：

```bash
git clone <your-remote-url> ~/Documents/Code/dot-file
cd ~/Documents/Code/dot-file
```

Windows（PowerShell）：

```powershell
git clone <your-remote-url> $env:USERPROFILE\Code\dot-file
cd $env:USERPROFILE\Code\dot-file
```

### 2. 链接 Claude Code 配置

#### macOS / Linux

如果 `~/.claude` 已存在，先备份：

```bash
[ -e ~/.claude ] && mv ~/.claude ~/.claude.backup.$(date +%s)
ln -s ~/Documents/Code/dot-file/claude ~/.claude
```

或仅链接子项（推荐，避免覆盖本地凭据 `.credentials.json` 与历史会话）：

```bash
mkdir -p ~/.claude
ln -sfn ~/Documents/Code/dot-file/claude/skills ~/.claude/skills
```

> 注：仓库内目录命名为 `claude/`（无前导点），便于在资源管理器 / Finder 中浏览；链接目标仍指向系统约定的 `~/.claude/`。

#### Windows

> ⚠️ Windows 创建符号链接需要**管理员权限**，或在「设置 → 系统 → 开发者选项」中开启 **开发者模式**。推荐使用 PowerShell（以管理员身份运行）。

整目录链接（首次使用、无本地凭据时）：

```powershell
$src = "$env:USERPROFILE\Code\dot-file\claude"
$dst = "$env:USERPROFILE\.claude"
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

仅链接子项（推荐，保留本地 `.credentials.json`、`projects/`、`todos/` 等）：

```powershell
$repo = "$env:USERPROFILE\Code\dot-file\claude"
$home_claude = "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force -Path $home_claude | Out-Null

New-Item -ItemType SymbolicLink -Force -Path "$home_claude\skills" -Target "$repo\skills"
```

CMD（管理员）等价写法：

```cmd
mklink /D "%USERPROFILE%\.claude\skills" "%USERPROFILE%\Code\dot-file\claude\skills"
```

完成后重启 Claude Code 会话生效。技能目录会被 Claude Code 自动加载，按需调用对应 skill 即可（详见下文「Claude Code 配置要点」）。

### 3. 链接 WezTerm 配置

#### macOS / Linux

WezTerm 默认在 `~/.config/wezterm/` 或 `~/.wezterm.lua` 查找配置：

```bash
mkdir -p ~/.config
[ -e ~/.config/wezterm ] && mv ~/.config/wezterm ~/.config/wezterm.backup.$(date +%s)
ln -s ~/Documents/Code/dot-file/wezterm ~/.config/wezterm
```

#### Windows

WezTerm 在 Windows 下依次查找 `%USERPROFILE%\.wezterm.lua`、`%USERPROFILE%\.config\wezterm\wezterm.lua`、`%APPDATA%\wezterm\wezterm.lua`。推荐链接到 `~\.config\wezterm`：

PowerShell（管理员）：

```powershell
$src = "$env:USERPROFILE\Code\dot-file\wezterm"
$dst = "$env:USERPROFILE\.config\wezterm"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mkdir "%USERPROFILE%\.config"
mklink /D "%USERPROFILE%\.config\wezterm" "%USERPROFILE%\Code\dot-file\wezterm"
```

重启 WezTerm 或按 `Ctrl+Shift+R` 重新加载配置。

### 4. 本机覆盖（每台设备独有的设置）

字号、WSL distro 这种"每台机器最优值不一样"的字段，通过 `wezterm/local.lua` 覆盖。该文件已被 `.gitignore`，不会同步到其他设备。

```bash
# macOS / Linux
cp ~/Documents/Code/dot-file/wezterm/local.lua.example ~/Documents/Code/dot-file/wezterm/local.lua

# Windows (PowerShell)
Copy-Item $env:USERPROFILE\Code\dot-file\wezterm\local.lua.example $env:USERPROFILE\Code\dot-file\wezterm\local.lua
```

打开 `wezterm/local.lua` 按本机情况填写：

```lua
return {
    font_size  = 14.0,             -- 字号；nil 用默认
    wsl_distro = "Ubuntu-24.04",   -- WSL distro 名；nil 用 "Ubuntu-22.04"
}
```

未来想新增可覆盖字段：在对应模块（如 `appearance.lua`）里 `require('utils.local_config')` 后读取即可，无需改加载机制。

## Claude Code 配置要点

本仓库目前只维护 `claude/skills/` 一个目录——不再附带 `CLAUDE.md`、`agents/`、`hooks/`、`scripts/` 这些 OMC（oh-my-claudecode）框架产物，所有自动化交给 Claude Code 原生 skill 机制按描述触发。

### CodeStable 工作流（cs-*）

围绕"想法 → 方案 → 实现 → 验收"的工程闭环，把开发过程中的隐性思路沉淀成可检索的文档：

- **新功能**：`cs-feat`（路由）→ `cs-brainstorm` / `cs-feat-design` / `cs-feat-impl` / `cs-feat-accept`，小改动走 `cs-feat-ff` 快速通道。
- **修 Bug**：`cs-issue`（路由）→ `cs-issue-report` / `cs-issue-analyze` / `cs-issue-fix`。
- **重构**：`cs-refactor`，小范围用 `cs-refactor-ff`。
- **架构与需求档案**：`cs-arch`（系统现状）、`cs-req`（用户故事 / 边界）、`cs-roadmap`（大需求拆解）。
- **知识沉淀**：`cs-decide`（技术决策 / ADR）、`cs-learn`（坑点与最佳实践）、`cs-trick`（可复用模式 / 库用法）、`cs-explore`（仓库探索结果）。
- **文档与初始化**：`cs-guide`（开发者 / 用户指南）、`cs-libdoc`（API 参考）、`cs-onboard`（新仓库接入 CodeStable）。

### 其他常用技能

- **Obsidian**：`obsidian-markdown`、`obsidian-cli`、`obsidian-bases`、`json-canvas`、`defuddle`（网页正文抽取）。
- **Office 文档**：`docx`、`xlsx`、`pptx`。
- **工具类**：`git-commit`（Conventional Commit 生成）、`skill-creator`（创建 / 优化 skill）、`learner`（从对话中提取技能）。

### 禁止提交项

`.gitignore` 已排除：`settings.local.json`、`projects/`、`todos/`、`shell-snapshots/`、`memory/`、`.credentials.json` 等本地状态与敏感数据。

## WezTerm 快捷键速查

`Leader` 为 `Ctrl+A`（1500 ms 超时），默认键位被禁用，仅保留下列自定义绑定：

| 快捷键 | 功能 |
| --- | --- |
| `F11` | 切换全屏 |
| `Leader + m` | 隐藏窗口 |
| `Leader + n` | 新建居中窗口 |
| `Leader + w` | 关闭当前标签页（不确认） |
| `Leader + Tab` | 切换到下一个标签页 |
| `Alt + 1…9` | 直接跳到第 N 个标签页 |
| `Leader + -` / `\` | 垂直 / 水平分割窗格 |
| `Leader + ←↓↑→` | 在窗格间移动 |
| `Ctrl+Shift + ←↓↑→` | 调整窗格大小 |
| `Ctrl+Shift + w` | 关闭当前窗格 |
| `Leader + t` | 切换标签栏显隐 |
| `Leader + f` | 搜索 |
| `Leader + p` | 命令面板（Launcher） |
| `Leader + k` | 清空滚动缓冲区 |
| `Leader + Home` / `End` | 滚动到顶部 / 底部 |
| `Ctrl + v` | 粘贴 |
| 左键拖选 | 自动复制到剪贴板 |
| 右键单击 | 粘贴 |
| `Ctrl+Alt` + 左键拖动 | 拖动窗口 |
| `Ctrl` + 左键点击链接 | 打开链接 |

模块化设计使得自定义很容易：改外观编辑 `appearance.lua`，改字体改 `font.lua`，改快捷键改 `keybindings.lua`，无需触碰入口 `wezterm.lua`。

## 更新与回滚

```bash
# macOS / Linux
cd ~/Documents/Code/dot-file
git pull                # 拉取最新配置
git log --oneline -20   # 查看近期改动
git revert <commit>     # 回滚某次变更
```

```powershell
# Windows（PowerShell）
cd $env:USERPROFILE\Code\dot-file
git pull
git log --oneline -20
git revert <commit>
```

由于系统目录是软链接，`git` 操作结果立刻对 Claude Code 与 WezTerm 生效，无需重新安装。

## 注意事项

- 不要将 `~/.claude/.credentials.json`、`settings.local.json`、`projects/`、`memory/` 等本地状态提交到仓库；`.gitignore` 已覆盖这些路径。
- WezTerm 背景图 `back.jpg` 较大（≈230 KB），如需更换请直接替换同名文件。
- 旧版的 `CLAUDE.md`、`agents/`、`hooks/`、`scripts/` 已从仓库移除——若旧的 `~/.claude/` 中还有指向这些路径的符号链接，请手动清理（删除断链即可，不影响 `skills/` 软链）。
