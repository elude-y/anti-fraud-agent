// src/lib/agent/normalize.ts —— 输入规范化：识别 URL / 解短链 / 抽取实体 / 命中高危词

export type InputType = 'url' | 'sms' | 'text';

export interface NormalizedInput {
  inputType: InputType;
  urls: string[];
  resolvedUrls: Array<{ from: string; to: string }>;
  entities: string[];
  riskKeywords: string[];
  raw: string;
}

const URL_RE = /(https?:\/\/[^\s"'<>，。；;！!？?）)\]}]+)/g;

// 无协议的裸域名/短链（如 g5d.cn/IiOIDu），补 http:// 协议
const BARE_URL_RE = /(?:^|[^\w])((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|cn|net|org|io|vip|xyz|top|cc|me|club|site|app|shop|info|biz|tv|link|co|live|plus|icu)(?:\/[^\s"'<>，。；;！!？?）)\]}]*)?)/g;

// 常见短链域名（可扩充）
const SHORT_DOMAINS = ['t.cn', 'dwz.cn', 'url.cn', 'bit.ly', 't.co', 'suo.im'];

// 高危词库（第 1 周基础版，后续可扩充）
const RISK_KEYWORDS = [
  '理赔', '退款', '中奖', '验证码', '银行卡', '身份证', '冻结', '解冻',
  '过期', '扣款', '逾期', '贷款', '刷单', '兼职', '保证金', '点击链接', '领取',
];

// 实体词典（简化版）
const BANKS = ['工商银行', '建设银行', '农业银行', '中国银行', '招商银行', '银行', 'ETC'];
const COURIERS = ['顺丰', '中通', '圆通', '韵达', '申通', '邮政', '快递', '京东'];
const ACTIONS = ['点击', '打开', '下载', '填写', '登录', '转账', '付款', '领取', '兑换'];

export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const m of text.matchAll(URL_RE)) urls.push(m[0]);
  for (const m of text.matchAll(BARE_URL_RE)) {
    const bare = m[1];
    if (bare && !urls.some((u) => u.includes(bare))) urls.push("http://" + bare);
  }
  return urls;
}

export function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SHORT_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

// 解短链：跟随重定向拿最终地址（超时 3s，失败则原样返回）
export async function resolveShortLink(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    const location = res.headers.get('location');
    return location ? new URL(location, url).toString() : url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  for (const bank of BANKS) if (text.includes(bank)) found.add(bank);
  for (const c of COURIERS) if (text.includes(c)) found.add(c);
  for (const a of ACTIONS) if (text.includes(a)) found.add(a);
  return [...found];
}

export function extractRiskKeywords(text: string): string[] {
  return RISK_KEYWORDS.filter((k) => text.includes(k));
}

export async function normalize(input: string): Promise<NormalizedInput> {
  const raw = input.trim();
  const urls = extractUrls(raw);
  const inputType: InputType =
    urls.length > 0 ? (raw.length > urls[0].length ? 'sms' : 'url') : 'text';

  const resolvedUrls: Array<{ from: string; to: string }> = [];
  for (const url of urls) {
    if (isShortLink(url)) {
      const to = await resolveShortLink(url);
      resolvedUrls.push({ from: url, to });
    }
  }

  return {
    inputType,
    urls,
    resolvedUrls,
    entities: extractEntities(raw),
    riskKeywords: extractRiskKeywords(raw),
    raw,
  };
}
