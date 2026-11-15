// src/lib/agent/rules.ts —— 规则信号：把规范化输入转成 [0,1] 的规则分
import type { NormalizedInput } from './normalize';
import { normalizeText } from '../rag/signals';

const STRONG_RISK = ['银行卡', '身份证', '验证码', '冻结', '解冻', '扣款', '逾期', '保证金', '安全账户', '盗刷', '检察院', '涉嫌', '涉案', '远程核查', '远程操控'];
const MEDIUM_RISK = ['理赔', '退款', '中奖', '过期', '贷款', '刷单', '兼职', '点击链接', '领取', '兑换', '理财', '投资', '稳赚', '补贴', '社保', '认领', '培训费', '服装费', '报名费', '高薪', '入职培训'];

export function computeRuleScore(input: NormalizedInput): number {
  // 先做谐音/拆字归一化，让「身 份 证」「点☆击☆领☆取」「理才」也能命中规则词
  const text = normalizeText(input.raw);
  let score = 0;
  if (STRONG_RISK.some((k) => text.includes(k))) score += 0.5; // 索要敏感信息 = 强信号
  if (MEDIUM_RISK.some((k) => text.includes(k))) score += 0.3; // 常见诈骗话术
  if (input.resolvedUrls.length > 0) score += 0.3;                  // 命中短链
  if (input.urls.length > 0) score += 0.1;                          // 含链接

  // 到账/入账/收款通知本身是正常短信；但若命中其它风险词（贷款/理财/投资/验证码等）则不是普通到账通知，不降权
  const isArrivalNotice = /到账|入账|收款|余额变动/.test(text);
  const hasOtherRisk = [...STRONG_RISK, ...MEDIUM_RISK].some((k) => k !== "银行卡" && k !== "身份证" && text.includes(k));
  if (isArrivalNotice && !hasOtherRisk) {
    score = Math.max(0, score - 0.5);
  }

  return Math.min(1, score);
}
