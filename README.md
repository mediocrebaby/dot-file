# dot-file

个人 dotfiles 仓库，集中管理 **pi 编码代理**（扩展与技能）、**Neovim**、**WezTerm** 的配置，便于在多台机器之间同步、备份与回滚。

## 效果展示

![WezTerm 终端效果](wezterm/img/PixPin_2026-04-21_00-51-30.png)

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

### 2. 链接 pi 扩展目录

pi 会在启动时扫描 `~/.pi/agent/extensions/` 下的每个子目录并加载其扩展。将本仓库 `pi/extensions` 链接过去即可让所有扩展一次生效。

#### macOS / Linux

```bash
mkdir -p ~/.pi/agent
[ -e ~/.pi/agent/extensions ] && mv ~/.pi/agent/extensions ~/.pi/agent/extensions.backup.$(date +%s)
ln -s /path/to/dot-file/pi/extensions ~/.pi/agent/extensions
```

#### Windows

> ⚠️ Windows 创建符号链接需要**管理员权限**，或在「设置 → 系统 → 开发者选项」中开启 **开发者模式**。推荐使用 PowerShell（以管理员身份运行）。

```powershell
$src = "\path\to\dot-file\pi\extensions"
$dst = "$env:USERPROFILE\.pi\agent\extensions"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）等价写法：

```cmd
mklink /D "%USERPROFILE%\.pi\agent\extensions" "\path\to\dot-file\pi\extensions"
```

#### 安装扩展依赖

`filechanges` 与 `web-fetch` 依赖 npm 包（如 `diff`、`@mozilla/readability`、`linkedom`、`turndown`、`unpdf`），`node_modules` 已被 `.gitignore`，需要在各自目录里跑一次 `npm install`：

```bash
cd pi/extensions/filechanges && npm install
cd ../web-fetch && npm install
```

其余扩展（`pi-notify`、`pi-provider-qoder`、`pi-system-prompt`、`prompt-history`、`web-search`）纯 TypeScript，无外部依赖，链接完就能用。

完成后在 pi 中执行 `/reload`（或重启会话）生效。Qoder provider 首次使用需运行 `/login qoder`（全球）或 `/login qoder-cn`（国内）；详见 `pi/extensions/pi-provider-qoder/README.md`。

### 3. 链接 pi 技能目录

pi 在 `~/.pi/agent/skills/` 下加载技能，每个子目录一个 `SKILL.md`。将本仓库 `pi/skills` 链接过去：

#### macOS / Linux

```bash
[ -e ~/.pi/agent/skills ] && mv ~/.pi/agent/skills ~/.pi/agent/skills.backup.$(date +%s)
ln -s /path/to/dot-file/pi/skills ~/.pi/agent/skills
```

#### Windows

PowerShell（管理员）：

```powershell
$src = "\path\to\dot-file\pi\skills"
$dst = "$env:USERPROFILE\.pi\agent\skills"
if (Test-Path $dst) { Rename-Item $dst "$dst.backup.$(Get-Date -UFormat %s)" }
New-Item -ItemType SymbolicLink -Path $dst -Target $src
```

CMD（管理员）：

```cmd
mklink /D "%USERPROFILE%\.pi\agent\skills" "\path\to\dot-file\pi\skills"
```

技能目录会被 pi 自动扫描，按 `SKILL.md` 中的 `description` 匹配任务时自动加载，或由用户显式触发（如 `/grill-me`、`/handoff`）。

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

由于系统目录是软链接，`git` 操作结果立刻对 pi 扩展 / 技能、Neovim、WezTerm 生效，无需重新安装。如果 `pi/extensions/filechanges` 或 `pi/extensions/web-fetch` 的 `package.json` 有变动，记得再跑一次 `npm install`。
