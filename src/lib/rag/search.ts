import { demoCases } from "@/lib/demo-data";
import type { RagMatch, RagSearchResult } from "@/lib/contracts";

const categoryAliases: Record<string, string[]> = {
  "快递理赔": ["快递", "包裹", "理赔", "破损", "速运", "物流", "claim", "refund", "delivery"],
  "ETC 通知": ["etc", "账户", "停用", "认证", "车主", "verify", "account"],
  "冒充客服": ["客服", "退款", "订单", "屏幕共享", "好友", "support", "service", "refund"],
  "银行认证": ["银行", "银行卡", "验证码", "身份证", "登录", "bank", "secure", "verify", "login"],
  "中奖活动": ["中奖", "奖品", "领取", "保证金", "幸运", "gift", "award", "prize"],
  "正常服务": ["gov.cn", "政务", "官方", "白名单"],
};

const riskTerms = [
  "理赔", "退款", "中奖", "验证码", "银行卡", "身份证", "冻结", "解冻",
  "过期", "扣款", "逾期", "贷款", "刷单", "兼职", "保证金", "客服",
  "点击链接", "领取", "转账", "认证", "停用",
];

function caseScore(query: string, category: string, content: string) {
  const normalizedQuery = query.toLowerCase();
  const categoryHits = (categoryAliases[category] ?? [category])
    .filter((term) => normalizedQuery.includes(term.toLowerCase())).length;
  const contentTerms = riskTerms.filter((term) => content.includes(term));
  const contentText = `${category} ${content}`.toLowerCase();
  const sharedTerms = riskTerms.filter(
    (term) => normalizedQuery.includes(term.toLowerCase()) && contentText.includes(term.toLowerCase()),
  ).length;

  if (!categoryHits && !sharedTerms) return 0.12;
  return Math.min(0.98, 0.42 + categoryHits * 0.17 + sharedTerms * 0.045 + Math.min(contentTerms.length, 5) * 0.018);
}

export function searchAntiFraudCases(query: string): RagSearchResult {
  const ranked: RagMatch[] = demoCases
    .map((item) => ({
      caseId: item.id,
      title: item.title,
      category: item.category,
      riskLabel: item.riskLabel,
      content: item.content,
      similarity: caseScore(query, item.category, item.content),
      source: item.source,
    }))
    .sort((left, right) => right.similarity - left.similarity);
  const matches = ranked.filter((item) => item.similarity >= 0.55).slice(0, 3);

  const top = matches[0];
  const sameLabelCount = top
    ? matches.filter((item) => item.riskLabel === top.riskLabel).length
    : 0;
  const matchedRiskTerms = riskTerms.filter((term) => query.includes(term));

  return {
    matches,
    topSimilarity: top?.similarity ?? 0,
    labelAgreement: matches.length ? sameLabelCount / matches.length : 0,
    coverageScore: Math.min(1, matchedRiskTerms.length / 4),
  };
}
