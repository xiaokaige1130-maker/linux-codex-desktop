# Linux Codex Desktop 集成工作区

> 非官方 Linux Codex Desktop 集成项目。目标是在 Linux 桌面上尽量接近官方 Windows/macOS Codex Desktop 的使用体验。

![项目架构](docs/images/architecture.svg)

## 项目定位

这个仓库不是 OpenAI 官方项目，也不分发 OpenAI Codex Desktop 的二进制文件。它是一个 Linux 本地集成工作区，主要做三件事：

- 复用公开 upstream 项目，把官方桌面应用在本机转换成可运行的 Linux Electron 应用。
- 配置 Linux Computer Use、桌面控制、浏览器控制等 Linux 侧能力。
- 沉淀后续扩展层，比如项目记忆、MCP 配置、会话摘要和 Linux 专用诊断工具。

当前第一阶段使用 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux) 作为基础 upstream。该项目已经实现了从官方 macOS `Codex.dmg` 转换为 Linux Electron app 的主要流程，并提供 Linux 打包、启动脚本和 Computer Use 后端。

## 重要声明

本仓库只发布集成脚本、说明文档和本地配置工具，不发布以下内容：

- `Codex.dmg`
- 解包/生成后的 `codex-app/`
- `.deb`、`.rpm`、`.pkg.tar.zst`、`.AppImage` 等安装包
- 任何 OpenAI 官方应用二进制、图标资源或受限资产

如果你 clone 本仓库，需要在自己的机器上运行构建脚本，由 upstream wrapper 在本地下载并转换所需资源。

## 已实现能力

- Linux 桌面应用启动，而不是只使用终端 CLI。
- 复用官方 Codex Desktop 的主体验。
- 支持通过本地配置启用 Linux Computer Use UI。
- 支持中文/英文/自动检测语言切换。
- 提供 `doctor` 诊断脚本，检查系统环境、依赖、Computer Use、语言设置和发布安全边界。
- 通过 submodule/checkout 方式复用 `codex-desktop-linux` upstream。
- 避免把官方 DMG、生成应用和安装包提交到 GitHub。

## 当前测试环境

本项目目前在以下环境做过本地测试：

- Ubuntu 24.04
- GNOME / X11
- Rust stable
- Electron 生成应用
- `/dev/uinput` 已配置为 `root:input 0660`
- GNOME 窗口定位扩展已安装
- 中文界面通过 `localeOverride: "zh-CN"` 验证可用

不同发行版、Wayland、KDE、原子桌面和其他窗口管理器可能需要额外验证。

## 快速开始

克隆仓库后，先检查本机状态：

```bash
./scripts/doctor.sh
```

准备 Linux 输入权限：

```bash
./scripts/configure-linux-input.sh
```

> 执行后建议注销并重新登录，让桌面应用继承新的 `input` 组权限。

拉取/准备 upstream：

```bash
./scripts/bootstrap-upstream.sh
```

构建生成 Linux Electron app：

```bash
./scripts/build-upstream-app.sh
```

运行应用：

```bash
./scripts/run-upstream-app.sh
```

安装成真正的桌面应用：

```bash
./scripts/install-desktop-app.sh
```

安装后会写入：

```text
~/.local/share/applications/codex-desktop.desktop
~/.local/share/icons/hicolor/256x256/apps/codex-desktop.png
~/.local/bin/codex-desktop
```

之后可以从系统应用菜单搜索 `Codex Desktop` / `Codex 桌面版` 启动，也可以运行：

```bash
gtk-launch codex-desktop
```

## 中文和语言切换

本项目提供一个小脚本修改本地 Codex Desktop 设置文件：

```bash
./scripts/set-language.sh zh-CN
```

切回英文：

```bash
./scripts/set-language.sh en
```

恢复自动检测：

```bash
./scripts/set-language.sh auto
```

配置文件位置：

```text
~/.config/codex-desktop/settings.json
```

设置项示例：

```json
{
  "codex-linux-computer-use-ui-enabled": true,
  "localeOverride": "zh-CN"
}
```

修改语言后需要重启应用。

## Computer Use UI

启用 Linux Computer Use UI：

```bash
./scripts/enable-computer-use-ui.sh
```

该脚本会保留已有配置，只补充：

```json
{
  "codex-linux-computer-use-ui-enabled": true
}
```

如果需要检查状态：

```bash
./scripts/doctor.sh
```

## 构建流程

![构建流程](docs/images/build-flow.svg)

构建过程大致如下：

1. 准备本地 Linux 环境和必要依赖。
2. 拉取 `ilysenko/codex-desktop-linux`。
3. 下载或复用本地缓存的 `Codex.dmg`。
4. 解包官方桌面应用资源。
5. 应用 Linux 适配补丁。
6. 重建 Linux Electron 运行所需模块。
7. 生成 `codex-app/`。
8. 本地运行或继续生成安装包。

## 目录结构

```text
.
├── docs/
│   ├── architecture.md
│   ├── goal.md
│   ├── upstreams.md
│   └── images/
├── scripts/
│   ├── bootstrap-upstream.sh
│   ├── build-upstream-app.sh
│   ├── check-host.sh
│   ├── configure-linux-input.sh
│   ├── doctor.sh
│   ├── enable-computer-use-ui.sh
│   ├── run-upstream-app.sh
│   └── set-language.sh
├── upstream/
│   └── codex-desktop-linux
├── LICENSE
├── NOTICE
└── README.md
```

## 常用脚本

| 脚本 | 作用 |
|---|---|
| `scripts/doctor.sh` | 本机环境、依赖、Computer Use 和发布安全检查 |
| `scripts/check-host.sh` | 兼容入口，实际调用 `doctor.sh` |
| `scripts/configure-linux-input.sh` | 配置 `/dev/uinput` 和 `input` 用户组 |
| `scripts/bootstrap-upstream.sh` | 准备 upstream checkout/submodule |
| `scripts/build-upstream-app.sh` | 构建生成 Linux Electron app |
| `scripts/run-upstream-app.sh` | 运行生成后的 app |
| `scripts/install-desktop-app.sh` | 安装用户级桌面应用入口和 Codex 图标 |
| `scripts/enable-computer-use-ui.sh` | 启用 Linux Computer Use UI |
| `scripts/set-language.sh` | 设置中文、英文或自动检测语言 |

## 发布安全

本仓库的 `.gitignore` 会过滤常见敏感/生成产物：

- `upstream/codex-desktop-linux/Codex.dmg`
- `upstream/codex-desktop-linux/Codex.dmg.metadata`
- `upstream/codex-desktop-linux/codex-app/`
- `upstream/codex-desktop-linux/dist/`
- `upstream/codex-desktop-linux/target/`
- `*.deb`
- `*.rpm`
- `*.pkg.tar.zst`
- `*.AppImage`

发布前建议执行：

```bash
./scripts/doctor.sh
git status --ignored --short
git ls-files
```

确认不会把官方二进制、生成应用、安装包或缓存文件提交到远端。

## 后续优化方向

- 验证 `.deb` / `.rpm` / AppImage 打包和安装。
- 增加项目记忆、会话摘要和本地偏好持久化。
- 自动识别项目技术栈、包管理器、测试命令。
- 生成 MCP/plugin 配置。
- 增强 X11/Wayland 桌面控制兜底。
- 补充更多发行版测试记录。
- 做一个更友好的图形化首次启动向导。

## 鸣谢

感谢以下项目和团队：

- [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)：Linux wrapper、构建、打包和 Computer Use 适配的核心基础。
- OpenAI Codex Desktop：本项目尝试在 Linux 上接近的上游桌面体验。
- Electron、Rust、GNOME、Linux 桌面生态及相关开源工具。

更详细的来源说明见 [NOTICE](NOTICE)。

## License

本集成仓库使用 MIT License。见 [LICENSE](LICENSE)。

请注意：MIT License 只覆盖本仓库中的集成脚本和文档，不代表你获得了再分发 OpenAI Codex Desktop 官方二进制的权利。
