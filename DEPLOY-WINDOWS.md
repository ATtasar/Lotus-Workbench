# Windows Server 2022 部署

首次部署请优先使用 [START-HERE-WINDOWS.md](START-HERE-WINDOWS.md) 和统一入口 `deploy/windows/Deploy.ps1`。该入口复用本文的底层脚本，包含重复执行保护、变更确认、备份、发布切换和日常管理。下面的独立脚本命令用于排查或高级操作，不需要逐条手动执行。

适用服务器：Windows Server 2022 数据中心版 64 位；当前提供的公网 IP 为 `47.109.199.148`，暂无域名。本文件中的命令由你在服务器上执行。本次开发没有登录、探测或修改该服务器。

## 当前方案与边界

- 保留 React + Vite 和所有原有业务页面，新增 NestJS + PostgreSQL 后端及独立登录入口。
- Windows 原生运行 Node.js 24、PostgreSQL 17、Caddy；API 通过计划任务启动并在故障后重启，Caddy 作为 Windows 服务运行。
- Docker Desktop 官方不支持 Windows Server 2022；仓库里的 Dockerfile/Compose 是 Linux 容器方案，见 DEPLOY-DOCKER.md，不直接用于这台 Windows 服务器。不要为此重装服务器或假设 ECS 支持嵌套虚拟化。
- 当前无域名阶段只开放 IP 健康检查。账号、订单和附件服务在配置正式域名与 HTTPS 后开放；不通过公网明文 HTTP 输入密码。
- 首版采用 PostgreSQL JSONB 工作区、独立 BYTEA 附件、增量字段提交、事务及乐观版本检查。全部原有实体都真实入库，关系由服务端共享校验器验证，尚未拆成每种业务实体的关系表。
- 单个附件最多 8 MB、每条最多 12 个，包含附件的工作区上限 128 MB。适合个人测试；当前首次读取仍返回完整数据与图片，较大图库后续改为按需加载/对象存储。
- 无开放注册、短信、真实支付、第三方物流查询、关闭页面后的推送，也没有 Android APK 工程。

## 1. 准备运行工具与代码

在服务器的管理员 PowerShell 中操作。保留现有 RDP 连接和现有应用；先确认 80、443、3000 没有被其他服务占用：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 80,443,3000,5432 }
```

手动安装或放置以下官方工具，不需要购买额外云资源：

1. Node.js 24 LTS x64（含 npm）：https://nodejs.org/en/download
2. PostgreSQL 17 Windows x64 安装器：https://www.postgresql.org/download/windows/ 。记录自己设置的 postgres 管理员密码；默认端口 5432，安装为 Windows 服务。不需要开放外网端口。
3. Caddy 官方 Windows amd64 二进制：https://caddyserver.com/download 。解压后的 `caddy.exe` 放到 `C:\CreatorStudio\bin\caddy.exe`。使用官方校验文件核对下载内容。

将当前工作区的完整源码包或 GitHub `codex/backend-deployment` 分支最新源码解压到 `C:\CreatorStudio\source`。确认直接存在 `C:\CreatorStudio\source\package.json`，没有额外套一层目录。旧提交 `092a2f6` 不含统一部署入口，不能用于本次自动部署。

```powershell
node --version
npm.cmd --version
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' --version
& 'C:\CreatorStudio\bin\caddy.exe' version
Set-Location C:\CreatorStudio\source
```

## 2. 限制 PostgreSQL 只监听本机

编辑 PostgreSQL 实际数据目录中的 `postgresql.conf`，默认安装常见位置为 `C:\Program Files\PostgreSQL\17\data\postgresql.conf`：

```text
listen_addresses = '127.0.0.1'
password_encryption = 'scram-sha-256'
```

检查 `pg_hba.conf` 仅允许必要的本地连接，使用 `scram-sha-256`，不要添加公网网段的允许规则。修改后在服务管理器重启对应的 PostgreSQL 17 服务；如果服务器有其他数据库使用者，先确认影响。

```powershell
Get-Service '*postgres*'
Get-NetTCPConnection -State Listen -LocalPort 5432
```

预期监听地址为 `127.0.0.1`。后面的初始化脚本会检查数据库实际监听配置，发现 `*` 等外部监听时停止，不会擅自修改或重启现有数据库。

## 3. 生成私密配置并初始化数据库

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\New-Environment.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Initialize-Database.ps1
```

第一个命令让你输入工作台登录密码，并随机生成独立的数据库密码；不会打印密码。配置保存为 `C:\CreatorStudio\config\backend.env`，权限限制为 Administrators 和 SYSTEM。第二个命令提示输入安装 PostgreSQL 时设置的 postgres 管理员密码，创建最小应用角色 `creator_app` 和数据库 `creator_studio`，保留已有同名数据库与角色，不重置其密码或删除数据。

若同名角色已存在且密码不同，先由数据库管理员核对，脚本不会自动覆盖。首个工作台账号默认 `creator`，密码就是第一步交互输入的密码。只在账号不存在时初始化；修改配置文件不会自动重置已有账号。

## 4. 构建并启用 IP 健康检查

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Build-Release.ps1
$release = (Get-ChildItem C:\CreatorStudio\releases -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Set-Gateway.ps1 -Release $release -ServerIp 47.109.199.148
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Install-Tasks.ps1 -Release $release
```

构建会恢复锁定依赖、生成云端模式网页和 API，并创建独立版本目录；不会删除旧版本。数据库表在 API 首次启动时通过幂等初始化创建，现有记录保留。若安装目录或 PostgreSQL bin 目录不同，请给脚本传对应参数。

本机检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health/ready
Get-ScheduledTask -TaskName CreatorStudioApi,CreatorStudioBackup | Select-Object TaskName,State
Get-ScheduledTaskInfo -TaskName CreatorStudioApi
Get-Service CreatorStudioGateway
Get-Content C:\CreatorStudio\logs\launcher-*.log -Tail 20
```

预期健康结果包含 `status: ok`、`database: ok`。长时间运行的 API 计划任务显示 Running 属于正常情况。

在 Windows 防火墙中仅新增网关规则，不改变已有远程管理规则：

```powershell
New-NetFirewallRule -DisplayName CreatorStudio-HTTP -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName CreatorStudio-HTTPS -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
```

同时在阿里云 ECS 安全组放行 TCP 80、443。完成后从自己的电脑执行：

```powershell
Invoke-RestMethod http://47.109.199.148/api/health/ready
```

公网 IP 根路径暂时返回 503 和“HTTPS domain configuration pending”，这是当前健康检查模式的预期结果，不代表已经完成正式上线。

## 5. 域名、HTTPS 与正式启用

在阿里云控制台手动完成：

- 域名实名认证及 A 记录解析，例如 `studio.你的域名` 指向 `47.109.199.148`。没有配置 IPv6 时不要设置错误的 AAAA 记录。
- 如果实例位于中国内地，按阿里云流程完成适用的 ICP 备案，再对外开通域名服务；后续公安联网备案、App 发布备案按实际发布范围和控制台要求办理。
- 安全组 TCP 80、443 对外；3389 仅允许自己的可信公网 IP；3000、5432、2019 不开放到公网。确认远程管理方式可用后再调整 RDP 来源，避免锁在服务器外。
- Windows 防火墙对应放行 80、443；允许网关出站 DNS 和 HTTPS，以便申请、续期证书。Caddy 自动申请公开可信证书并续期，证书状态保存在 `C:\CreatorStudio\caddy-data`。

DNS 和备案准备好后，将下面的域名替换为真实值：

```powershell
Set-Location C:\CreatorStudio\source
$release = (Get-ChildItem C:\CreatorStudio\releases -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Set-Gateway.ps1 -Release $release -Domain studio.your-real-domain.com
Stop-ScheduledTask -TaskName CreatorStudioApi
Start-ScheduledTask -TaskName CreatorStudioApi
& C:\CreatorStudio\bin\caddy.exe reload --config C:\CreatorStudio\config\Caddyfile --adapter caddyfile
Invoke-RestMethod https://studio.your-real-domain.com/api/health/ready
```

打开该 HTTPS 网页，使用 `creator` 登录。先在旧网址的“我的 → 导出完整 JSON 备份”，再在新网址导入。新旧网址的 IndexedDB 相互独立；同网址的旧记录也可通过“导入此浏览器原有记录”迁移。新云端账号从空工作区开始，不会自动上传示例或覆盖旧浏览器数据。

## 6. 备份、日志、更新与回退

每日北京时间 03:30 的计划任务生成 PostgreSQL custom 格式备份，触发边界明确使用 +08:00；包含账号、全部记录、会话和附件，验证归档目录可读取后才标记完成。保留 14 天，旧备份仅在新备份成功后清理。建议定期复制一份到自己的电脑或已有独立存储；同机备份无法应对整机磁盘丢失。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\CreatorStudio\scripts\Backup-Database.ps1
Get-ScheduledTaskInfo -TaskName CreatorStudioBackup
Get-ChildItem C:\CreatorStudio\backups
```

备份目录有整份业务数据，沿用安装目录的受限权限，不应放到网页根目录或 Git。API 按天记录不含密码、Cookie、请求体的 JSON 日志，单文件滚动；网关日志滚动保留，日备份任务清理 30 天前日志。

更新代码后：

```powershell
Set-Location C:\CreatorStudio\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Build-Release.ps1
$release = (Get-ChildItem C:\CreatorStudio\releases -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Switch-Release.ps1 -Release $release
```

切换前备份，切换失败会恢复旧 API 任务和网关配置，不回滚数据库。手动回退应用时对旧版本目录运行同一切换命令。当前数据库初始化无删除性迁移；未来涉及不兼容 schema 时需另行制定回退方案。

验证恢复时只使用新建测试数据库，不覆盖正式数据库。由 postgres 管理员建立 `creator_studio_restore_test`，所有者为 `creator_app`；使用 `pg_restore --no-owner --no-acl --dbname=creator_studio_restore_test` 恢复指定备份，再核对记录、附件数量和访问。不要对正式库执行 `--clean` 或删除数据卷。

需要重置登录密码时，先修改私密配置中的 `ADMIN_PASSWORD`，然后显式执行对应版本的管理命令（会撤销旧会话，保留工作区）：

```powershell
node --env-file=C:\CreatorStudio\config\backend.env C:\CreatorStudio\releases\实际版本目录\backend\dist\backend\src\admin.js
```

## 7. 开发地址与未来 Android 地址

- 默认开发保持本地模式。要联调，复制根目录和 backend 下的 `.env.example`，根目录设置 `VITE_DATA_MODE=cloud`、`VITE_API_BASE_URL=/api`，后端配置本地数据库和 `PUBLIC_ORIGIN=http://localhost:5173`，构建后启动 API，再启动 Vite。
- Windows 发布脚本强制网页使用云端模式与同源 `/api`，不会把电脑 localhost 或局域网地址打入发布包。后端自身的 127.0.0.1 是网关与数据库内部连接，不是手机请求地址。
- 当前没有 Expo、React Native 或 Capacitor Android 工程。未来封装 Android 时设置 `VITE_APP_TARGET=android` 和 `VITE_API_BASE_URL=https://正式域名/api` 后再构建；构建校验会拒绝相对地址、HTTP、localhost 和私网 IP。还需在真实 WebView 上验证 Cookie/CORS、下载和系统返回键；本次不声称已生成 APK。

## 本地验证范围

本次执行前后端构建、原有浏览器回归、后端 PostgreSQL 引擎测试及云端 UI 测试，并校验 PowerShell 语法和 Caddy HTTP/HTTPS 配置。后端集成使用 PGlite 的 PostgreSQL 引擎，不替代 Windows PostgreSQL 服务、pg 驱动网络、证书申请和备份恢复的服务器实测。本机没有 Docker，Linux 镜像尚未实际构建。部署后必须完成上述 readiness、登录、刷新保存、另设备读取、附件和备份恢复检查。

官方依据：

- Docker 支持范围：https://docs.docker.com/desktop/setup/install/windows-install/
- Caddy Windows 服务：https://caddyserver.com/docs/running
- Caddy HTTPS：https://caddyserver.com/docs/quick-starts/reverse-proxy
- 阿里云安全组：https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups
- 备案准备：https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview
