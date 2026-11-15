# SafeAgent

SafeAgent 是面向可疑链接和诈骗短信的智能研判系统。当前版本完成输入规范化、案例检索、置信度融合、沙箱行为验证、证据链可视化、历史快照与全链路回放。

## 核心能力

- `/api/analyze` 通过 AI SDK 的 UI Message Stream 流式输出阶段、工具、证据和最终结论。
- 研判页使用 `useChat` 消费服务端流事件，而不是在前端伪造分析进度。
- 沙箱统一接入 urlscan.io、VirusTotal 和内置 Tier0 模板。
- RAG 优先使用 Supabase 向量检索，缺少密钥或 Embedding 服务时自动回退到内置案例索引。
- 未配置 API Key、断网或额度耗尽时，Tier0 仍可完成离线演示。
- Tier0 行为在界面中明确标注为离线模板，不会与真实在线扫描混淆。
- Tier0 不生成模拟截图；在线链接优先由本地 Chrome 无头浏览器完整捕获，未安装 Chrome 的远端部署会回退到 urlscan 或远端截图服务，仍不可用则隐藏截图区域。
- 沙箱证据节点展示真实页面截图（可用时）、跳转链、表单字段、脚本行为、IOC、数据来源与降级原因。
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
| `SAFEAGENT_REMOTE_SCREENSHOT` | 无本机 Chrome 时启用远端页面截图兜底，默认开启；设为 `0` 可关闭 |
| `SCREENSHOT_SERVICE_URL` | 可选的自定义截图图片地址模板，支持 `{url}`、`{encodedUrl}`、`{rawUrl}` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址，启用在线案例库 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名访问密钥 |
| `EMBEDDING_BASE_URL` | 兼容 OpenAI Embeddings 协议的服务地址 |
| `EMBEDDING_API_KEY` | Embedding 服务密钥 |
| `EMBEDDING_MODEL` | Embedding 模型名称 |
| `DEEPSEEK_API_KEY` | 启用模型规划、检索重排和助手问答 |

演示域名、保留域名、回环地址和私有 IP 不会提交给外部沙箱。

链接沙盒的页面截图优先在本机 Chrome 中生成；部署环境没有 Chrome 时，默认通过 THUM.io 生成远端截图，也可用 `SCREENSHOT_SERVICE_URL` 接入自有截图服务。只对通过公网安全校验的 HTTP(S) 链接启用。

截图研判入口在「智能研判 → 短信」。支持 32 MB 以内的 PNG 或 JPEG。浏览器先识别有效内容并跳过纯空白区域，再按内容分段；长图分成最多 6 段，每段压缩到 2 MB 以内。超长截图或超过 4800 万像素的图片请先裁切。识别后可滚动查看原图标注，超过 500 字可展开完整转录并选取需要研判的内容。图片不写入本机历史记录。

本机 OCR 支持中英文，不需要服务密钥。使用视觉模型时，在 .env.local 配置 VISION_BASE_URL、VISION_API_KEY 和 VISION_MODEL，模型须支持通过 Chat Completions 接收图片。只有 VISION_BASE_URL 和 VISION_API_KEY 都为空时，才复用已配置的 DEEPSEEK_BASE_URL 与 DEEPSEEK_API_KEY。仍须显式设置支持图片的 VISION_MODEL。修改环境变量后重启应用。

## 验证命令

```bash
npm run lint
npm run build
npm run eval:ablation
```

消融脚本直接调用网页研判使用的同一服务函数，对比规则、规则加 RAG、完整工作流。报告写到 .safeagent-eval/ablation.json，分别记录原合成样本和新增回归样本，并报告待核验比例和风险召回率。旧的 scripts/ablation-results.json 是改造前的历史快照。快速回归用 npm run eval:ablation -- --regression。可用 npm run eval:ablation -- --dataset 已脱敏留出集.json 加载独立评测数据，格式为由 input 和 label 组成的 JSON 数组。请保留留出集来源，并优先使用保留域名或经允许的测试链接。报告记录请求数、供应商返回的 token、延迟、待核验、误报和漏报。通过 --rates 单价.json 可估算成本。费率 JSON 包含 currency 和 providers，其中 chat、embedding、virustotal、urlscan 可分别设置 perRequest、perMillionInputTokens、perMillionOutputTokens。缺少费率或用量的服务会列入未核算项。

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

完整职责验收见 [`docs/c-completion-audit.md`](docs/c-completion-audit.md)。

重新生成 Tier0 模板快照：

```powershell
npm run assets:tier0
```

## 主要接口

- `POST /api/analyze`：流式研判入口，接受 `messages` 或兼容的 `{ input, mode, forceTier0 }` 请求体。
- `POST /api/sandbox`：独立沙箱分析入口。
- `GET /api/sandbox`：返回外部沙箱配置状态。
- `POST /api/check-ioc`：VirusTotal URL、域名或 IP 信誉查询。
- `GET /api/cases`：案例库数据。


