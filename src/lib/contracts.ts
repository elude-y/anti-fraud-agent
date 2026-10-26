import type { UIMessage } from "ai";

// src/lib/contracts.ts

// ────────────────────────────────────────────────────────────
// 契约① RAG 检索结果（B 实现 rag_search 的返回，A 消费）
// ────────────────────────────────────────────────────────────
export interface RagMatch {
  caseId: string;
  title: string;
  category: string; // 冒充客服 / 快递理赔 / ETC / KYC / 中奖 / 刷单 / 杀猪盘 ...
  riskLabel: '安全' | '可疑' | '高危' | '诈骗';
  content: string; // 命中片段/摘要
  similarity: number; // 余弦相似度 [0,1]
  source: string;
}

export interface RagSearchResult {
  matches: RagMatch[];
  topSimilarity: number; // top-1 相似度 [0,1]
  labelAgreement: number; // top-K 标签一致性 [0,1]
  coverageScore: number; // 关键要素覆盖度 [0,1]
  /** 命中的话术模式（patterns 表），与案例互补；可选字段，向后兼容 */
  patterns?: RagPatternMatch[];
}

export interface RagPatternMatch {
  patternId: string;
  pattern: string; // 话术模式描述
  category: string;
  keywords: string[];
  similarity: number; // 余弦相似度 [0,1]
}

// ────────────────────────────────────────────────────────────
// 契约② 沙箱行为证据（C 实现 sandbox_analyze 的返回，A 消费）
// ────────────────────────────────────────────────────────────
export interface RedirectHop {
  url: string;
  status?: number;
}

export interface IocHit {
  type: 'domain' | 'url' | 'ip';
  value: string;
  verdict: string;
}

export interface SandboxResult {
  redirectChain: RedirectHop[];
  finalUrl: string;
  screenshotUrl?: string;
  formFields: string[]; // ['密码','银行卡号','验证码','身份证',...]
  jsBehaviors: string[]; // ['cookie读取','表单外发','键盘监听','隐藏iframe',...]
  brandImpersonation?: string; // 仿冒品牌
  iocHits: IocHit[];
  verdict: string;
  raw?: unknown;
}

export type SandboxSource =
  | 'tier0'
  | 'urlscan'
  | 'virustotal+tier0'
  | 'urlscan+virustotal';

export type ProviderState = 'used' | 'not-configured' | 'skipped' | 'failed';

export interface SandboxEnvelope {
  source: SandboxSource;
  latencyMs: number;
  result: SandboxResult;
  providers: {
    urlscan: ProviderState;
    virustotal: ProviderState;
  };
  fallbackReasons: string[];
}

export interface SandboxEvidencePayload {
  description: string;
  tags: string[];
  sandbox: SandboxResult;
  sandboxMeta: Omit<SandboxEnvelope, 'result'>;
}

// ────────────────────────────────────────────────────────────
// 契约③ 案例库（B 提供 GET /api/cases，C 消费）
// ────────────────────────────────────────────────────────────
export interface CaseItem {
  id: string;
  title: string;
  category: string;
  riskLabel: '安全' | '可疑' | '高危' | '诈骗';
  content: string;
  source: string;
}

export interface CasesResponse {
  items: CaseItem[];
  total: number;
}

// ────────────────────────────────────────────────────────────
// 契约④ 证据链节点（A 生产，C 渲染）
// ────────────────────────────────────────────────────────────
export type EvidenceNodeType =
  | 'input'
  | 'rag'
  | 'confidence'
  | 'sandbox'
  | 'synthesis'
  | 'conclusion';

export interface EvidenceNode {
  id: string;
  type: EvidenceNodeType;
  label: string;
  payload: unknown; 
  ts: number;
}

// ────────────────────────────────────────────────────────────
// 契约⑤ 研判结论（A 生产，C 渲染最终结论卡）
// ────────────────────────────────────────────────────────────
export type RiskLevel = '安全' | '可疑' | '高危' | '诈骗';

export interface VerdictResult {
  verdict: RiskLevel;
  confidence: number; // [0,1]
  suggestion: string; // 处置建议
  evidenceChain: EvidenceNode[];
}

export type AnalysisStage =
  | 'normalize'
  | 'rag'
  | 'confidence'
  | 'sandbox'
  | 'synthesis'
  | 'done';

export type AnalysisTool = 'rag_search' | 'sandbox_analyze' | 'check_ioc';

export type StreamEvent =
  | { type: 'stage'; stage: AnalysisStage }
  | { type: 'tool'; tool: AnalysisTool; status: 'start' | 'done'; data?: unknown }
  | { type: 'text'; delta: string }
  | ({ type: 'result' } & VerdictResult);

export interface StageStreamData {
  stage: AnalysisStage;
  status: 'active' | 'done' | 'skipped';
  at: number;
}

export interface ToolStreamData {
  tool: AnalysisTool;
  status: 'start' | 'done';
  at: number;
  data?: unknown;
}

export interface AnalysisStreamResult extends VerdictResult {
  input: string;
  mode: 'link' | 'message';
  path: 'fast' | 'sandbox';
  sandbox: SandboxResult | null;
  sandboxMeta: Omit<SandboxEnvelope, 'result'> | null;
  summary: string;
}

export type SafeAgentUIMessage = UIMessage<
  never,
  {
    stage: StageStreamData;
    tool: ToolStreamData;
    evidence: EvidenceNode;
    result: AnalysisStreamResult;
  }
>;
