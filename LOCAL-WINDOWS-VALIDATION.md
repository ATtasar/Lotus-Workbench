# Windows 电脑端修复验收记录

日期：2026-10-19。本次仅使用 desktop/ 的现有 UI；desktop/index.html、desktop/styles.css、现有稿件模型和视觉布局没有重新设计。没有构建 APK、配置 LAN、防火墙或云端服务，没有删除真实用户记录或历史目录。

## 实际故障与排查

用户提供的“本机尚未安装”报错来自 scripts/local-windows.mjs 对 config.json 的检查，不是浏览器 PWA 安装要求。检查时配置和真实快捷方式已存在，但服务没有监听；不能据此断言当时配置为何缺失或曾经丢失了已提交记录。

实际 SQLite 完整性正常，桌面 revision 为 2，已有组件模板和图片仍在；服务历史日志未发现对应保存失败。未复现已提交稿件自动消失。代码中发现并修复了以下风险：

- 正常启动可能在缺失/错误数据路径下初始化空库，造成打开另一个空工作区；现要求绝对路径、已安装数据库及匹配的服务身份。空数据库或未标版本数据库也不在正常启动中初始化。
- 安装配置只有单份，快捷方式可在未安装时创建；现写入 config.last-good.json，缺失时校验恢复，未安装时拒绝创建无法工作的快捷方式。
- HTTP 200 的无效保存回执可能被当作成功；现严格验证数据库 revision 递增，失败保留输入并阻止继续覆盖。
- 编辑未提交表单和组件时仍可能显示“已保存”；现区分未保存、保存中、失败、已提交，并在未保存时离页提醒。
- 历史手机配置参与默认启动；现默认不读取它，只监听 127.0.0.1，拒绝手机、配对、LAN 管理及旧独立业务 API，设置中移除手机入口。

实际用户配置目录还出现 EXDEV 重命名错误。已保留落盘暂存文件，增加复制、fsync 和字节一致性校验的兼容路径；随后真实安装成功。没有修改系统目录权限或关闭安全机制。

## 实际检查结果

| 项目         | 结果                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 构建         | Node 24.18.0 / npm 11.16.0，npm run build:local 成功；只复制电脑页面，保留旧文件但不开放旧资源                               |
| 单元测试     | npm test：58 项通过，含 SQLite、关联、归档、图片、事务回滚、版本冲突、迁移、备份恢复及 Windows CRLF 入口检查                 |
| 测试 A       | Edge 实际新建稿件、编辑状态为草稿、保存图片、刷新；同时检查 API 和 SQLite 原始记录                                           |
| 稿件删除     | Edge 创建临时稿件并确认删除，SQLite 中确实移除，其他稿件和图片保留                                                           |
| 测试 B       | 关闭独立浏览器上下文再打开，已提交的稿件与图片一致；真实 .lnk 启动也核对数据库                                               |
| 测试 C       | 关闭服务重开，数据一致；启动器使用独立进程冷启动，图片仍可重读                                                               |
| 测试 E       | 隔离安装生成真实 Windows 桌面与开始菜单 .lnk，分别停止服务后调用，默认浏览器收到正确本机 URL；不使用 --no-browser 的快捷方式 |
| 安装恢复     | 删除隔离配置后从副本找回原自定义端口和数据库；从不同工作目录启动不改数据路径                                                 |
| 缺库保护     | 隔离移开数据库后启动报错，不创建空库；空 SQLite 同样拒绝初始化；测试文件随后还原                                             |
| 本机修复     | 实际安装目录、用户桌面和开始菜单入口均已更新，配置与恢复副本一致；本机 17841 端口只监听 127.0.0.1                            |
| 真实数据保护 | 真实安装前后业务元数据和记录的 SHA-256、revision=2 一致，quick_check=ok，图片保留；更新前已完整备份                          |
| 保存失败     | 模拟 HTTP 500 和 HTTP 200 但缺少 revision 回执；不显示保存成功，输入保留，SQLite 不变                                        |
| 离页提醒     | 未提交表单刷新时出现浏览器 beforeunload 提醒，取消后输入仍在                                                                 |
| 测试 F       | 默认六页无独立收纳或手机导航，设置无手机联动；参考图、稿件素材及组件图片功能通过                                             |
| 核心离线     | Edge 阻断所有非本机 HTTP 请求时完成核心流程，无外部请求                                                                      |
| 备份和导入   | 物理 SQLite+图片备份、JSON 确认恢复、旧 IndexedDB 确认导入及保留源记录通过                                                   |
| 历史配置隔离 | 隔离目录写入损坏的 lan-access.json 不影响电脑端启动，/mobile/ 和 LAN API 返回不可用                                          |

测试命令与隔离产物：

```text
npm test
npm run build:local
npm run test:desktop:ui
npm run test:local:launcher
artifacts/desktop-validation/result.json
artifacts/desktop-validation/launcher-result.json
artifacts/desktop-reliability/live-before.json
artifacts/desktop-reliability/live-after.json
```

artifacts/ 被 Git 忽略，含本机路径与测试快照；真实业务数据库、图片、配置、令牌和备份不提交 GitHub。受限测试进程曾报父目录访问拒绝，改用经授权的本机 Node 环境执行通过，没有修改目录权限。

## 明确未验证

- 测试 D：没有重启用户电脑。已验证停止后通过快捷方式冷启动，但不把服务重启等同物理电脑重启。
- 没有物理拔网线；离线验证是阻断所有外部 HTTP。
- 没有在另一台物理电脑或全部 Windows 10/11 版本上重测。
- 没有对用户真实数据执行恢复或清空；恢复和故障注入仅在隔离数据目录中测试。
- 本次不测试或开发手机、Android、收纳、LAN、云端功能。历史源码与数据库表保留，不进入默认电脑端工作流。

## 本次修改文件

- 桌面状态与 API：desktop/api.js、desktop/storage.js、desktop/app.js、desktop/designer.js。
- 本地存储与 HTTP：local/store.ts、local/server.ts。
- 安装构建：scripts/local-windows.mjs、scripts/build-local.mjs、package.json、vitest.config.ts、.gitignore。
- 验证：tests/local-storage.test.ts、tests/desktop-local-e2e.mjs、tests/desktop-launcher.mjs。
- 文档：README.md、START-HERE-LOCAL-WINDOWS.md、LOCAL-WINDOWS-VALIDATION.md、START-HERE-LAN.md（历史停用提示）。

已检查 Install/Start/Stop/Create-DesktopShortcut 的 CMD 与 PowerShell 调用关系。保留正确的 CRLF CMD 包装器和普通浏览器启动方式，修复集中在其共同调用的 local-windows.mjs。
