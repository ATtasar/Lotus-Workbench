# 创作者工作台 API

NestJS 11、Node.js 24、PostgreSQL 17。当前没有使用 Prisma；首版保持已有业务模型，采用参数化 SQL、JSONB 工作区、独立附件 BYTEA、事务、版本检查和幂等提交。文件与记录同库备份，暂不需要另购 OSS 或 RDS。

## 本地运行

先创建 PostgreSQL 应用角色和数据库，复制 backend/.env.example 为 backend/.env 并填写自己的配置。不要提交真实环境文件。

```sh
npm ci
npm run build
npm start
```

## 已有接口

| 方法及路径                     | 功能                                       |
| ------------------------------ | ------------------------------------------ |
| GET /api/health/live           | 进程存活                                   |
| GET /api/health/ready          | 数据库连通检查                             |
| POST /api/auth/login           | 私有账号登录，HttpOnly Cookie 会话         |
| GET /api/auth/session          | 当前会话                                   |
| POST /api/auth/logout          | 注销并撤销会话                             |
| GET /api/workspace             | 读取个人工作区，恢复附件内容               |
| POST /api/workspace/changesets | 字段增量保存、关联校验、附件入库及事务提交 |

写操作必须来自允许的 Origin 且登录有效。会话仅以 token 哈希存库，默认 7 天；生产使用 Secure Cookie，缺少 HTTPS origin 时拒绝登录。没有公开注册接口；首个账号从服务器私密环境初始化。

变更请求为 `{baseRevision, requestId, changes: {records, settings?}}`。records 包含白名单 collection、id，以及 values 字段补丁或 remove:true。前端 diff 不重复提交未变更图片。版本冲突返回 409；同一 requestId、同一内容可安全重试，变更内容后复用 ID 会拒绝。删除关联、模板生成任务等操作在一个事务内校验与写入。

实体关系通过共享领域校验器保证；客户端校验不被当作服务端权限。删除平台、商家资料快照、任意文件夹层级、归档与历史日历逻辑沿用前端现有模型。后续可在这一 API 边界后拆分关系表和独立对象存储，无需重新设计 UI。

## 测试

```sh
npm test
```

使用 PGlite 的 PostgreSQL 引擎和真实 Nest HTTP 服务验证 SQL、认证、账号隔离、附件、幂等、事务回滚与冲突。生产使用 pg 驱动连接 PostgreSQL 服务，部署时需额外核对网络连接和备份恢复。
