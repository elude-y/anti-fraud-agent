import casesRaw from "./cases.json";
import scriptsRaw from "./scripts.json";
import iocsRaw from "./iocs.json";
import allowlistRaw from "./allowlist.json";
import sourcesRaw from "./sources.json";
import metadataRaw from "./metadata.json";

export interface FraudCase {
  id: string;
  title: string;
  category: string;
  riskLabel: "诈骗";
  content: string;
  source: string;
  sourceTitle: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  sourceKind: string | null;
  prevention: string | null;
  riskFeatures: string[];
  scriptText: string | null;
  location: string | null;
  publisherLocation: string | null;
  generationMethod: string | null;
  provenance: "real" | "rewritten" | "simulated";
}

export interface FraudScript {
  id: string;
  category: string;
  channel: string;
  stage: string;
  text: string;
  purpose: string;
  signals: string[];
  relatedCaseId: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
}

export interface FraudIoc {
  id: string;
  category: string;
  threatType: string;
  originalUrl: string;
  defangedUrl: string;
  domain: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  riskLabel: string;
  note: string | null;
}

export interface AllowlistEntry {
  id: string;
  organization: string;
  url: string;
  domain: string;
  category: string;
  region: string;
  source: string;
  sourceUrl: string | null;
  riskLabel: "安全";
  note: string | null;
}

export interface FraudSource {
  id: string;
  name: string;
  publisher: string;
  publishedAt: string | null;
  region: string | null;
  kind: string | null;
  url: string | null;
  caseCount: number | null;
}

export interface FraudCategorySummary {
  name: string;
  count: number;
  signals: string[];
}

export interface FraudDatasetMetadata {
  workbook: string;
  generatedAt: string;
  totals: {
    all: number;
    cases: number;
    scripts: number;
    iocs: number;
    allowlist: number;
    sources: number;
  };
  categories: FraudCategorySummary[];
}

export interface RankedCase {
  item: FraudCase;
  score: number;
  signals: string[];
}

export interface RankedScript {
  item: FraudScript;
  score: number;
  matchedSignals: string[];
}

export interface DomainInspection {
  input: string;
  domain: string | null;
  list: "black" | "white" | null;
  ioc: FraudIoc | null;
  allowlist: AllowlistEntry | null;
}

export const fraudCases = casesRaw as FraudCase[];
export const fraudScripts = scriptsRaw as FraudScript[];
export const fraudIocs = iocsRaw as FraudIoc[];
export const fraudAllowlist = allowlistRaw as AllowlistEntry[];
export const fraudSources = sourcesRaw as FraudSource[];
export const fraudMetadata = metadataRaw as FraudDatasetMetadata;
export const fraudCategories = fraudMetadata.categories;

const categoryTerms: Record<string, string[]> = {
  "刷单返利": ["刷单", "返利", "兼职", "垫付", "连单", "佣金", "任务", "提现"],
  "冒充公检法": ["公检法", "公安", "检察院", "法院", "洗钱", "涉案", "安全账户", "清查", "文书"],
  "冒充领导/熟人": ["领导", "熟人", "同事", "工友", "亲戚", "新号码", "借钱", "周转", "打点"],
  "虚假投资理财": ["投资", "理财", "股票", "基金", "导师", "内幕", "稳赚", "提现", "带单"],
  "其他电信网络诈骗": ["诈骗", "转账", "陌生", "链接", "账户", "客服"],
  "冒充客服": ["客服", "订单", "退款", "理赔", "百万保障", "自动扣费", "屏幕共享", "关闭服务"],
  "贷款/信用服务": ["贷款", "征信", "额度", "解冻金", "流水", "无抵押", "低息", "信用"],
  "两卡/跑分洗钱": ["银行卡", "手机卡", "跑分", "出租", "出借", "代收", "返佣", "报酬"],
  "网络婚恋/交友": ["婚恋", "交友", "恋爱", "恋人", "视频", "投资", "拼单", "伴侣"],
  "快递理赔": ["快递", "包裹", "物流", "理赔", "破损", "丢失", "赔偿", "违禁"],
  "机票退改签": ["机票", "航班", "改签", "退票", "延误", "取消", "理赔"],
  "中奖": ["中奖", "奖品", "幸运", "领取", "保证金", "税费", "运费", "抽奖"],
  "医保社保": ["医保", "社保", "补贴", "停用", "账户异常", "补缴", "政务", "认证"],
  "养老诈骗": ["养老", "以房养老", "保健品", "免费礼品", "高额返利", "老年", "投资"],
  "KYC/账户核验": ["kyc", "账户", "核验", "实名", "冻结", "人脸", "认证", "验证码"],
  "网络游戏交易": ["游戏", "账号", "皮肤", "充值", "装备", "收号", "保证金", "私下交易"],
  "ETC": ["etc", "高速", "通行", "停用", "认证", "扣费", "续约", "车主"],
  "退费": ["退费", "退款", "课程", "机构", "手续费", "扫码", "验资", "群"],
  "AI换脸": ["ai", "换脸", "视频", "声音", "冒充", "转账", "保密", "新号码"],
  "虚拟货币": ["usdt", "虚拟币", "虚拟货币", "钱包", "炒币", "提现", "补税", "充值"],
  "虚假购物/服务": ["购物", "商品", "低价", "代购", "服务", "付款", "订单"],
  "求职培训": ["招聘", "求职", "培训", "服装费", "押金", "高薪", "内推", "培训贷"],
};

const genericRiskTerms = [
  "验证码", "银行卡", "身份证", "密码", "冻结", "解冻", "转账", "汇款", "点击链接",
  "扫码", "屏幕共享", "远程控制", "下载app", "下载APP", "安全账户", "保证金", "手续费",
  "刷流水", "内幕", "稳赚", "返利", "垫付", "保密", "紧急", "限时", "补贴", "理赔",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/hxxps?/g, "http")
    .replace(/\[\.\]|\(\.\)|【\.】|［\.］/g, ".")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value: string) {
  const chars = [...value];
  const result = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    result.add(`${chars[index]}${chars[index + 1]}`);
  }
  return result;
}

function overlapScore(query: string, document: string) {
  const left = bigrams(query);
  if (left.size === 0) return 0;
  const right = bigrams(document);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / left.size;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function caseSearchText(item: FraudCase) {
  return normalizeText([item.title, item.content, item.category, ...item.riskFeatures].join(" "));
}

export function scoreCase(query: string, item: FraudCase) {
  const normalized = normalizeText(query);
  if (!normalized) return { score: 0, signals: [] as string[] };
  const terms = categoryTerms[item.category] ?? [];
  const categoryHits = terms.filter((term) => normalized.includes(normalizeText(term))).length;
  const signals = item.riskFeatures.filter((term) => normalized.includes(normalizeText(term))).slice(0, 6);
  const genericHits = genericRiskTerms.filter((term) => normalized.includes(normalizeText(term)));
  const similarity = overlapScore(normalized, caseSearchText(item));
  const exactTitleBonus = normalized.includes(normalizeText(item.title)) ? 0.25 : 0;
  const score = clamp(
    0.08 + categoryHits * 0.15 + signals.length * 0.075 + Math.min(genericHits.length, 6) * 0.018 + similarity * 0.42 + exactTitleBonus,
    0,
    0.99,
  );
  return { score, signals };
}

export function searchFraudCases(query: string, options: { category?: string; limit?: number } = {}): RankedCase[] {
  const { category, limit = 8 } = options;
  return fraudCases
    .filter((item) => !category || category === "全部" || item.category === category)
    .map((item) => ({ item, ...scoreCase(query, item) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function scoreScript(query: string, item: FraudScript) {
  const normalized = normalizeText(query);
  const terms = categoryTerms[item.category] ?? [];
  const categoryHits = terms.filter((term) => normalized.includes(normalizeText(term))).length;
  const matchedSignals = item.signals.filter((term) => normalized.includes(normalizeText(term)));
  const similarity = overlapScore(normalized, normalizeText(`${item.text} ${item.purpose} ${item.signals.join(" ")}`));
  const score = clamp(0.06 + categoryHits * 0.14 + matchedSignals.length * 0.11 + similarity * 0.52, 0, 0.99);
  return { score, matchedSignals };
}

export function searchFraudScripts(query: string, options: { category?: string; limit?: number } = {}): RankedScript[] {
  const { category, limit = 6 } = options;
  return fraudScripts
    .filter((item) => !category || category === "全部" || item.category === category)
    .map((item) => ({ item, ...scoreScript(query, item) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function normalizeDomain(value: string) {
  const defanged = value
    .trim()
    .replace(/hxxps?/gi, "http")
    .replace(/\[\.\]|\(\.\)|【\.】|［\.］/g, ".")
    .replace(/^[a-z]+:\/\//i, "");
  const host = defanged.split(/[/:?#\s]/)[0]?.toLowerCase().replace(/\.$/, "") ?? "";
  return host || null;
}

export function extractDomains(value: string) {
  const normalized = value
    .replace(/hxxps?/gi, "http")
    .replace(/\[\.\]|\(\.\)|【\.】|［\.］/g, ".")
    .replace(/https?:\/\//gi, " ");
  const matches = normalized.match(/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi) ?? [];
  return [...new Set(matches.map((item) => item.toLowerCase()))].slice(0, 20);
}

function allowlisted(domain: string, entry: AllowlistEntry) {
  return domain === entry.domain || domain.endsWith(`.${entry.domain}`);
}

export function inspectDomain(value: string): DomainInspection {
  const domain = normalizeDomain(value);
  if (!domain) return { input: value, domain: null, list: null, ioc: null, allowlist: null };
  const ioc = fraudIocs.find((item) => item.domain === domain) ?? null;
  const allow = fraudAllowlist.find((item) => allowlisted(domain, item)) ?? null;
  return {
    input: value,
    domain,
    list: ioc ? "black" : allow ? "white" : null,
    ioc,
    allowlist: allow,
  };
}

export function getAllowedUrlFromText(value: string) {
  for (const domain of extractDomains(value)) {
    const inspection = inspectDomain(domain);
    if (inspection.allowlist) return inspection.allowlist;
  }
  return null;
}

export function getMaliciousMatchesFromText(value: string) {
  return extractDomains(value)
    .map((domain) => inspectDomain(domain))
    .filter((inspection): inspection is DomainInspection & { ioc: FraudIoc } => Boolean(inspection.ioc));
}

export function categorySignals(category: string) {
  return fraudMetadata.categories.find((item) => item.name === category)?.signals ?? [];
}

export function findCasesByCategory(category: string, limit = 6) {
  return fraudCases.filter((item) => item.category === category).slice(0, limit);
}

const primaryCategoryTerms: Record<string, string[]> = {
  "刷单返利": ["刷单", "返利", "连单", "垫付", "兼职任务"],
  "冒充公检法": ["公检法", "公安", "检察院", "法院", "安全账户", "资金清查"],
  "冒充领导/熟人": ["领导", "熟人", "工友", "亲戚", "新号码", "借钱周转"],
  "虚假投资理财": ["投资理财", "导师带单", "内幕消息", "稳赚不赔", "炒股", "基金"],
  "冒充客服": ["客服", "百万保障", "自动扣费", "订单异常", "退款客服"],
  "贷款/信用服务": ["贷款", "征信", "解冻金", "刷流水", "无抵押", "信用服务"],
  "两卡/跑分洗钱": ["两卡", "跑分", "出租银行卡", "出借银行卡", "代收现金"],
  "网络婚恋/交友": ["婚恋", "交友", "网恋", "恋爱对象", "杀猪盘", "共同投资"],
  "快递理赔": ["快递", "包裹", "物流理赔", "快递理赔", "三倍赔偿"],
  "机票退改签": ["机票", "航班", "改签", "退票", "航班取消"],
  "中奖": ["中奖", "抽奖", "幸运用户", "领奖", "奖品"],
  "医保社保": ["医保", "社保", "医保卡", "医保局", "社保补贴", "补缴"],
  "养老诈骗": ["养老", "以房养老", "保健品", "老年投资", "免费礼品"],
  "KYC/账户核验": ["kyc", "实名核验", "人脸核验", "账户核验", "重新实名"],
  "网络游戏交易": ["游戏", "皮肤", "装备", "账号交易", "收号"],
  "ETC": ["etc", "高速", "通行", "车主"],
  "退费": ["退费", "课程退款", "培训机构", "验资", "退款群"],
  "AI换脸": ["ai换脸", "换脸", "声音合成", "视频冒充", "熟人视频"],
  "虚拟货币": ["usdt", "虚拟货币", "虚拟币", "炒币", "钱包地址"],
  "虚假购物/服务": ["低价购物", "虚假购物", "代购", "商品退款", "服务费"],
  "求职培训": ["招聘", "求职", "培训费", "服装费", "培训贷", "高薪岗位"],
};

export function inferFraudCategory(query: string) {
  const normalized = normalizeText(query);
  let best = { category: "其他电信网络诈骗", score: 0 };
  for (const summary of fraudMetadata.categories) {
    if (summary.name === "其他电信网络诈骗") continue;
    const primary = primaryCategoryTerms[summary.name] ?? [];
    const primaryHits = primary.filter((term) => normalized.includes(normalizeText(term))).length;
    const signalHits = summary.signals.filter((term) => normalized.includes(normalizeText(term))).length;
    const genericHits = (categoryTerms[summary.name] ?? [])
      .filter((term) => normalized.includes(normalizeText(term))).length;
    const score = primaryHits * 3 + signalHits * 2 + genericHits * 0.35;
    if (score > best.score) best = { category: summary.name, score };
  }
  return best.score > 0 ? best.category : "其他电信网络诈骗";
}

export function matchedRiskSignals(query: string) {
  const normalized = normalizeText(query);
  const matched = new Set<string>();
  for (const summary of fraudMetadata.categories) {
    for (const signal of summary.signals) {
      if (normalized.includes(normalizeText(signal))) matched.add(signal);
    }
  }
  for (const term of genericRiskTerms) {
    if (normalized.includes(normalizeText(term))) matched.add(term);
  }
  return [...matched].slice(0, 12);
}
