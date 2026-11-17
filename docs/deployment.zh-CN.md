# 部署、环境配置与安全

[文档导航](./README.zh-CN.md) · [English](./deployment.md)

ModelPing 会把 API 凭据和请求转发到用户选择的端点。公网使用前必须配置访问控制与存储。本页描述仓库中的实现和配置，不承诺平台价格或免费额度。

## 选择运行方式

| 运行方式           | 前端与 API                 | 预设及加密私有工作态                             | 全球目录存储                              |
| ------------------ | -------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Node／Docker       | 单个 Node 服务             | 默认文件驱动                                     | 当前 Node 入口未接入                      |
| Cloudflare Workers | Static Assets + Worker API | `SETTINGS_KV`                                    | 同一 KV 命名空间的独立 `model-catalog` 键 |
| Vercel             | 静态前端 + `api/index.ts`  | 有 `BLOB_READ_WRITE_TOKEN` 时使用 Blob，否则关闭 | 当前 Vercel 入口未接入                    |

没有目录存储时，已配置模型、自定义 ID、获取模型列表和测试仍然可用。目录 GET 返回不可用／空快照，主动同步返回 HTTP 501；这与供应商预设能否持久化是两回事。参见[目录实现](./model-catalog.md)。

## Node

```bash
npm ci
npm run build
cp .env.example .env
# 填写 APP_PASSWORD，以及独立的高熵 PRIVATE_STATE_SECRET。
# 公网启动前检查目标主机限制。
node --env-file=.env dist/server/node.js
```

默认端口为 `8787`。`npm start` 使用相同入口，但需要调用方传入环境变量，不自动读取 `.env`。不要把真实密钥放进命令历史或 Git。开发运行方式见[开发说明](./development.zh-CN.md)。

默认预设文件为 `./web/public/presets.json`，在 UI 编辑供应商可能修改此文件。需要分离运行数据时设置 `SETTINGS_FILE=./data/presets.json`，并保护、备份数据目录。预设文件不存在时回退到内置默认值；私有工作态密文默认写入 `./data/private-state.enc`。

## Docker

[Dockerfile](../Dockerfile) 构建前后端，以非 root 的 `node` 用户运行。[Compose 文件](../docker-compose.yml) 包含应用和 Watchtower。

启动前，将 Compose 中的 `image:` 改成实际发布的镜像与标签。仓库中写好的镜像名不代表你的 fork 已有可拉取镜像；也可将 `image:` 替换为 `build: .` 在本机构建。

```bash
cp .env.example .env
# 填写 APP_PASSWORD 和 PRIVATE_STATE_SECRET，Compose 要求两者非空。
docker compose up -d
# 改用 build: . 后执行：docker compose up -d --build
```

应用暴露 `8787` 端口。预设使用命名卷 `presets-data` 中的 `/data/presets.json`；私有工作态使用绑定目录 `./data` 中的 `/app/data/private-state.enc`。确保绑定目录允许容器内 `node` 用户写入。暴露端口前配置 HTTPS 反向代理和访问限制。

[镜像发布工作流](../.github/workflows/docker-publish.yml) 由手动触发或 `v*` 标签触发，目标为 `ghcr.io/<owner>/<repository>`。确认实际生成的标签，不要假定每次标签发布都更新 `latest`。异机拉取前应将 Package 设为公开，或提供镜像仓库凭据。当前仅构建 `linux/amd64`。

Watchtower 每 300 秒检查带标签的容器，持有 Docker socket 访问能力。不需要自动替换镜像时移除该服务，改为明确执行 `docker compose pull && docker compose up -d`。普通 `main` push 不会发布 Docker 镜像。

## Cloudflare Workers

[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/vdeng-ai/ModelPing)

部署向导中的资源绑定和密钥需要逐项检查，部署按钮不等于已完成安全配置。使用自己账号下的 KV 命名空间：[wrangler.toml](../wrangler.toml) 中已提交的 ID 不能直接用于其他账号。

CLI 部署准备：

```bash
npm ci
npx wrangler login
npx wrangler kv namespace create SETTINGS_KV
```

将现有绑定块中的 `id` 替换为返回值，不要追加重复绑定：

```toml
[[kv_namespaces]]
binding = "SETTINGS_KV"
id = "<your-kv-namespace-id>"
```

通过控制台／部署配置或 Wrangler，将 `APP_PASSWORD` 和 `PRIVATE_STATE_SECRET` 设置为 Worker secrets：

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put PRIVATE_STATE_SECRET
npm run deploy:cf
```

首次部署时，Wrangler 可能需要先创建 Worker 才能写入 secrets。两项密钥设置完成前保持路由／访问受限，不要留下无口令的公网转发代理。密钥值不写入 `wrangler.toml`。

仓库配置使用 `dist/client` 作为 Static Assets，开启 SPA 回退，并设置 `run_worker_first = ["/api/*"]`，仅 API 路由配置为优先执行 Worker。应用默认值是 `PRIVATE_STATE_SCOPE=config`、`DAILY_REQUEST_BUDGET=60000`、`BLOCK_PRIVATE_HOSTS=1`。请求预算只是状态自动刷新的本地软估算，不是账号级强制限额、实时用量报告或剩余额度保证。

接入 Workers Builds 时，生产分支使用 `main`，构建命令 `npm run build:cf`，部署命令 `npx wrangler deploy`；目标环境的 secrets 和资源绑定另行配置。实际 Worker／KV 限制与用量以账号配置为准，本页不固化免费套餐额度。

## Vercel

在 Vercel 关联仓库，或通过 CLI 关联：

```bash
npx vercel
# 完成环境配置与验证后：
npx vercel --prod
```

[vercel.json](../vercel.json) 使用 `npm run build:vercel` 构建并托管 `dist/client`，将 `/api/*` 转到 [api/index.ts](../api/index.ts) 的 Node 入口。公开生产环境前，在项目环境设置中配置访问控制与密钥。

需要持久化时配置 Blob 和 `BLOB_READ_WRITE_TOKEN`；没有该值时，Vercel 入口默认 `STORAGE_DRIVER=none`。Blob 驱动使用固定的预设／私有工作态路径，SDK 升级后应验证覆盖写入。

检查实际项目配置中的函数时长、流式响应和资源限制。仓库没有设置 `maxDuration`，应用的 30 秒超时不能延长平台执行时限。长响应被中断时，应降低请求超时或选择适合的运行环境。

## 环境变量

| 变量                    | 含义／仓库默认值                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `APP_PASSWORD`          | 受保护 API 的访问口令，以 `x-app-password` 提交，不是供应商 API Key。健康接口仍可用于能力发现。                     |
| `PRIVATE_STATE_SECRET`  | 独立高熵加密密钥，优先使用 v2 密文格式，建议与访问口令分开。                                                        |
| `STATUS_SECRET`         | 旧版本加密密钥回退；两项独立密钥均未设置时才回退到 `APP_PASSWORD`。                                                 |
| `PRIVATE_STATE_SCOPE`   | `full`（服务端默认）、`config` 或 `none`。当前 UI 在任何范围下都不保存／恢复测试历史；`none` 关闭私有工作态持久化。 |
| `STORAGE_DRIVER`        | `file`、`cf-kv`、`vercel` 或 `none`；Worker 入口只支持 `cf-kv`／`none`，默认按运行环境选择。                        |
| `SETTINGS_FILE`         | 文件驱动预设路径，默认 `./web/public/presets.json`。                                                                |
| `PRIVATE_STATE_FILE`    | 文件驱动密文路径，默认 `./data/private-state.enc`。                                                                 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 存储凭据。                                                                                              |
| `ALLOWED_HOSTS`         | 可选的逗号分隔目标主机白名单，未设置则不启用白名单。                                                                |
| `BLOCK_PRIVATE_HOSTS`   | `1` 启用现有私有地址拦截；共享 API 默认关闭，`wrangler.toml` 中开启。                                               |
| `CORS_ORIGIN`           | 明确允许的跨站来源，逗号分隔；未设置时不下发跨源 ACAO。处理凭据的实例不应使用 `*`。                                 |
| `DAILY_REQUEST_BUDGET`  | 状态自动刷新的日请求软预算，Worker 配置为 `60000`；不是供应商 Token 消费上限。                                      |
| `PORT`                  | Node 监听端口，默认 `8787`。                                                                                        |

`SETTINGS_KV` 是 Worker 资源绑定，不是普通文本变量。Node 使用进程环境，Docker Compose 读取其 `.env`，Worker／Vercel 密钥在各自环境中配置。参见 [.env.example](../.env.example)、[环境注入](../src/env.ts)和 [Worker 入口](../src/worker.ts)。

## 存储与隐私

供应商预设只包含端点和模型 ID，不包含 API Key，可以缓存在浏览器；应按非敏感配置处理。有可用存储和加密密钥时，上次连接、参数、已保存的自定义模型 ID、状态条目可以加密保存。连接和状态条目可能含 API Key。

当前前端的测试历史仅存在内存中，每次写入私有工作态都会移除历史，即使 `PRIVATE_STATE_SCOPE=full` 也不例外。后端兼容字段不代表恢复了历史持久化。旧版敏感浏览器存储会迁移／删除；主题、语言和非敏感偏好仍保留在本地。

解码输入输出和 JWT 签名密钥只在浏览器内存中保留；把结果带入连接表单后，它就成为连接信息，可以被加密保存。实际请求和查询需要把凭据经过后端发送给目标服务商；存储加密不能让恶意实例变得可信。

实例使用共享存储路径，不是按用户隔离的多租户系统，不应由互不信任的用户共用。安全备份密文和加密密钥，修改或丢失加密密钥可能导致旧数据不可读。历史导出只移除明确的 API Key 字段，不保证响应中被回显的任意敏感文本也被移除。

## 公网部署检查

使用 HTTPS 和强访问口令；通过 `ALLOWED_HOSTS` 和／或网络出站控制限制目标，并将应用私有地址拦截作为补充。执行内置[出站防火墙脚本](../deploy/firewall-egress.sh)前，先按部署环境复核；该脚本会修改主机网络规则。

私有地址检查不是对 DNS rebinding 的完整防护。CORS 约束浏览器跨域访问，不是身份认证，也不能阻止非浏览器直接请求；不能单靠这些机制保护公网代理。本地／内网测试应在专门受限的实例中进行，而不是关闭公网实例的防护。

应用失败日志有脱敏处理，但上游响应仍可能含敏感文本；另行检查反向代理／平台日志，不新增原始请求体或凭据日志。分享实例前，验证口令门、允许的目标、存储行为和代表性请求。
