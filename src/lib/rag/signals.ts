/**
 * 文档三个信号（第二周调优版）：
 *   topSimilarity  ：top-1 相似度，直接取最终排序后的首条
 *   labelAgreement ：风险标签一致性，按相似度加权（弱相关案例不应拉低/拉高一致性）
 *   coverageScore  ：关键要素覆盖度，query 里的诈骗要素有多少被检索结果覆盖
 *
 * 调优点（相比第一版）：
 *   1. coverageScore 从「命中类别数/3」改为真正的要素覆盖度
 *   2. 要素匹配引入同义词组：「抽奖」与「中奖」、「网贷」与「贷款」视为同一要素，
 *      避免检索正确但信号被判 0 的情况
 *   3. labelAgreement 改为相似度加权，弱相关案例不再能左右一致性
 */

export type MatchItem = {
  caseId: string;
  title: string;
  category: string;
  riskLabel: "安全" | "可疑" | "高危" | "诈骗";
  content: string;
  similarity: number;
  source: string | null;
};

/** 同义词组：组内任一成员命中即视为同一要素 */
const SYNONYM_GROUPS: string[][] = [
  ["中奖", "抽奖", "抽中", "领奖", "奖品", "奖金"],
  ["贷款", "网贷", "借款", "额度", "放款", "下款"],
  ["快递", "包裹", "物流", "签收", "寄件"],
  ["退费", "退钱", "学费", "课程退款"],
  ["退款", "理赔", "赔偿", "赔付"],
  ["客服", "售后", "平台客服", "订单"],
  ["刷单", "兼职", "点赞", "好评", "任务", "佣金", "返利"],
  ["公检法", "警察", "公安", "法院", "检察院", "涉案", "洗钱", "通缉", "传票"],
  ["投资", "博彩", "漏洞", "杀猪盘", "网恋", "相亲"],
  ["KYC", "实名", "身份认证", "人脸", "身份证"],
  ["冻结", "停用", "注销", "异常", "过期", "失效"],
  ["链接", "短信", "网址", "二维码", "APP"],
  ["保证金", "解冻金", "手续费", "税费", "会员费", "服务费", "运费", "邮费"],
  ["验证码", "密码", "银行卡", "转账", "汇款", "安全账户"],
  ["屏幕共享", "共享屏幕", "远程控制"],
  ["ETC", "高速", "通行费", "扣费"],
];

/** 诈骗话术关键要素词表（语义较独立、不宜合并的词） */
const KEY_ELEMENTS: string[] = [
  "垫付", "充值", "缴费", "征信", "人脸", "实名", "合同", "退款", "理赔",
  "快递", "包裹", "物流", "ETC", "KYC", "贷款", "网贷", "额度", "放款",
  "刷单", "兼职", "点赞", "好评", "任务", "佣金", "返利",
  "中奖", "抽奖", "抽中", "奖品", "领奖", "运费", "邮费",
  "保证金", "手续费", "解冻金", "税费", "会员费", "服务费",
  "安全账户", "冻结", "涉案", "洗钱", "通缉", "传票",
  "公检法", "警察", "公安", "法院", "检察院",
  "链接", "短信", "APP", "屏幕共享", "二维码", "共享屏幕",
  "客服", "订单", "商品质量",
  "杀猪盘", "网恋", "相亲", "投资", "博彩", "漏洞",
  "账号", "认证", "实名", "身份证", "验证码", "银行卡", "密码",
];

/**
 * 通用要素：几乎每个类别都会出现的词，区分度低。
 * 它们仍参与 coverageScore（衡量“要素是否被覆盖”），
 * 但在 rerank 的关键词打分里降权，且当 query 只含通用词时不做重排。
 */
const GENERIC_ELEMENTS = new Set<string>([
  "短信", "链接", "账号", "异常", "认证", "APP", "二维码", "密码",
  "身份证", "实名", "客服", "订单", "任务", "缴费", "充值", "客户",
]);

/** query 是否含有具备区分度的要素（决定要不要做关键词重排） */
export function hasSpecificElements(text: string): boolean {
  return extractElements(text).some((e) => !GENERIC_ELEMENTS.has(e));
}

/** 元素 → 同义词组成员 */
function groupOf(word: string): string[] {
  for (const g of SYNONYM_GROUPS) {
    if (g.some((w) => word === w || word.includes(w) || w.includes(word))) return g;
  }
  return [word];
}

/** 从文本中抽取命中的关键要素（去重） */
export function extractElements(text: string): string[] {
  const t = text ?? "";
  const hits: string[] = [];
  for (const w of KEY_ELEMENTS) {
    if (t.includes(w) && !hits.includes(w)) hits.push(w);
  }
  return hits;
}

/** 判断某个要素是否被语料覆盖（含同义词组） */
function isCovered(word: string, corpus: string): boolean {
  if (corpus.includes(word)) return true;
  return groupOf(word).some((w) => corpus.includes(w));
}

/** 字符二元组（用于 query 没有命中词表时的兜底覆盖度） */
function bigrams(text: string): Set<string> {
  const s = (text ?? "").replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/**
 * 高危索取类要素：出现这些词说明输入在向用户索要资金或凭证。
 * 「官方域名 + 索要验证码」是典型的仿冒特征，不能因为域名可信就判安全。
 */
const HIGH_RISK_ELEMENTS = [
  "验证码", "银行卡", "密码", "身份证", "转账", "汇款", "垫付",
  "解冻金", "保证金", "安全账户", "屏幕共享", "刷单", "点击链接",
];

/** 统计输入中命中的高危要素个数 */
export function highRiskElementCount(text: string): number {
  const t = text ?? "";
  return HIGH_RISK_ELEMENTS.filter((w) => t.includes(w)).length;
}

/**
 * 关键要素覆盖度：
 *   1) query 命中词表 → 这些要素（含同义词）在检索结果文本中出现的比例
 *   2) 未命中词表     → 退化为 query 与 top-1 内容的字符二元组重合率
 */
export function calcCoverage(query: string, matches: MatchItem[]): number {
  if (matches.length === 0) return 0;
  const corpus = matches.map((m) => `${m.title} ${m.content}`).join(" ");

  const elements = extractElements(query);
  if (elements.length > 0) {
    const covered = elements.filter((w) => isCovered(w, corpus)).length;
    return Math.min(1, covered / elements.length);
  }

  const qg = bigrams(query);
  const tg = bigrams(matches[0].title + " " + matches[0].content);
  if (qg.size === 0 || tg.size === 0) return 0;
  let inter = 0;
  for (const g of qg) if (tg.has(g)) inter++;
  return Math.min(1, inter / Math.min(qg.size, tg.size));
}

/** 关键词重合度：供 rerank 做混合打分（0~1），同义词组生效、通用词降权 */
export function keywordScore(query: string, text: string): number {
  const elements = extractElements(query);
  if (elements.length === 0) {
    const qg = bigrams(query);
    const tg = bigrams(text);
    if (qg.size === 0 || tg.size === 0) return 0;
    let inter = 0;
    for (const g of qg) if (tg.has(g)) inter++;
    return Math.min(1, inter / Math.min(qg.size, tg.size));
  }
  let totalW = 0;
  let coveredW = 0;
  for (const w of elements) {
    const weight = GENERIC_ELEMENTS.has(w) ? 0.3 : 1;
    totalW += weight;
    if (isCovered(w, text)) coveredW += weight;
  }
  return totalW > 0 ? coveredW / totalW : 0;
}

export function calcSignals(matches: MatchItem[], query?: string) {
  if (matches.length === 0) {
    return { topSimilarity: 0, labelAgreement: 0, coverageScore: 0 };
  }

  // topSimilarity：最终排序后的 top-1
  const topSimilarity = matches[0].similarity;

  // labelAgreement：以 top-1 的标签为基准，按相似度加权算一致比例
  const baseLabel = matches[0].riskLabel;
  let total = 0;
  let agree = 0;
  for (const m of matches) {
    const w = Math.max(0, m.similarity); // 余弦可能为负，负值不参与权重
    total += w;
    if (m.riskLabel === baseLabel) agree += w;
  }
  const labelAgreement = total > 0 ? agree / total : 0;

  // coverageScore：关键要素覆盖度
  const coverageScore = calcCoverage(query ?? matches[0].title + matches[0].content, matches);

  return {
    topSimilarity: Number(topSimilarity.toFixed(4)),
    labelAgreement: Number(labelAgreement.toFixed(4)),
    coverageScore: Number(coverageScore.toFixed(4)),
  };
}
