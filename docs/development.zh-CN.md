# 开发与维护

[文档导航](./README.zh-CN.md) · [English](./development.md)

## 本地开发

项目声明 Node.js `>=20`，CI 和 Dockerfile 使用 Node.js 22。按已提交的锁文件安装：

```bash
git clone https://github.com/vdeng-ai/ModelPing.git
cd ModelPing
npm ci
npm run dev
```

打开 `http://localhost:5173`。Vite 提供前端，并将 API 请求代理到端口 `8787` 的 Node 后端。验证构建后的同源运行：

```bash
npm run build
npm start
```

打开 `http://localhost:8787`。Node 入口读取 `process.env`，`npm start` 不会自动加载 `.env`；应导出环境变量，或运行 `node --env-file=.env dist/server/node.js`。公网使用前先阅读[部署与环境配置](./deployment.zh-CN.md)。

## 项目结构

| 路径                                                   | 职责                                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| `web/components/App.tsx`                               | 路由、连接／参数、模型选择和持久化协调           |
| `web/components/ToolboxPanel.tsx`                      | 本地凭据解码、输入输出和带入连接                 |
| `web/components/ConnectionPanel.tsx`                   | 供应商、地址、密钥、获取模型和余额查询           |
| `web/components/ModelSelect.tsx`                       | 可搜索模型选择器，以及键盘、触屏交互             |
| `web/components/useModelCatalog.ts`                    | 搜索与目录弹窗共享的按需目录状态                 |
| `web/components/ModelCatalogPanel.tsx`                 | 手动同步目录和导入供应商预设                     |
| `web/components/ModelTable.tsx`                        | 当前模型、直接展示的操作、请求设置和结果         |
| `web/components/ConfigPanel.tsx`                       | 高级参数弹窗内的字段                             |
| `web/components/HistoryPanel.tsx`                      | 会话历史、筛选、诊断和移除密钥字段的 JSON 导出   |
| `web/components/StatusPanel.tsx`                       | 手动／主动开启的自动探测，以及多标签页协调       |
| `web/components/SettingsPanel.tsx`                     | 供应商与模型编辑、导入和导出                     |
| `web/lib/`                                             | API、语言、编解码、模型选择、偏好与状态辅助逻辑  |
| `web/public/presets.json`                              | 默认供应商、模型 ID 和参数                       |
| `web/design-system/`                                   | 语义令牌、布局和组件样式约定                     |
| `src/adapters/`                                        | OpenAI Chat／Responses、Gemini、Anthropic 适配器 |
| `src/runner.ts`、`src/sse.ts`                          | 超时重试、SSE 解析、用量和失败诊断               |
| `src/protocols.ts`                                     | 供应商与模型的协议匹配规则                       |
| `src/app.ts`                                           | 共享 Hono API、校验、访问限制、持久化和目录接口  |
| `src/balance.ts`、`src/models-fetch.ts`、`src/ping.ts` | 余额、模型发现和状态探测                         |
| `src/private-state.ts`、`src/store/`                   | 私有工作态结构和文件／KV／Blob 存储              |
| `src/env.ts`、`src/node.ts`                            | 运行环境注入和 Node 服务                         |
| `src/worker.ts`、`api/index.ts`                        | Cloudflare Worker 和 Vercel 入口                 |
| `scripts/`                                             | 浏览器回归和可重复的文档截图                     |
| `.github/workflows/`                                   | CI 验证／审计和 Docker 镜像发布                  |

交互与边界参见[设计系统](../web/design-system/README.md)、[模型选择流程](./model-selection-workflow.md)及[目录实现](./model-catalog.md)。

## 常用命令

| 命令                                       | 用途                                |
| ------------------------------------------ | ----------------------------------- |
| `npm run dev`                              | Vite 与 Node API 热更新             |
| `npm run build`                            | 构建 `dist/client` 和 `dist/server` |
| `npm start`                                | 运行已构建的 Node 服务              |
| `npm run preview`                          | 构建后运行 Node 服务                |
| `npm run build:cf`／`npm run build:vercel` | 构建对应平台的静态资源              |
| `npm run deploy:cf`                        | 构建静态资源并调用 Wrangler 部署    |
| `npm run typecheck`                        | TypeScript 类型检查，不生成文件     |
| `npm run lint`                             | ESLint                              |
| `npm test`／`npm run test:watch`           | 单元测试／监听模式                  |
| `npm run verify`                           | 类型检查、Lint、单元测试和生产构建  |
| `npm run audit:prod`                       | 审计生产依赖树                      |
| `npm run test:workbench:browser`           | 构建并执行工作台浏览器回归          |
| `npm run test:toolbox:browser`             | 构建并执行凭据解码浏览器回归        |
| `npm run docs:screenshots`                 | 构建并截取当前中英文界面            |
| `npm run docs:check`                       | 检查公开文档链接、锚点和截图文件    |
| `npm run format`                           | 格式化仓库；提交前检查无关格式变化  |

## 验证

```bash
npm run verify
npm run test:workbench:browser
npm run test:toolbox:browser
npm run docs:check
```

浏览器检查优先使用本机 Chrome／Chromium，可设置 `CHROME_PATH`；没有本机浏览器时运行 `npx playwright install chromium`。测试启动本地生产构建和模拟 API，不需要真实密钥，也不调用付费供应商。产物位于 `node_modules/.cache/workbench-browser/` 和 `node_modules/.cache/toolbox-browser/`。

工作台回归覆盖请求 ID、去重、协议选择、按需读取／手动同步目录、键盘／输入法／触屏选择、弹窗焦点、未保存编辑保护、历史导出、状态批处理与轮询，以及 320／390／768／1440 像素的明暗主题布局。解码回归覆盖各编解码器、JWT／哈希、本地处理、存储／Worker／剪贴板失败与导航。测试通过不等于真实供应商兼容性验证或完整无障碍审计。

## 更新 README 截图

```bash
npm run docs:screenshots
npm run docs:check
```

截图脚本在 `docs/screenshots/` 生成每种语言八个视图：工作区、模型搜索、目录、参数、历史、状态、供应商和手机端。使用固定示例数据、`.example.com` 端点、明确的假密钥、本地模拟服务、固定时钟和外部请求拦截；不访问用户真实实例，也不同步真实目录。生成后必须打开 PNG 检查，不能仅凭命令通过就认定视觉正确。

桌面宽 1440 像素，手机宽 390 像素，均为浅色主题。英文 README 引用 `-en`，中文引用 `-zh`；两份 README 都保留模拟数据说明。详见[截图复核](./design-qa.md)。

## 维护约定

根 README 仅保留项目介绍与正常使用说明。开发、部署、架构和验证放到 `docs/`，使用相对链接并维护语言入口。`.gitignore` 只放行审核过的公开文档，其他本地笔记继续忽略，不要直接取消整个目录的忽略规则。

不得提交密钥、`.env`、真实响应日志、私有端点或含真实凭据的截图。测试历史仅在内存中保留：前端在所有私有工作态写入前清空历史，也不会恢复历史；服务端结构保留兼容字段不代表 UI 支持历史持久化。

默认供应商和模型在 `web/public/presets.json` 维护，展示名称与请求 ID 必须区分。目录同步只更新候选快照；选择目录模型要保留当前连接，不得静默保存预设或开始测试。

`main` push 和 PR 的 CI 执行 `npm ci`、`npm run audit:prod`、`npm run verify`。浏览器回归与截图是独立本地命令，目前未加入 CI。生产依赖审计不包含开发依赖；完整审计使用 `npm audit`。

`package.json` 中固定了 `@vercel/blob` 版本。升级前应重新审计并跑 Blob 读取／覆盖写测试，不要将某次审计结果视为长期无漏洞保证。固定路径写入使用 `allowOverwrite: true`。Docker 工作流只由手动触发或 `v*` 标签触发，不随普通 `main` push 发布；当前构建目标为 `linux/amd64`。
