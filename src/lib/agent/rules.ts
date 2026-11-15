// src/lib/agent/rules.ts —— 规则信号：把规范化输入转成 [0,1] 的规则分
import type { NormalizedInput } from './normalize';
import { normalizeText } from '../rag/signals';

const STRONG_RISK = ['银行卡', '身份证', '验证码', '冻结', '解冻', '扣款', '逾期', '保证金', '安全账户', '盗刷', '检察院', '涉嫌', '涉案', '远程核查', '远程操控'];
const MEDIUM_RISK = ['理赔', '退款', '中奖', '过期', '贷款', '刷单', '兼职', '点击链接', '领取', '兑换', '理财', '投资', '稳赚', '补贴', '社保', '认领', '培训费', '服装费', '报名费', '高薪', '入职培训'];

export function isPreventionNotice(input: NormalizedInput): boolean {
  if (input.urls.length) return false;
  const clauses = input.raw.trim().replace(/^【?(?:校园|社区|银行)?(?:(?:反诈|防诈|防骗|安全)(?:宣传|警示|提示|提醒)|安全课)】?[:：]?\s*/, "")
    .split(/[，,。！!；;\n]+/).map((clause) => clause.trim()).filter(Boolean);
  return clauses.length > 0 && clauses.every((clause) =>
    /^(?:请)?(?:不要|切勿|勿|严禁|拒绝|谨防|警惕)/.test(clause)
    && !/(?:但是|不过|而是|改用|改为|务必|请.{0,4}(?:先|把|点击|访问|转账|扫码)|立即办理)/.test(clause)
  );
}

export function isRoutineNotice(input: NormalizedInput): boolean {
  if (input.urls.length) return false;
  const text = normalizeText(input.raw);
  if (/(?:转账|汇款|垫付|保证金|手续费|退款|理赔|异常|冻结|验证码|密码|银行卡|下载|添加|扫码|联系|核验|上传|安装|访问|点击|支付|寄回)/.test(text)) return false;
  return /(?:快递|包裹).*(?:已签收|已送达|已到.{0,12}驿站|取件码)/.test(text)
    || /(?:工资|薪资).*(?:已到账|已入账)/.test(text);
}

export function computeRuleScore(input: NormalizedInput): number {
  // 先做谐音/拆字归一化，让「身 份 证」「点☆击☆领☆取」「理才」也能命中规则词
  if (isPreventionNotice(input) || isRoutineNotice(input)) return 0;
  const text = normalizeText(input.raw);
  let score = 0;
  if (STRONG_RISK.some((k) => text.includes(k))) score += 0.5; // 索要敏感信息 = 强信号
  if (MEDIUM_RISK.some((k) => text.includes(k))) score += 0.3; // 常见诈骗话术
  if (input.resolvedUrls.length > 0) score += 0.3;                  // 命中短链
  if (/(?:验证|核验|点击|账户异常).{0,35}(?:转账|汇款|打款)/.test(text)
    || /(?:转账|汇款|打款).{0,20}(?:验证|核验|解冻)/.test(text)) {
    score = Math.max(score, 0.5);
  }
  if (input.urls.length > 0) score += 0.1;                          // 含链接

  // 到账/入账/收款通知本身是正常短信；但若命中其它风险词（贷款/理财/投资/验证码等）则不是普通到账通知，不降权
  const isArrivalNotice = /到账|入账|收款|余额变动/.test(text);
  const hasOtherRisk = [...STRONG_RISK, ...MEDIUM_RISK].some((k) => k !== "银行卡" && k !== "身份证" && text.includes(k));
  if (isArrivalNotice && !hasOtherRisk) {
    score = Math.max(0, score - 0.5);
  }

  return Math.min(1, score);
}
