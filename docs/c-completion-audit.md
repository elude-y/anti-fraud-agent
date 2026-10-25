# C 任务完成审计

状态：代码、离线验收和真实在线双源验证均已完成。2026-10-25 使用 `https://www.wikipedia.org/` 验证 urlscan.io 与 VirusTotal 均成功返回。

## 职责验收

| 要求 | 实现 | 验证 |
| --- | --- | --- |
| `sandbox_analyze(url)` | `src/lib/sandbox/analyze.ts`、`POST /api/sandbox` | `test:api` |
| urlscan.io 接入 | `src/lib/sandbox/urlscan.ts` | 已联网验证真实截图与页面结果 |
| VirusTotal IOC | `src/lib/sandbox/virustotal.ts`、`checkIoc` | 已联网验证域名信誉查询 |
| 独立 `check_ioc` 工具接口 | `POST /api/check-ioc` | 参数校验、供应商状态与持久化 |
| Tier0 离线兜底 | `src/lib/sandbox/tier0.ts` | 恶意、安全、未知、纯短信场景 |
| 页面截图 | 五种 Tier0 模板快照 + 在线 urlscan 截图 | `snapshotAsset`、UI 截图检查 |
| 跳转链 | 沙箱证据节点 | API/UI 冒烟测试 |
| 表单字段 | 沙箱证据节点 | 恶意与安全场景 |
| JS 行为 | 沙箱证据节点 | API/UI 冒烟测试 |
| IOC 命中 | 沙箱证据节点与风险信号 | API/UI 冒烟测试 |
| `useChat` 流式消费 | `src/components/analysis-workbench.tsx` | 自动研判、阶段推进 |
| 阶段时间线 | `src/components/stages` | 端到端 UI 测试 |
| 证据节点图 | `src/components/evidence-chain` | 风险信号、攻击链、详情 |
| 结论卡 | `src/components/result-card` | 风险等级、置信度、原因 |
| Framer Motion | 阶段、节点、结论动画 | 构建与 UI 测试 |
| 全链路回放 | `src/lib/analysis-store.ts`、历史页 | `replay` 测试 |
| 输入页 | `src/app/page.tsx` | 首页与自动跳转测试 |
| 研判页 | `src/app/analyze/page.tsx` | 桌面、390px 移动端 |
| 案例库 | `GET /api/cases`、`/cases` | `cases` 测试 |
| Dashboard | `/insights` | 构建检查 |
| 可疑 URL 不直接打开 | 仅作为文本和图片证据展示 | 代码审查 |
| 敏感参数脱敏 | URL、手机号、证件号、银行卡号、邮箱 | `piiRedaction` 测试 |

## 自动验收命令

```powershell
cd D:\传智杯web\anti-fraud-agent-main
npm run lint
npx tsc --noEmit
npm run build

$env:SAFEAGENT_BASE_URL='http://127.0.0.1:3000'
npm run test:api
npm run test:ui
```

最近一次结果：全部通过。生产构建和 390px 移动端结果页也已单独验证。

## 在线配置

当前 `.env.local` 已配置并验证以下变量：

```env
URLSCAN_API_KEY=
VIRUSTOTAL_API_KEY=
```

检查状态：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/sandbox
```

`urlscan` 和 `virustotal` 当前均为 `true`。真实测试应继续使用可公开访问且不含隐私信息的域名。
