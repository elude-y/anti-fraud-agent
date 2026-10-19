// src/lib/agent/orchestrate.ts —— 确定性编排（当前全 mock，所有任务完成后再替换为真实实现）
import { normalize, type NormalizedInput } from './normalize';
import { computeRuleScore } from './rules';
import { computeConfidence, type ConfidenceResult } from './confidence';
import { decidePath, type PathDecision } from './stateMachine';
import type { EvidenceNode, RagSearchResult, SandboxResult } from '@/lib/contracts';

// ⚠️ 当前使用 mock。全部任务完成后，替换为真实实现：
//   rag_search     → import { rag_search } from '@/lib/rag/retrieve'
//   sandboxAnalyze → import { sandboxAnalyze } from '@/lib/sandbox/analyze'

async function mockRagSearch(query: string): Promise<RagSearchResult> {
  void query;
  return {
    matches: [
      { caseId: 'mock-1', title: '快递理赔诈骗', category: '快递理赔', riskLabel: '诈骗', content: '包裹破损点击链接理赔', similarity: 0.91, source: '种子案例' },
      { caseId: 'mock-2', title: 'ETC 认证诈骗', category: 'ETC', riskLabel: '高危', content: 'ETC 账户停用请认证', similarity: 0.86, source: '种子案例' },
      { caseId: 'mock-3', title: '冒充客服诈骗', category: '冒充客服', riskLabel: '诈骗', content: '订单异常添加客服退款', similarity: 0.83, source: '种子案例' },
    ],
    topSimilarity: 0.91,
    labelAgreement: 0.67,
    coverageScore: 0.8,
  };
}

async function mockSandboxAnalyze(url: string): Promise<{ result: SandboxResult }> {
  return {
    result: {
      redirectChain: [
        { url, status: 302 },
        { url: 'https://claim-fake.example.cn/login', status: 200 },
      ],
      finalUrl: 'https://claim-fake.example.cn/login',
      formFields: ['密码', '银行卡号', '验证码'],
      jsBehaviors: ['表单外发', 'cookie读取'],
      brandImpersonation: '某快递平台',
      iocHits: [{ type: 'domain', value: 'claim-fake.example.cn', verdict: '恶意' }],
      verdict: '诈骗',
    },
  };
}

export interface AnalysisResult {
  normalized: NormalizedInput;
  ruleScore: number;
  rag: RagSearchResult;
  confidence: ConfidenceResult;
  decision: PathDecision;
  sandbox: SandboxResult | null;
  evidenceChain: EvidenceNode[];
}

export async function runAnalysis(input: string): Promise<AnalysisResult> {
  // 1. 规范化
  const normalized = await normalize(input);
  const evidence: EvidenceNode[] = [];

  // 2. 规则分
  const ruleScore = computeRuleScore(normalized);

  // 3. RAG 检索（mock）
  let rag: RagSearchResult;
  try {
    rag = await mockRagSearch(normalized.raw);
  } catch (err) {
    console.error('RAG 检索失败，降级为空结果：', (err as Error).message);
    rag = { matches: [], topSimilarity: 0, labelAgreement: 0, coverageScore: 0 };
  }
  evidence.push({
    id: `rag-${Date.now()}`,
    type: 'rag',
    label: `案例库检索：命中 ${rag.matches.length} 条相似案例`,
    payload: {
      topSimilarity: rag.topSimilarity,
      labelAgreement: rag.labelAgreement,
      coverageScore: rag.coverageScore,
      matches: rag.matches.slice(0, 3).map((m) => ({
        title: m.title,
        category: m.category,
        riskLabel: m.riskLabel,
        similarity: m.similarity,
      })),
    },
    ts: Date.now(),
  });

  // 4. 置信度计算（四信号加权）
  const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);
  evidence.push({
    id: `confidence-${Date.now()}`,
    type: 'confidence',
    label: `置信度评估：${(confidence.score * 100).toFixed(0)}%（${confidence.level}）`,
    payload: { score: confidence.score, signals: confidence.signals, reason: confidence.reason },
    ts: Date.now(),
  });

  // 5. 路径决策（含规则兜底）
  const decision = decidePath(confidence, normalized);

  // 6. 沙箱动态分析（低置信度 / 规则兜底时，mock）
  let sandbox: SandboxResult | null = null;
  if (decision.path === 'sandbox' && normalized.urls.length > 0) {
    try {
      const envelope = await mockSandboxAnalyze(normalized.urls[0]);
      sandbox = envelope.result;
      evidence.push({
        id: `sandbox-${Date.now()}`,
        type: 'sandbox',
        label: `沙箱动态验证：${sandbox.verdict}`,
        payload: {
          redirectChain: sandbox.redirectChain,
          formFields: sandbox.formFields,
          jsBehaviors: sandbox.jsBehaviors,
          iocHits: sandbox.iocHits,
          brandImpersonation: sandbox.brandImpersonation,
        },
        ts: Date.now(),
      });
    } catch (err) {
      console.error('沙箱分析失败：', (err as Error).message);
      sandbox = null;
    }
  }

  return { normalized, ruleScore, rag, confidence, decision, sandbox, evidenceChain: evidence };
}
