# Windows 自动部署交付与验证记录

本次以当前工作区为准，开始时 Git 分支为 `codex/backend-deployment`，提交为 `092a2f6`，工作区干净。未连接、探测或修改阿里云服务器 `47.109.199.148`。

## 项目检查结果

- 现有前端是 React + Vite + TypeScript，移动网页布局；没有 Expo、React Native 或已构建的 Android APK。
- 已有 NestJS + PostgreSQL 后端，复用原服务、认证、迁移和 API；没有另建后端。
- 开发默认本地 IndexedDB；生产构建强制云端模式，通过同域 `/api` 保存到 PostgreSQL。云端会保留本地待同步草稿，未完成同步的数据不能算作已经入库。
- 数据库使用账号、会话、JSONB 工作区、独立二进制附件和幂等提交记录。订单、任务、日历、对象、文件夹、物品、评分/评价关系由现有数据模型和共享校验器保留。
- 数据库迁移仍是现有幂等建表和版本记录，不含删库、删表或破坏性字段迁移。
- Windows 原生部署：Node.js 24、PostgreSQL 17、Caddy；API 计划任务、网关 Windows 服务、每日数据库备份。PostgreSQL 数据目录独立于发布目录，图片在数据库中，发布不覆盖图片文件。
- 没有改动 `src/`、前端直接依赖版本、UI 或业务页面。干净安装实测发现 Rollup `4.64.10` 的 FreeBSD x64 平台包没有发布，两个原有锁文件都无法通过 `npm ci`；仅将传递构建依赖固定到完整的 `4.64.9` 并重新生成锁文件，其他依赖版本不变。新的构建与原构建前端文件哈希相同。
- 后端业务接口未改变；只补充了启动失败阶段、错误码和脱敏处理，并在启动失败时关闭数据库连接池。

## 实际新增/修改文件

| 文件 | 作用 |
| --- | --- |
| `START-HERE-WINDOWS.md`（新增） | 新手操作、远程桌面、两行部署命令、日常管理、故障信息、控制台操作 |
| `deploy/windows/Deploy.ps1`（新增） | 统一部署/只读检查/状态/启动/停止/重启/日志/备份/恢复入口 |
| `deploy/windows/Install-Tools.ps1`（新增） | 确认后准备官方便携版 Node 与 Caddy，校验后解压，不修改系统 PATH |
| `deploy/windows/Restore-Database.ps1`（新增） | 校验备份并恢复到全新数据库，保留线上库和配置 |
| `deploy/windows/Common.ps1` | 私密配置、回环地址、目录、资源归属、端口冲突、健康和进程保护；备份任务可查找便携版 Node |
| `deploy/windows/Build-Release.ps1` | 唯一发布目录、明确安装构建依赖、返回发布路径，不停止运行版本 |
| `deploy/windows/Initialize-Database.ps1` | 已有库先备份；确认后才收紧监听/重启数据库；保留已有密码 |
| `deploy/windows/Backup-Database.ps1` | 唯一归档名、归档目录验证、SHA256、私密目录、日志、恢复原进程环境 |
| `deploy/windows/Install-Tasks.ps1` | 可重复注册，拒绝覆盖其他安装的资源，保留当前应用启动动作，支持部分安装恢复 |
| `deploy/windows/Switch-Release.ps1` | 更新前备份；失败时恢复任务动作、私密环境与网关配置，明确回滚失败，不回滚数据库 |
| `deploy/windows/Run-Api.ps1` | 保留现有启动方式，增加启动时的日志轮换 |
| `deploy/windows/Set-Gateway.ps1` | 增加网关运行及证书日志；保留 HTTPS / 无域名健康检查方案 |
| `backend/src/main.ts` | 连接/权限/密码/端口错误的脱敏启动提示及失败后的连接池清理 |
| `package.json`、`package-lock.json`、`backend/package.json`、`backend/package-lock.json` | 固定完整的 Rollup 4.64.9 传递依赖，修复干净安装；直接依赖和脚本不变 |
| `backend/test/windows-deploy.test.ts`（新增） | Windows PowerShell 5.1 语法和部署保护回归测试 |
| `backend/test/windows-helpers.ps1`（新增） | 16 个目录、配置、资源归属、端口、取消与健康检查断言 |
| `backend/test/windows-scenarios.ps1`（新增） | 模拟重复注册和更新失败；验证任务、配置恢复，无真实服务操作 |
| `backend/test/windows-integration.mjs`（新增） | 官方 PostgreSQL 二进制上的独立数据库/API/备份恢复/网关验收 |
| `DEPLOY-WINDOWS.md` | 将统一入口置于前面，纠正旧版本源码说明 |
| `DEPLOYMENT-VALIDATION.md`（新增） | 本记录 |

`New-Environment.ps1`、已有 SQL、Docker/Compose、环境变量示例、认证与工作区接口已经审查，沿用已有实现。PostgreSQL 安装器仍由用户交互安装，脚本不会静默安装数据库、猜测管理员密码或覆盖已有数据库安装。

## 本地验证结果

| 验证 | 结果与边界 |
| --- | --- |
| 前端生产构建 `npm run build:production` | 通过；原 UI 保留，云端生产产物生成 |
| 后端生产构建 `npm run build:backend` | 通过 |
| 独立源码副本完整发布构建 | Windows PowerShell 5.1 实际运行 `Build-Release.ps1` 通过：前后端 `npm ci`、生产构建、复制产物及发布目录生产依赖安装全部完成；未停止预览或注册服务 |
| 前端单元测试 `npm test` | 34 项通过 |
| 后端测试 `npm run test:backend` | 16 项通过，包含现有认证/工作区/网络隔离及新增 Windows 脚本测试 |
| Windows PowerShell 5.1 | 所有部署脚本语法通过；辅助函数、重复注册和失败回滚通过；服务与任务命令在模拟环境执行 |
| 真实 PostgreSQL 17.11 | 独立临时目录，回环地址，实际初始化；重复初始化和幂等迁移通过 |
| 生产 API | 实际编译后的入口启动，健康、登录、完整关系数据和二进制附件保存通过；错误数据库密码快速退出，日志无连接串/密码 |
| 重启持久化 | API 和 PostgreSQL 进程均停止再启动后，数据、附件和会话仍可读取；账号密码哈希不变 |
| 备份和完整恢复 | 实际执行 Windows 备份/恢复脚本，SHA256 与归档目录验证通过；恢复到新库，工作区 JSONB、附件字节和账号哈希与备份时一致；篡改校验值被拒绝 |
| Caddy | 正式域名和 IP 配置均通过官方 Caddy 验证；本机测试端口实际代理健康接口、业务接口返回 503；Windows PowerShell 5.1 Host 头探测通过 |
| 敏感信息 / 数据库网络 | 源码未发现真实密钥、Token、AccessKey 或私密配置；数据库 URL 限定回环，Compose 不发布数据库端口；测试数据库只监听回环并已关闭 |

真实数据库验收不是 PGlite 内存模拟。它使用官方 Windows PostgreSQL 二进制、全新英文临时目录和随机测试凭据，不安装系统服务；结束关闭进程，保留私密诊断文件。当前中文工作区下 PostgreSQL 的 UTF8 初始化遇到路径编码问题，因此测试在英文临时目录完成；建议正式部署沿用 `C:\CreatorStudio` 和 PostgreSQL 默认英文安装路径。

开发者如需复现最后一项验收：将官方 PostgreSQL Windows 二进制解压至被 Git 忽略的 `artifacts/postgres-test-tools/pgsql`，可选放置官方 Caddy 至 `artifacts/deploy-tools/caddy.exe`，先构建后端，再运行 `node backend/test/windows-integration.mjs`。测试遇到本机 5432 已被占用会拒绝执行，不连接现有数据库。普通部署用户不需要下载这些测试工具。

## 服务器上仍需验收

以下没有在真实服务器执行，不能视为已完成部署：PostgreSQL 安装器与 Windows 服务识别、软件下载连通性、真实任务注册/SYSTEM 开机运行、真实服务故障重启、服务器重启、阿里云安全组/Windows 防火墙、正式 DNS/备案/证书签发、Android 外网访问。

源代码中的下载校验逻辑已审查，实际服务器上的首次下载与安装仍由脚本在用户确认后执行。正式机器上的数据库收紧监听会提示对同一 PostgreSQL 服务中所有连接的影响，且在存在工作台库时先备份；没有默许修改防火墙或远程桌面。

当前无域名阶段只能验收 IP 健康检查。服务安装成功不等于正式公网登录已安全开放。阿里云及 Windows 防火墙需用户按说明手动配置必要的 80/443；数据库 5432、API 3000、Caddy 管理 2019 不应放行公网。

新手操作请从 `START-HERE-WINDOWS.md` 开始。无需购买新资源，不需要重装服务器或切换前端技术栈。
