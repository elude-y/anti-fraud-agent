import fallbackCases from "@/lib/data/cases-fallback.json";
import type { RagMatch, RagSearchResult } from "@/lib/contracts";

// 类别别名（与 cases-fallback.json 的实际类别对齐，作为关键词兜底检索的辅助）
const categoryAliases: Record<string, string[]> = {
  "快递理赔": ["快递", "包裹", "理赔", "破损", "物流"],
  "ETC": ["etc", "账户", "停用", "认证", "车主", "高速", "通行"],
  "冒充客服": ["客服", "退款", "订单", "屏幕共享", "会员", "误开通"],
  "银行": ["银行", "银行卡", "验证码", "身份证", "登录", "secure", "verify"],
  "KYC/账户核验": ["kyc", "核验", "认证", "身份验证", "人脸"],
  "中奖": ["中奖", "奖品", "领取", "保证金", "幸运"],
  "贷款/信用服务": ["贷款", "征信", "解冻", "额度", "放款"],
  "刷单返利": ["刷单", "返利", "兼职", "垫付", "佣金"],
  "冒充公检法": ["公安", "检察院", "法院", "警官", "涉嫌", "安全账户"],
  "冒充领导/熟人": ["领导", "熟人", "借钱", "急需", "转账"],
  "虚假投资理财": ["投资", "理财", "股票", "基金", "收益", "回报"],
  "网络婚恋/交友": ["婚恋", "交友", "杀猪盘", "网恋", "相亲"],
  "退费": ["退费", "学费", "培训", "退款", "退赔"],
  "医保社保": ["医保", "社保", "补贴", "津贴"],
  "养老诈骗": ["养老", "老人", "保健品"],
  "机票退改签": ["机票", "航班", "退改签", "航空"],
  "网络游戏交易": ["游戏", "账号", "装备", "点卡", "皮肤"],
  "两卡/跑分洗钱": ["跑分", "洗钱", "两卡", "取现", "过账"],
  "虚拟货币与AI伪造": ["虚拟货币", "usdt", "炒币", "数字货币", "ai"],
  "正常服务": ["gov.cn", "政务", "教育平台", "官方", "白名单", "通知", "提醒"],
};

const riskTerms = [
  "理赔", "退款", "中奖", "验证码", "银行卡", "身份证", "冻结", "解冻",
  "过期", "扣款", "逾期", "贷款", "刷单", "兼职", "保证金", "客服",
  "点击链接", "领取", "转账", "认证", "停用",
];

interface KeywordCase {
  id: string;
  title: string;
  category: string;
  riskLabel: RagMatch["riskLabel"];
  content: string;
  source: string | null;
}

// 唯一真源：cases-fallback.json（球池页与 RAG 共用同一份语料）
const casePool = fallbackCases as unknown as KeywordCase[];

function caseScore(query: string, category: string, content: string) {
  const normalizedQuery = query.toLowerCase();
  const categoryHits = (categoryAliases[category] ?? [category])
    .filter((term) => normalizedQuery.includes(term.toLowerCase())).length;
  const contentText = `${category} ${content}`.toLowerCase();
  const sharedTerms = riskTerms.filter(
    (term) => normalizedQuery.includes(term.toLowerCase()) && contentText.includes(term.toLowerCase()),
  ).length;

  if (!categoryHits && !sharedTerms) return 0.12;
  return Math.min(0.98, 0.42 + categoryHits * 0.17 + sharedTerms * 0.045);
}

export function searchAntiFraudCases(query: string): RagSearchResult {
  const ranked: RagMatch[] = casePool
    .map((item) => ({
      caseId: item.id,
      title: item.title,
      category: item.category,
      riskLabel: item.riskLabel,
      content: item.content,
      similarity: caseScore(query, item.category, item.content),
      source: item.source ?? "反诈案例库",
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
