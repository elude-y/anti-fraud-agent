/**
 * 验证黑白名单（含「白名单不因提及而短路」的修正）。
 *
 * 关键回归：
 *   域名可信 ≠ 消息内容可信。
 *   「点击 http://gov.cn 领取补贴，请填写银行卡和验证码」必须仍被判为诈骗，
 *   不能因为句子里出现 gov.cn 就整体判安全。
 *
 * 运行：npx tsx scripts/verify-ioc.ts
 */
import { checkList } from "../src/lib/rag/iocList";
import { rag_search } from "../src/lib/rag/retrieve";

interface Case {
  input: string;
  expect: "white" | "black" | "none";
  note: string;
}

const CASES: Case[] = [
  { input: "https://www.gov.cn/zhengce/index.htm", expect: "white", note: "政府官网 URL" },
  { input: "www.gov.cn", expect: "white", note: "政府域名（无协议）" },
  { input: "请拨打工商银行客服 95588 核实", expect: "white", note: "银行客服号（句中）" },
  { input: "12321 举报中心已受理", expect: "white", note: "12321 号码（句中）" },
  { input: "https://icbc.com.cn/login", expect: "white", note: "工行官网" },

  { input: "https://etc-auth.example/login?redirect=wx", expect: "black", note: "示例恶意域名" },
  { input: "etc-auth.example", expect: "black", note: "恶意域名（裸域名）" },
  { input: "http://192.0.2.45/pay", expect: "black", note: "文档地址段 IP" },
  { input: "https://t.example/x8Kq2", expect: "black", note: "示例短链" },

  { input: "您的ETC账户异常，点击链接完成认证否则停用", expect: "none", note: "普通诈骗话术" },
  { input: "明天上午十点在三楼会议室开会", expect: "none", note: "普通会议通知" },
];

(async () => {
  console.log("【名单匹配】");
  let pass = 0;

  for (const c of CASES) {
    const hit = await checkList(c.input);
    const actual = hit ? hit.list : "none";
    const ok = actual === c.expect;
    if (ok) pass++;
    const detail = hit ? `${hit.list}/${hit.type}/${hit.value}（${hit.matchedBy}，entityOnly=${hit.entityOnly}）` : "null";
    console.log(`${ok ? "✅" : "❌"} ${c.note.padEnd(16)} 期望 ${c.expect.padEnd(5)} 实际 ${detail}`);
  }
  console.log(`\n匹配结果：${pass}/${CASES.length} 通过`);

  console.log("\n【端到端：白名单短路边界】");

  // 1) 裸 URL → 应短路
  const bare = await rag_search("https://www.gov.cn/");
  const okBare =
    bare.listMatch?.list === "white" && bare.listMatch?.decisive === true && bare.matches.length === 0;
  console.log(
    `${okBare ? "✅" : "❌"} 裸 URL        → listMatch=${bare.listMatch?.list}/decisive=${bare.listMatch?.decisive} matches=${bare.matches.length}`
  );

  // 2) 句中提及白名单号码 → 不短路，仍需内容检索
  const sentence = await rag_search("请拨打工商银行客服 95588 核实，不要点击短信链接");
  const okSentence =
    sentence.listMatch?.list === "white" && sentence.listMatch?.decisive === false && sentence.matches.length > 0;
  console.log(
    `${okSentence ? "✅" : "❌"} 句子提及号码   → listMatch=${sentence.listMatch?.list}/decisive=${sentence.listMatch?.decisive} matches=${sentence.matches.length}`
  );

  // 3) 仿冒白名单域名实施诈骗 → 不得判安全
  const spoof = await rag_search("点击 http://gov.cn 领取补贴，请填写银行卡号和验证码");
  const spoofTop = spoof.matches[0];
  const okSpoof =
    spoof.listMatch?.decisive === false &&
    spoof.matches.length > 0 &&
    spoofTop?.riskLabel !== "安全";
  console.log(
    `${okSpoof ? "✅" : "❌"} 仿冒 gov.cn 诈骗 → decisive=${spoof.listMatch?.decisive} matches=${spoof.matches.length} top1=${spoofTop?.riskLabel}/${spoofTop?.category}`
  );

  // 4) 黑名单 → 决定性判定，且仍返回证据
  const black = await rag_search("https://etc-auth.example/login");
  const okBlack = black.listMatch?.list === "black" && black.listMatch?.decisive === true;
  console.log(
    `${okBlack ? "✅" : "❌"} 黑名单输入     → listMatch=${black.listMatch?.list}/decisive=${black.listMatch?.decisive} matches=${black.matches.length}`
  );

  const allOk = pass === CASES.length && okBare && okSentence && okSpoof && okBlack;
  console.log(`\n结论：${allOk ? "✅ 全部通过" : "❌ 存在失败项"}`);
  if (!allOk) process.exit(1);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
