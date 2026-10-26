/**
 * 验证黑白名单整合（问题修复：安全/恶意判定不再完全依赖向量召回）。
 *
 * 检查：
 *   1. 白名单命中：gov.cn / 银行客服号 / 12321 → listMatch.list = white
 *   2. 黑名单命中：示例恶意域名、URL、IP → listMatch.list = black
 *   3. 未命中：普通话术 → listMatch = null，仍走向量检索
 *   4. 端到端：白名单输入不再返回诈骗案例
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
  { input: "请拨打工商银行客服 95588 核实", expect: "white", note: "银行客服号" },
  { input: "12321 举报中心已受理", expect: "white", note: "12321 号码" },
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
    const detail = hit ? `${hit.list}/${hit.type}/${hit.value}（${hit.matchedBy}）` : "null";
    console.log(`${ok ? "✅" : "❌"} ${c.note.padEnd(16)} 期望 ${c.expect.padEnd(5)} 实际 ${detail}`);
  }
  console.log(`\n匹配结果：${pass}/${CASES.length} 通过`);

  console.log("\n【端到端：rag_search】");
  const white = await rag_search("https://www.gov.cn/");
  console.log(
    `  白名单输入 → listMatch=${white.listMatch?.list ?? "null"}  matches=${white.matches.length}  ` +
      `topSimilarity=${white.topSimilarity}`
  );

  const black = await rag_search("https://etc-auth.example/login");
  console.log(
    `  黑名单输入 → listMatch=${black.listMatch?.list ?? "null"}  matches=${black.matches.length}  ` +
      `top1=${black.matches[0]?.riskLabel ?? "-"}`
  );

  const normal = await rag_search("您的ETC账户异常，点击链接完成认证否则停用");
  console.log(
    `  普通话术   → listMatch=${normal.listMatch?.list ?? "null"}  matches=${normal.matches.length}  ` +
      `top1=${normal.matches[0]?.category ?? "-"}`
  );

  const okWhite = white.listMatch?.list === "white" && white.matches.length === 0;
  const okBlack = black.listMatch?.list === "black";
  const okNormal = normal.listMatch == null && normal.matches.length > 0;

  console.log(`\n端到端：白名单短路 ${okWhite ? "✅" : "❌"}，黑名单标记 ${okBlack ? "✅" : "❌"}，普通话术不受影响 ${okNormal ? "✅" : "❌"}`);
  if (pass < CASES.length || !okWhite || !okBlack || !okNormal) process.exit(1);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
