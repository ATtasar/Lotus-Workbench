# Linux 容器部署备选

当前购买的 Windows Server 2022 使用 DEPLOY-WINDOWS.md。以下仅适用于已经具备 Linux Docker Engine 与 Compose v2 的环境，不要求购买新资源或重装现有服务器。

1. 复制 `deploy/.env.example` 到 `deploy/private/compose.env`，目录权限设为仅运维用户可读。填写独立的随机十六进制数据库密码、至少 12 字符的工作台密码、真实域名和对应 HTTPS origin；保留文件在 Git 之外。
2. 准备 DNS、适用备案和 80/443，确认没有端口冲突。
3. 在项目根目录执行：

```sh
docker compose --env-file deploy/private/compose.env config --quiet
docker compose --env-file deploy/private/compose.env up -d --build --wait
docker compose --env-file deploy/private/compose.env ps
docker compose --env-file deploy/private/compose.env logs --tail=50 api
curl --fail https://YOUR_REAL_DOMAIN/api/health/ready
```

数据库和 API 没有宿主机端口映射。数据库仅连接 internal 网络，网关独自对外发布 80/443；PostgreSQL 数据、证书和配置使用命名卷。初始化脚本创建非超级用户应用角色。日志限制单文件 10 MB、保留 3 份。

backup 服务每日执行 pg_dump，备份在 `deploy/backups`，成功后清理 14 天前归档。手动执行：

```sh
docker compose --env-file deploy/private/compose.env run --rm --no-deps backup --once
```

将备份另存到自己的独立存储，定期在新数据库验证恢复。更新前先手动备份，再执行 `up -d --build --wait`。保留旧镜像用于应用回退；不要运行 `down -v`、volume prune 或针对正式库的清空恢复命令。

数据库密码初始化后修改 env 不会自动改变数据库角色密码，需由管理员协调轮换角色与 API/备份连接配置。初始账号密码只在账号不存在时使用，重置需显式执行 backend 管理命令。

本次本机没有 Docker daemon，Dockerfile 与 Compose 已提供，但镜像构建、网络和数据卷持久化仍需在目标 Linux 容器环境验证。
