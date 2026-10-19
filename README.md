# 接稿工作台 · Windows 电脑本地版

本仓库的 **main 分支**已更新为最新版 Windows 本地工作台，使用《接稿工作台-空白版》的黑白宽屏 UI、左侧导航和原有交互。

## 下载和首次安装

1. 点击 [下载完整项目 ZIP](https://github.com/ATtasar/Lotus-Workbench/archive/refs/heads/main.zip)，**先完整解压**到准备长期保留的文件夹，例如 D:\接稿工作台。不要在 ZIP 内直接运行脚本。
2. 电脑需要 **Windows 10/11 和 Node.js 24.x**。没有 Node 时，从 [Node.js 官网](https://nodejs.org/)安装 24.x，并重新打开终端。首次安装 Node 和项目依赖需要联网。
3. 在解压目录双击 **Install-Local.cmd**。它会安装依赖、构建电脑端、本机初始化 SQLite 数据库、创建桌面快捷方式，再打开浏览器。

安装成功后，日常双击桌面 **“创作者工作台”** 即可。默认地址为 **http://127.0.0.1:17841/**，服务仅监听本机。安装完成后的核心功能支持断网使用。

无需阿里云、PostgreSQL、云端账号、Android SDK 或管理员权限。PowerShell 入口也保留；系统禁止执行 .ps1 时直接使用 .cmd，无需修改安全策略。

## 保留的电脑端功能

- 主页：本周开始与截稿日历、当前稿件图片和要求。
- 稿件管理、单主管理、稿件模板、平台选择与费用设置。
- 月历、收入统计以及订单、单主和日历联动。
- 水印合成、交付小票、会员卡、例图排版及素材库。
- 电脑本地自动保存、完整备份与确认后恢复。

全新安装从空白开始，不用示例内容覆盖用户记录。

## 数据在哪里

数据库位于 **%LOCALAPPDATA%\Lotus-Workbench\data\workbench.sqlite**；图片位于同级 **files** 目录。数据与下载的程序分开保存，关闭浏览器、重启本地服务和重新安装程序不会主动清空它。

不同电脑分别保存自己的数据。需要搬到另一台电脑时，请导出备份并在新电脑确认导入；源码下载不包含个人订单或图片。

## 备份、恢复和更新

- 备份：左下角“工作台设置”→“备份数据库与图片”；也可“导出全部备份”得到包含图片的 JSON。
- 恢复：设置中选择 JSON 并确认后导入。完整 SQLite 与图片目录恢复方法见详细说明；恢复前会备份并保留现有数据。
- 更新：先备份，下载新版 ZIP 并完整解压，双击新版目录中的 **Install-Local.cmd**。它会更新程序与桌面快捷方式，保留独立数据目录。
- 停止：双击 **Stop-Local.cmd**。

## 维护命令

安装后也可在项目目录的终端运行：

```powershell
npm run build
npm start
npm run local:stop
npm run local:backup
```

默认 build、dev、start、preview 全部指向 Windows 电脑本地版。源码 UI 位于 desktop/，本地存储和 HTTP 服务位于 local/，安装启动逻辑位于 scripts/local-windows.mjs。

- [完整中文安装、备份恢复、更新与故障处理](START-HERE-LOCAL-WINDOWS.md)
- [实际验证范围与未验证项](LOCAL-WINDOWS-VALIDATION.md)
- [原 UI 来源说明](desktop/SOURCE.md)

覆盖前的静态桌面版与手机版保留在 Git 历史及 codex/backup-before-windows-local-20261019 备份分支。历史 React 与云端开发代码保留供维护参考，入口说明见 [历史开发文档](LEGACY-REACT-AND-CLOUD.md)。
