# Novel Enginner

Novel Enginner 是一个以 Markdown canonical state 为基础的小说创作控制面。Bun 提供本地 HTTP API，PostgreSQL + pgvector 保存运行时与派生数据，提案经过审批后才进入 canonical 内容。所有用户交互都应在 Web 控制台完成，只有本地文件系统访问保留原生交互能力。

当前仓库已提供 API handler、持久化、workflow 适配层和本地 Web 控制台。本文只记录当前代码可以实际执行的启动与使用方式。

- 面向作者/审核者的使用说明请看：[docs/user-guide.md](./docs/user-guide.md)

## 环境要求

- macOS 或 Linux
- [Bun](https://bun.sh/)（用于运行、测试和启动 API）
- pnpm 10（仓库锁定版本为 `pnpm@10.22.0`）
- Docker Desktop（用于本地 PostgreSQL + pgvector）
- 可选：OpenAI API Key。只有执行需要模型生成的 workflow 时才需要。

## 首次启动

在仓库根目录执行：

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

默认配置会启动：

- API：`http://localhost:3000`
- PostgreSQL：`localhost:55432`
- 数据库：`novel_enginner`
- 用户名和密码：`novel` / `novel`

首次启动前请确认 Docker Desktop 已运行。`db:generate` 生成 Prisma Client，`db:migrate` 应用仓库中的迁移；修改 Prisma schema 后需要重新执行这两个命令。

## 环境变量

`.env.example` 是本地开发模板：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 使用持久化时 | 默认指向 Docker 的 `localhost:55432` |
| `NOVEL_API_BASE_URL` | 否 | Web 控制台和 workflow 回调使用的 API 地址，默认 `http://localhost:3000` |
| `PORT` | 否 | API 监听端口，默认 `3000` |
| `OPENAI_API_KEY` | 模型生成时 | OpenAI provider 的 API Key |
| `OPENAI_BASE_URL` | 否 | OpenAI 兼容服务的地址 |
| `INNGEST_EVENT_KEY` | 异步 workflow 时 | Inngest 事件投递所需的 Key |
| `INNGEST_SIGNING_KEY` | 异步 workflow 时 | Inngest 验证 `/api/inngest` 回调的签名 Key |
| `INNGEST_BASE_URL` | 自托管 Inngest 时 | Inngest API 根地址，例如 `http://localhost:8288` |

没有设置 `DATABASE_URL` 时，API 仍可用于内存模式测试；重启进程后数据会丢失。设置 `DATABASE_URL` 后，命令和运行记录会持久化到 PostgreSQL。

## 常用命令

```bash
# 启动或停止本地数据库
pnpm db:up
pnpm db:down

# 启动 Web 控制台与本地 API（dev 和 start 当前都运行 Bun 服务）
pnpm dev
pnpm start

# 运行类型检查和测试
pnpm typecheck
pnpm test
```

也可以直接使用 Bun：

```bash
bun run src/runtime/server.ts
```

Web 控制台入口：

```text
http://localhost:3000/app
```

所有面向作者 / 编辑 / 审核者的操作都应在 Web 控制台完成；本地文件系统访问仍保留作为本机工作目录交互的能力，不再提供命令行交互入口。

## HTTP API

API 启动后，可以用 `curl` 提交与 Web 控制台相同的命令 envelope：

```bash
curl -X POST http://localhost:3000/commands \
  -H 'content-type: application/json' \
  -d '{
    "workspaceId": "workspace-cybernovel-001",
    "bookId": "book-quantum-ascension",
    "artifactType": "chapter-outline",
    "targetId": "chapter-0042-outline",
    "intent": "propose",
    "requestedBy": "author-local",
    "approvalMode": "manual",
    "idempotencyKey": "cmd-local-001"
  }'
```

成功时返回 `202`，响应中包含 `commandId`、`runId` 和 SSE 地址。随后可查询运行状态：

```bash
curl http://localhost:3000/runs/<runId>
curl http://localhost:3000/commands/<commandId>
curl http://localhost:3000/artifacts/chapter-outline/chapter-0042-outline
curl -N http://localhost:3000/runs/<runId>/stream
```

可用的主要路由包括：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/commands` | 提交提案、审批和恢复命令 |
| `GET` | `/commands/:commandId` | 查询命令 |
| `GET` | `/runs/:runId` | 查询运行快照 |
| `GET` | `/runs/:runId/stream` | 订阅 SSE 事件 |
| `GET` | `/artifacts/:artifactType/:targetId` | 查询工件摘要 |
| `POST` | `/sync/rebuild-graph` | 重建图谱 |
| `POST` | `/sync/re-sync-state` | 重新解析 canonical Markdown |

## 内容工作流

推荐的最小操作顺序是：

1. 在 `state/` 和 `manuscript/` 中维护 canonical Markdown。
2. 执行 `re-sync-state`，确认工作区可以被正确解析。
3. 使用 `propose` 或 `regenerate` 创建 proposal。
4. 通过运行状态和 SSE 事件观察执行结果。
5. 审核通过后执行 `approve`；需要绕过普通审批时才使用 `override-approve`。
6. 需要正文文件时执行 `export-draft`，完成人工编辑后再次执行 `re-sync-state`。

工作区为 `invalid` 时，写相关命令会被拒绝；系统会继续使用最后一个有效快照。canonical 写入与图谱、检索等 derived 数据是分开的，后者可能短暂处于未追平状态。

## 异步 workflow 说明

API 服务本身可以在没有 Inngest Key 的情况下启动，但 `propose` 等异步生成命令只有在 Inngest 事件投递和对应 worker 已配置时才会继续执行。模型生成还需要 `OPENAI_API_KEY`，或者配置 `OPENAI_BASE_URL` 指向兼容服务。

当前仓库没有额外提供独立的 Inngest 本地启动脚本；如果只想验证 API、持久化和状态机，可先不配置 `INNGEST_EVENT_KEY`，使用 `pnpm test` 和上述查询命令。

### 自托管 Inngest

使用自托管 Inngest 时，应用和 Inngest 服务必须使用相同的 Event Key 与 Signing Key，并将 `INNGEST_BASE_URL` 指向服务的 API 端口：

```dotenv
INNGEST_BASE_URL="http://localhost:8288"
INNGEST_EVENT_KEY="<your-event-key>"
INNGEST_SIGNING_KEY="<your-signing-key>"
```

应用启动后，Inngest handler 位于 `http://localhost:3000/api/inngest`。如果 Inngest 在 Docker 中运行而应用在宿主机运行，请在 Inngest 的应用配置中使用 `http://host.docker.internal:3000/api/inngest`，使容器能够访问该 handler。

## 停止服务

在 API 终端按 `Ctrl-C` 停止 Bun 服务；数据库容器可执行：

```bash
pnpm db:down
```

`db:down` 会停止并移除容器，但 Docker volume 默认保留。若需要清空本地数据库数据，请使用 Docker Desktop 删除 `novel-enginner-postgres` volume。