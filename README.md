# 接稿工作台 · Windows 电脑本地版

本次仅维护 `desktop/` 中现有的黑白电脑端界面。保留稿件、单主、日历、平台、稿件模板、自定义流程，以及水印、小票、会员卡、例图排版和稿件素材。没有独立收纳模块。默认安装、构建和启动不需要手机、局域网、Android 或云端服务。

## 下载与安装

1. [下载完整项目 ZIP](https://github.com/ATtasar/Lotus-Workbench/archive/refs/heads/main.zip)，完整解压到长期保留的目录。不要在 ZIP 内运行，也不要只下载 HTML。
2. 安装 [Node.js 24.x](https://nodejs.org/)（Windows 10/11）。首次下载 Node 和 npm 依赖需要联网。
3. 双击 **Install-Local.cmd**，等待安装检查通过。已有数据库会先备份，程序更新不会主动清空数据。

日常双击桌面或开始菜单的 **创作者工作台**，启动器会先启动本机服务，再用系统默认浏览器打开 **http://127.0.0.1:17841/**（自定义端口以本机配置为准）。不依赖浏览器安装 PWA，安装完成后核心业务可断网使用。

## 数据与备份

数据库：**%LOCALAPPDATA%\Lotus-Workbench\data\workbench.sqlite**；图片：同级 **files\**。源码与用户数据分开，换程序目录不会搬动数据库。

设置中可“备份数据库与图片”或“导出全部备份”。完整备份请复制整个备份目录到其他磁盘。恢复前需要确认，并保留恢复前的数据。旧浏览器记录仅在主动确认导入后复制，原记录不删除。

- **重新创建桌面与开始菜单入口**：安装后双击 Create-DesktopShortcut.cmd。
- **停止**：双击 Stop-Local.cmd；**重启**：停止后双击快捷方式。
- **更新**：先备份，下载并解压新版，在新版目录运行 Install-Local.cmd；保留独立用户数据目录。
- **提示安装配置缺失**：运行 Install-Local.cmd 修复。新版优先从 config.last-good.json 恢复配置；正常启动绝不新建空数据库冒充旧工作区。
- **显示保存失败**：保留页面，导出当前内容的 JSON 备份，再检查本机日志。不要把“正在保存”当作成功。

完整操作、恢复和报错处理见 [Windows 本地部署说明](START-HERE-LOCAL-WINDOWS.md)；实际测试及未验证项见 [验证记录](LOCAL-WINDOWS-VALIDATION.md)。

## 维护

`npm run build` 构建到 local-dist；`npm start` 启动已安装的工作台；`npm test`、`npm run test:desktop:ui`、`npm run test:local:launcher` 执行检查。更换源码或更新版本后请运行安装入口以重新构建、检查数据库并更新快捷方式。

历史 mobile/、React、Android、云端文件及原数据库表暂时保留，避免破坏历史内容。它们不作为当前电脑端入口；默认服务固定只监听 127.0.0.1，拒绝 /mobile/、手机配对、LAN 管理及旧独立收纳 API，不读取历史局域网配置。无需配置防火墙或管理员权限。
