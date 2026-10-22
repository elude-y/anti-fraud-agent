# C 任务完成审计

状态：代码与离线验收完成。真实 urlscan.io / VirusTotal 在线调用需要项目密钥，当前环境未配置，因此未做真实联网结果验证。

## 职责验收

| 要求 | 实现 | 验证 |
| --- | --- | --- |
| `sandbox_analyze(url)` | `src/lib/sandbox/analyze.ts`、`POST /api/sandbox` | `test:api` |
| urlscan.io 接入 | `src/lib/sandbox/urlscan.ts` | 类型检查、构建；等待真实密钥联网复验 |
| VirusTotal IOC | `src/lib/sandbox/virustotal.ts`、`checkIoc` | 类型检查、构建；等待真实密钥联网复验 |
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

## 外部条件项

在 `.env.local` 配置以下变量并重启服务后，才能完成真实在线双源复验：

```env
URLSCAN_API_KEY=
VIRUSTOTAL_API_KEY=
```

检查状态：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/sandbox
```

`urlscan` 和 `virustotal` 都变为 `true` 后，提交一个真实、可公开访问且不含隐私信息的测试域名，检查在线截图、跳转链、DOM 行为和 IOC 结果。
