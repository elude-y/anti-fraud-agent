# SafeAgent

SafeAgent 是面向可疑链接和诈骗短信的智能研判系统。当前版本完成输入规范化、案例检索、置信度融合、沙箱行为验证、证据链可视化、历史快照与全链路回放。

## 核心能力

- `/api/analyze` 通过 AI SDK 的 UI Message Stream 流式输出阶段、工具、证据和最终结论。
- 研判页使用 `useChat` 消费服务端流事件，而不是在前端伪造分析进度。
- 沙箱统一接入 urlscan.io、VirusTotal 和内置 Tier0 模板。
- RAG 优先使用 Supabase 向量检索，缺少密钥或 Embedding 服务时自动回退到内置案例索引。
- 未配置 API Key、断网或额度耗尽时，Tier0 仍可完成离线演示。
- Tier0 行为在界面中明确标注为离线模板，不会与真实在线扫描混淆。
- 沙箱证据节点展示截图、跳转链、表单字段、脚本行为、IOC、数据来源与降级原因。
- 展示与分析快照会脱敏手机号、证件号、银行卡号、邮箱及 URL 敏感参数。
- 历史记录保存完整分析快照，可从历史页载入并回放同一份证据链。
- 可疑 URL 只在服务端处理，前端不创建可点击跳转。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。所有环境变量均为可选项，空配置会自动使用 Tier0。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `URLSCAN_API_KEY` | 启用 urlscan.io 动态扫描 |
| `URLSCAN_VISIBILITY` | 扫描可见性，默认 `unlisted` |
| `URLSCAN_MAX_WAIT_MS` | 等待扫描结果的最长时间 |
| `VIRUSTOTAL_API_KEY` | 启用 VirusTotal URL、域名与 IOC 查询 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址，启用在线案例库 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名访问密钥 |
| `EMBEDDING_BASE_URL` | 兼容 OpenAI Embeddings 协议的服务地址 |
| `EMBEDDING_API_KEY` | Embedding 服务密钥 |
| `EMBEDDING_MODEL` | Embedding 模型名称 |
| `DEEPSEEK_API_KEY` | 保留的模型密钥，不影响 Tier0 演示主链路 |

演示域名、保留域名、回环地址和私有 IP 不会提交给外部沙箱。

## 验证命令

```bash
npm run lint
npm run build
```

浏览器冒烟测试需要先启动产品服务：

```bash
npm start -- -p 3001
SAFEAGENT_BASE_URL=http://127.0.0.1:3001 npm run test:ui
```

PowerShell 写法：

```powershell
$env:SAFEAGENT_BASE_URL='http://127.0.0.1:3001'
npm run test:api
npm run test:ui
```

测试覆盖流式研判、安全链接、纯短信、PII 脱敏、Tier0 降级、证据渲染、历史入库、快照回放和 390px 移动端结果页。

录制演示视频可参考 [`docs/c-demo-guide.md`](docs/c-demo-guide.md)。

## 主要接口

- `POST /api/analyze`：流式研判入口，接受 `messages` 或兼容的 `{ input, mode }` 请求体。
- `POST /api/sandbox`：独立沙箱分析入口。
- `GET /api/sandbox`：返回外部沙箱配置状态。
- `GET /api/cases`：案例库数据。
