# SafeAgent 最新完整交接说明

交接日期：2026-11-08

## 1. 当前版本

- 项目目录：`D:\传智杯web\anti-fraud-agent-main`
- Git 分支：`feat/c-sandbox-evidence`
- 远端最新提交：`3f88528`
- 当前工作区还包含尚未提交的 AI 助手、可信域名、测试和界面更新
- 本交接包按“当前完整工作区”打包，不是只打包某个提交
- `main` 未合并本分支

## 2. 启动方式

要求 Node.js 20 或更高版本。

```powershell
cd D:\传智杯web\anti-fraud-agent-main
npm install
npm run dev
```

正式部署使用生产模式，不要用 `next dev` 对外提供服务：

```powershell
npm run build
npm start
```

服务器建议使用 PM2：

```powershell
pm2 start npm --name safeagent -- start
pm2 save
```

## 3. 环境变量

完整交接包含真实 `.env.local`，仅限团队内部私发，不得上传 GitHub、群聊或公开网盘。

### A：Agent / LLM

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### B：RAG / Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=
```

### C：在线沙箱

```env
URLSCAN_API_KEY=
URLSCAN_VISIBILITY=unlisted
URLSCAN_MAX_WAIT_MS=24000
VIRUSTOTAL_API_KEY=
```

检查配置：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/sandbox
```

在线双源正常时：

```json
{"providers":{"urlscan":true,"virustotal":true,"tier0":true}}
```

## 4. 分工与文件归属

### A：Agent 编排

- `src/lib/agent/`
- `src/app/api/analyze/route.ts`
- `src/app/api/assistant/route.ts`
- `src/lib/contracts.ts` 中流式事件和证据链契约

负责输入规范化、置信度、路径决策、规则兜底、结论合成和流式协议。

### B：RAG 与数据

- `src/lib/rag/`
- `src/lib/db/`
- `supabase/migrations/`
- `supabase/seed.sql`
- `scripts/seed*.ts`
- `scripts/audit-data.ts`
- `scripts/eval*.ts`
- `scripts/verify-offline.ts`
- `scripts/verify-patterns.ts`

负责 Supabase、向量检索、内存向量库兜底、案例和话术数据。

### C：沙箱与前端

- `src/lib/sandbox/`
- `src/app/api/sandbox/route.ts`
- `src/app/api/check-ioc/route.ts`
- `src/components/`
- `src/app/page.tsx`
- `src/app/analyze/page.tsx`
- `src/app/history/page.tsx`
- `src/app/cases/page.tsx`
- `src/app/insights/page.tsx`
- `src/app/globals.css`
- `src/app/*.module.css`
- `public/tier0-*-snapshot.png`
- `scripts/api-smoke.mjs`
- `scripts/ui-smoke.mjs`
- `scripts/generate-tier0-snapshots.mjs`
- `scripts/fixtures/tier0-snapshot.html`

负责流式工作台、阶段时间线、风险可视化、攻击链、结论卡、截图、Tier0、回放和移动端适配。

### 共享

- `package.json`
- `package-lock.json`
- `next.config.ts`
- `.env.example`
- `README.md`
- `docs/`

## 5. 当前主链路

```text
用户输入
  -> 输入规范化
  -> RAG 检索（Supabase / 内存库 / 内置案例）
  -> 置信度与路径决策
  -> 沙箱（urlscan + VirusTotal / Tier0）
  -> 证据链与风险原因
  -> 结论卡
  -> 历史快照与回放
```

## 6. 主要接口

- `POST /api/analyze`：UI Message Stream 主研判接口
- `POST /api/sandbox`：独立沙箱分析
- `GET /api/sandbox`：沙箱供应商状态
- `POST /api/check-ioc`：VirusTotal IOC 查询
- `GET /api/cases`：案例列表
- `POST /api/rag`：RAG 检索
- `POST /api/analyze/rag_search`：兼容检索接口
- `POST /api/search-fraud`：兼容检索接口
- `POST /api/assistant`：AI 反诈助手流式接口

## 7. 验收命令

```powershell
npm run lint
npx tsc --noEmit
npm run build

$env:SAFEAGENT_BASE_URL='http://127.0.0.1:3000'
npm run test:api
npm run test:ui
```

最近一次 C 相关验证：

- 恶意链接：诈骗
- 官方安全链接：安全
- 纯短信：高危，且不伪造页面证据
- URLScan、VirusTotal、Tier0：全部已启用
- 真实在线测试：`https://www.wikipedia.org/`
- 桌面和 390px 移动端：无横向溢出
- 历史回放、自动研判、IOC 参数校验：通过

## 8. 演示

- `docs/c-demo-guide.md`：C 三分钟演示顺序
- `docs/答辩材料-三场景剧本.md`：三场景答辩脚本
- `docs/c-completion-audit.md`：C 职责完成审计
- `docs/data-provenance.md`：数据来源与口径
- `artifacts/`：最新桌面、移动端和 AI 助手截图

## 9. 已知事项

1. `.env.local` 含数据库和 API 密钥，只在团队内部传递。
2. 正式部署必须使用 `npm run build && npm start`，不要用 `next dev` 对外提供服务。
3. Next.js 16.4.0 有官方安全升级提示，升级前需要完整回归测试。
4. 当前工作区有未提交改动，交接包已包含这些最新文件。
5. 修改环境变量后必须重启服务。

## 10. 建议接手顺序

1. 先读取本文件。
2. 检查 `.env.local` 和 `npm install`。
3. 运行 `npm run lint`、`npx tsc --noEmit`、`npm run build`。
4. 启动生产模式并打开首页。
5. 按 C 演示文档跑一次研判、截图和回放。
6. 再按 A/B 分工进入各自模块。
