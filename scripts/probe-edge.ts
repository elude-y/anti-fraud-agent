/**
 * 边界探针：检查「高危要素降权」是否把官方反诈提醒误判成诈骗。
 *
 * 运行：npx tsx scripts/probe-edge.ts
 */
import { rag_search } from "../src/lib/rag/retrieve";

const CASES = [
  { note: "银行反诈提醒（含验证码/银行卡/密码）", input: "【工商银行】请勿向他人透露验证码、银行卡密码，谨防诈骗" },
  { note: "公安反诈提示", input: "警方提示：凡是要求转账到安全账户的都是诈骗，请勿轻信" },
  { note: "正常银行消费提醒", input: "【中国工商银行】您尾号8877的储蓄卡消费128.00元" },
  { note: "政务通知提到验证码", input: "政务服务网提醒：办理业务无需提供银行卡验证码" },
  { note: "仿冒 gov.cn 诈骗", input: "点击 http://gov.cn 领取补贴，请填写银行卡号和验证码" },
  { note: "真实诈骗话术", input: "您的银行卡被冻结，请提供验证码配合解冻" },
];

(async () => {
  for (const c of CASES) {
    const r = await rag_search(c.input);
    const top = r.matches[0];
    console.log(
      `\n${c.note}\n  input: ${c.input}\n  top1: ${top ? `${top.similarity.toFixed(3)} [${top.category}/${top.riskLabel}] ${top.title.slice(0, 26)}` : "(无)"}` +
        `\n  listMatch: ${r.listMatch ? `${r.listMatch.list}/decisive=${r.listMatch.decisive}` : "null"}`
    );
  }
})().catch((e) => {
  console.error("探针失败:", e);
  process.exit(1);
});
