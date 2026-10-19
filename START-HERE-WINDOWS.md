# 从这里开始：Windows Server 2022 部署

这份说明适用于你的阿里云 Windows Server 2022，公网 IP `47.109.199.148`。以下命令都在**服务器的管理员 PowerShell**里运行。开发环境没有连接或修改你的服务器。

当前没有域名：本次可以完成程序安装、数据库、后台常驻和 IP 健康检查。公网登录暂不开放；等正式域名、HTTPS 和需要的备案完成后，再在 Android 手机浏览器访问。当前项目没有 APK，保留现有 React + Vite 页面，不需要 Expo 或 Docker Desktop。

## 1. 准备两样东西

1. **完整项目源码**：使用 GitHub 的 `codex/backend-deployment` 分支最新版本，不能使用旧提交 `092a2f6` 的压缩包，也不要只复制 `dist`。如果这些修改还在本地，请先把当前项目打包传到服务器。排除 `node_modules`、`artifacts`、`.git` 和真实 `.env`，保留所有源码和两个 `package-lock.json`。
2. **PostgreSQL 17 x64**：[官方下载入口](https://www.postgresql.org/download/windows/)。在服务器上运行安装器，安装 PostgreSQL Server 和 Command Line Tools，端口保留 `5432`；记住你自己设置的 `postgres` 管理员密码。Stack Builder 可跳过。已经安装且正在使用的 PostgreSQL 不要重复安装或升级。

Node.js 24 和 Caddy 如缺少，主脚本会先征求同意，再下载官方版本、核对校验值并放入应用目录。不会自动更换已有的不兼容 Node，也不会修改系统 PATH。下载需要服务器能访问 nodejs.org、GitHub 和 npm；失败时不要用不明镜像或关闭安全设置。

## 2. 连接服务器、放好项目

在自己电脑按 `Win + R`，输入 `mstsc`，连接 `47.109.199.148`，使用阿里云提供的 Windows 账号登录。密码只填远程桌面登录框，不要发给 Codex。

把源码解压到 `C:\CreatorStudio\source`。确认该目录直接包含 `package.json`、`backend` 和 `deploy`，不要多套一层文件夹。远程桌面的“本地资源 → 详细信息 → 驱动器”可以共享本机磁盘以复制文件。

在服务器“开始”菜单搜索 **Windows PowerShell**，右键 **以管理员身份运行**。

## 3. 首次部署：只执行这两行

```powershell
Set-Location C:\CreatorStudio\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1
```

`ExecutionPolicy Bypass` 只对本次子进程生效，不会更改系统的执行策略。脚本不修改 Windows 防火墙、远程桌面或阿里云安全组。

按顺序会出现这些结果：

| 屏幕内容 | 你需要做什么 / 什么算正常 |
| --- | --- |
| OS / free space / Node / npm / PostgreSQL / Caddy | 应为 Server 2022 x64，应用盘剩余至少 4 GB；数据库很大时需更多备份空间 |
| `Type YES to continue` | 阅读上方影响说明，愿意继续时输入大写 `YES`；其他输入会停止 |
| Node/Caddy 下载确认 | 首次缺少软件才出现；核对校验值后才解压，不改已有软件 |
| `Set the creator login password` | 设置工作台账号 `creator` 的密码，至少 12 位；输入不显示。与数据库管理员密码不同 |
| `PostgreSQL postgres administrator password` | 输入安装 PostgreSQL 时的密码，不显示；正常重复部署通常不再需要它 |
| PostgreSQL 自动启动确认 | 仅当对应服务尚未运行或未设为自动启动时出现；确认后设置开机启动，并启动已停止的服务，不重启正在运行的数据库 |
| PostgreSQL 回环配置确认 | 仅当数据库正在监听外网地址时出现。确认后改为 `127.0.0.1` 并短暂重启对应数据库服务；同一服务中的其他数据库也会断开。已有工作台库先备份 |
| `Backup verified (archive catalog + SHA256)` | 已产生可读的备份归档和校验文件；这一步不等于已经做过完整恢复演练 |
| `Release built` | 前后端生产构建及运行依赖准备成功 |
| `status: ok`、`database: ok`、`DONE` | 后端、数据库、网关健康检查通过；已配置开机启动及北京时间每天 03:30 备份 |
| `HTTPS PENDING` | 当前没有域名时的正常结果，公网只提供健康检查，不能通过 HTTP 登录 |

如果 PostgreSQL 未安装、服务未运行、磁盘不足、端口冲突或权限不正确，脚本会停止并显示具体阶段。解决后再次运行同一个命令。重复运行会创建新发布目录并备份，不会删除订单、图片、旧版本或重设账号密码；不要删除 `config` 目录来“重装”。

构建时的 `npm warn` 不一定代表失败，以是否出现明确错误和最终 `DONE` 为准。本次源码已修复旧版本锁文件的 Rollup 平台包缺失问题，请使用本次源码包，不要混入旧 `package-lock.json`。

自定义 PostgreSQL 安装目录时，在命令末尾加 `-PgBin 'D:\PostgreSQL\17\bin'`。安装目录默认 `C:\CreatorStudio`，自定义时每次都带上相同 `-InstallRoot`。请不要将其他项目放入该目录；此目录权限限制为 Administrators 和 SYSTEM。

如果提示已有数据库密码不匹配，停止操作，保留私密配置和备份，向 Codex 提供错误阶段。脚本不会通过重置已有数据库角色密码来绕过这个问题。

## 4. 日常操作：始终使用同一个入口

先进入 `C:\CreatorStudio\source`，再选择一条命令。自定义目录时带上原来的参数。

```powershell
# 只读环境检查：不下载、不安装、不修改数据库
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Check

# 查看服务、端口、健康结果、最近自动备份状态
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Status

# 启动 / 停止 / 重启，把 Start 换成 Stop 或 Restart
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Start

# 查看日志文件列表及最近 60 行后端启动日志
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Logs

# 立即备份数据库
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Backup
```

`Status` 中 `CreatorStudioApi` 通常为 `Running`，`CreatorStudioGateway` 和 PostgreSQL 为 `Running`。备份任务通常为 `Ready`，上次运行成功代码为 `0`；刚安装尚未运行时，上次结果可能为 `267011`。5432、3000、2019 应只监听回环地址。停止应用不会停止数据库，也不会删除数据；启动/停止/重启会先询问确认。

服务器内直接检查后端也可以执行：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health/ready
```

日志在 `C:\CreatorStudio\logs`：`launcher-*.log` 是启动日志，`api-*.jsonl` 是请求日志，`caddy-runtime.jsonl` 是网关运行/证书日志，`backup-*.log` 记录成功备份；配置域名后还有网关访问日志。计划任务的执行结果可在“任务计划程序”中查看。不要公开包含自己的业务数据的日志。

## 5. 备份和安全恢复

数据库包含账号、订单、物品、关系和图片。备份位于 `C:\CreatorStudio\backups`；每个 `.dump` 配套一个 `.dump.sha256`。正常每日备份成功后清理超过 14 天的数据库备份和超过 30 天的日志；部署前备份不触发清理，但之后仍会受到每日保留策略影响。请把重要的备份和校验文件另存到自己的电脑，加密保管。单机备份不能抵抗服务器磁盘丢失。

**恢复演练**只需一条命令，把文件名替换为实际备份文件：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Action Restore -BackupFile 'C:\CreatorStudio\backups\creator-实际文件名.dump'
```

脚本核对 SHA256 和归档目录，征求确认，要求安全输入 postgres 密码，然后恢复到全新的 `creator_restore_...` 数据库，并读取账号、工作区、图片数量。原数据库、当前服务和配置完全保留；失败的新库也保留供排查，不自动删除。空数据库在首次运行后尚无业务表，其初始化前备份不能用业务表数量来验证；请在部署成功后额外执行一次 `Backup` 再做恢复演练。

这一步验证归档能完整导入，不会把旧数据直接覆盖到正在使用的工作台。真正恢复使用前，请把恢复出的数据库名和统计结果发给 Codex，核对恢复时间点并准备切换到恢复库；不要自行删除原库、运行 `DROP` 或 `pg_restore --clean`。保留私密 `config`、Caddy 证书目录以及数据库备份，私密文件不要上传 GitHub。

## 6. 失败时发什么给 Codex

复制 `FAILED at:` 所在阶段、紧接着的错误、运行的命令（不含密码），以及 `-Action Status` 的输出。如果后端启动失败，再附上 `-Action Logs` 中最后一次错误附近的几行。下载或 npm 失败时，附上错误代码和软件名称即可。

**不要发送** `backend.env` 内容、数据库连接字符串、数据库备份、登录密码、Cookie、Token、AccessKey，也不要把整个服务器目录打包发来。回滚失败时不要继续反复更新，保留屏幕上提示的恢复文件路径并联系 Codex。

## 7. 阿里云控制台：还需要你手动完成的事

1. **安全组**：现阶段若要从自己电脑检查 IP 健康接口，只允许 TCP 80；可先限制来源为自己的公网 IP。将来正式 HTTPS 需要 TCP 80、443。保持远程桌面现有规则并尽量限制可信来源；不要开放 3000、5432、2019，不要选择“所有端口”。[官方安全组说明](https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups)。
2. **Windows 防火墙**：按需要手动允许网关 TCP 80，正式 HTTPS 再允许 443；保持防火墙开启。脚本不会自动开放端口或改变 RDP 规则。
3. 允许 80 后，在自己电脑浏览器打开 `http://47.109.199.148/api/health/ready`，正常返回 JSON。打开网站根地址显示 `HTTPS domain configuration pending` 和 503 是当前预期行为。
4. **域名 / DNS / HTTPS / 备案**：有域名后解析 A 记录到此 IP。中国大陆节点按阿里云要求办理适用的 ICP 备案；[官方备案说明](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)。确认 DNS、80/443、安全组、防火墙和备案要求完成后，再运行下面命令。Caddy 尝试自动申请证书，HTTPS 失败会明确报错，不能据此宣称公网登录已就绪。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Deploy.ps1 -Domain '你的实际域名'
```

后续不带 `-Domain` 重复部署会保留已配置域名。正式浏览器版本通过同域 `/api` 连接后端；Android 手机访问同一个 HTTPS 地址。未来封装 Android 时必须设置真实 HTTPS API 地址，不能使用电脑的 localhost 或局域网 IP，详见 `DEPLOY-WINDOWS.md`。
