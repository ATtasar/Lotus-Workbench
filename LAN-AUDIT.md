# 局域网联动实施前审计

审计时间：2026-10-19。当前工作基线：`7d06fea`，工作分支：`codex/lan-sync`。

| 项目                | 实际情况                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 当前电脑 UI         | `desktop/`，原生 HTML/CSS/JavaScript，来自指定的电脑空白版；不是 React 手机 shell                                     |
| 已完成的手机 UI     | 原生 HTML/CSS/JavaScript 的独立手机版，包含稿件、单主、日历、模板、图片组件；原始文件仍在旧项目和预览目录             |
| Android             | 保留 Capacitor 原型；构建状态文档明确 APK 未成功生成，本次采用手机浏览器入口，不生成 APK                              |
| 当前后端            | 正在运行 Node.js 原生 HTTP 服务 `local/server.ts`，没有启动 NestJS 或 PostgreSQL                                      |
| 数据库              | Node.js 24 内置 SQLite，结构版本 2；稿件业务在 `desktop_workspace` / `desktop_records` 表                             |
| 稿件、单主和图片    | `%LOCALAPPDATA%\Lotus-Workbench\data\workbench.sqlite`，图片在 `data\files`，通过摘要引用                             |
| 电脑数据读写        | `desktop/storage.js` → `/local-api/desktop-workspace` → `LocalStore.loadDesktop/saveDesktop`，UI 不直接访问数据库文件 |
| 旧浏览器数据        | 旧电脑版和手机版曾用 IndexedDB / localStorage；当前电脑只在用户主动确认导入时读取旧浏览器数据，不自动替换 SQLite      |
| 手机原型数据        | 旧预览存在独立 IndexedDB；Android 原型使用独立本机存储边界，不是电脑正式数据源                                        |
| 旧 React / 云端代码 | 仓库仍保留兼容代码和可选 NestJS/PostgreSQL 部署；不是当前本地版入口，本次不使用                                       |
| 当前监听            | `127.0.0.1:17841`，手机访问不到；API 有 Host、Origin 和本机令牌检查                                                   |
| 一致性问题          | 两个 UI 尚未共用 API；电脑页面不定时获取其他端更新；已有 revision 冲突检查可继续复用                                  |
| 当前电脑网络        | IPv4 `192.168.1.114/24`，以太网，被 Windows 标为 Public；没有自动更改网络类别或防火墙                                 |

本次范围限定为现有稿件、平台、单主、稿件模板、日历及图片组件。**不增加收纳、物品或嵌套文件夹页面和同步功能**，也不删除数据库中历史兼容表或记录。

最小方案：复用一个 Node HTTP 服务和同一个 `LocalStore` 实例，新增可关闭的指定私网 IPv4 监听、设备配对、同源手机网页入口和 revision 轮询。旧手机数据只允许用户主动导出并确认导入，不作为权威数据源自动上传。
