// src/lib/agent/rules.ts —— 规则信号：把规范化输入转成 [0,1] 的规则分
import type { NormalizedInput } from './normalize';

const STRONG_RISK = ['银行卡', '身份证', '验证码', '冻结', '解冻', '扣款', '逾期', '保证金', '安全账户'];
const MEDIUM_RISK = ['理赔', '退款', '中奖', '过期', '贷款', '刷单', '兼职', '点击链接', '领取', '兑换'];

export function computeRuleScore(input: NormalizedInput): number {
  let score = 0;
  if (STRONG_RISK.some((k) => input.raw.includes(k))) score += 0.5; // 索要敏感信息 = 强信号
  if (MEDIUM_RISK.some((k) => input.raw.includes(k))) score += 0.3; // 常见诈骗话术
  if (input.resolvedUrls.length > 0) score += 0.3;                  // 命中短链
  if (input.urls.length > 0) score += 0.1;                          // 含链接
  return Math.min(1, score);
}
