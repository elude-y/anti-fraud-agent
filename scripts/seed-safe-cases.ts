/**
 * 补齐「安全 / 正常」案例（修复问题清单第一条根因）。
 *
 * 背景：原 cases 表 55 条全部是诈骗案例，RAG 对任何输入都会返回诈骗案例，
 * 导致 https://www.gov.cn/、开会通知这类正常输入被判成诈骗/高危。
 *
 * 新增两个类别：
 *   银行     —— 银行官方通知类短信（对应"工行短信应匹配银行而非 ETC"）
 *   正常服务 —— 政务、会议、快递、举报中心、运营商等正常通知
 *
 * 幂等：按 title 去重。
 * 运行：npx tsx scripts/seed-safe-cases.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "../src/lib/rag/embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

interface SafeCase {
  title: string;
  category: string;
  content: string;
  tags: string[];
  source: string;
}

const SAFE_CASES: SafeCase[] = [
  // ── 银行：官方通知类短信（工行短信应命中这里，而不是 ETC） ──
  {
    title: "工商银行官方储蓄卡消费提醒",
    category: "银行",
    content:
      "【中国工商银行】您尾号8877的储蓄卡于10月20日14:32消费人民币128.00元。如非本人操作，请拨打官方客服95588或通过手机银行核实，我行不会索要验证码或要求转账。",
    tags: ["银行", "短信提醒", "工行", "官方客服"],
    source: "银行官方通知样例",
  },
  {
    title: "建设银行账户余额变动通知",
    category: "银行",
    content:
      "【中国建设银行】您尾号6621的账户10月20日入账工资人民币8600.00元，余额23150.42元。查询详单请使用官方手机银行，勿点击短信中的陌生链接。",
    tags: ["银行", "余额变动", "建行"],
    source: "银行官方通知样例",
  },
  {
    title: "招商银行信用卡账单提醒",
    category: "银行",
    content:
      "【招商银行】您尾号3390信用卡本期账单应还人民币2480.00元，到期还款日11月8日。可通过官方掌上生活APP还款，客服热线95555。",
    tags: ["银行", "信用卡", "账单", "招行"],
    source: "银行官方通知样例",
  },
  {
    title: "银行官方APP下载与安全提示",
    category: "银行",
    content:
      "请通过手机应用商店或银行官方网站下载手机银行客户端。银行不会通过短信链接要求您下载安装包，也不会索取登录密码、短信验证码或要求向安全账户转账。",
    tags: ["银行", "APP", "安全提示", "官方渠道"],
    source: "银行官方通知样例",
  },

  // ── 正常服务：政务、会议、快递、举报中心、运营商 ──
  {
    title: "gov.cn 中国政府网政策公告",
    category: "正常服务",
    content:
      "https://www.gov.cn/ 为中华人民共和国中央人民政府官方网站，发布政策文件、政务公开与便民服务信息。该网站不会要求访客填写银行卡号、验证码，也不会索要转账。",
    tags: ["政务", "官网", "gov.cn", "无风险"],
    source: "公开政务网站说明",
  },
  {
    title: "公司内部会议通知",
    category: "正常服务",
    content:
      "各位同事：明天上午10:00在三楼第二会议室召开项目周会，请携带本周工作汇报。会议无需缴费、无需点击外部链接，也不会索要任何账户信息。",
    tags: ["会议通知", "内部", "无风险"],
    source: "企业内部通知样例",
  },
  {
    title: "快递已放入丰巢柜的取件通知",
    category: "正常服务",
    content:
      "您的快递已放入小区丰巢智能柜，取件码8842，请在24小时内凭码取件。取件不需要支付任何费用，也不需要点击链接填写个人信息。",
    tags: ["快递", "取件码", "正常派送"],
    source: "物流正常通知样例",
  },
  {
    title: "12321 举报受理回复",
    category: "正常服务",
    content:
      "【12321网络不良与垃圾信息举报受理中心】您提交的垃圾短信举报已受理，处理结果将通过官方渠道反馈。该中心不会要求您提供银行卡、验证码或进行转账。",
    tags: ["12321", "举报", "官方回复"],
    source: "官方公共服务样例",
  },
  {
    title: "12381 涉诈预警提示短信",
    category: "正常服务",
    content:
      "【12381】您可能正在遭遇电信网络诈骗，请立即停止转账并与家人核实。12381 为工业和信息化部反诈预警号码，该提示不索要任何账户信息。",
    tags: ["12381", "反诈预警", "官方提示"],
    source: "官方公共服务样例",
  },
  {
    title: "运营商套餐流量使用提醒",
    category: "正常服务",
    content:
      "【中国移动】您本月套餐内流量已使用85%，剩余3.2GB。可登录中国移动官方APP查询详单，无需点击短信中的任何链接。",
    tags: ["运营商", "流量提醒", "官方APP"],
    source: "运营商通知样例",
  },
  {
    title: "政务服务大厅办件进度通知",
    category: "正常服务",
    content:
      "您在市政务服务中心提交的营业执照变更事项已受理，办件编号 20261020001。可在政务服务网或官方小程序查询办理进度，全程不收取任何费用。",
    tags: ["政务", "办件进度", "无风险"],
    source: "公开政务网站说明",
  },
  {
    title: "电商平台官方订单发货通知",
    category: "正常服务",
    content:
      "您的订单已发货，物流单号 SF1234567890，可在官方APP内查看物流详情。平台不会以订单异常为由要求您点击外部链接或提供验证码。",
    tags: ["电商", "发货通知", "官方APP", "物流"],
    source: "电商平台通知样例",
  },
];

(async () => {
  const { data: exist, error } = await supabase.from("cases").select("title");
  if (error) throw new Error(`读取 cases 失败: ${error.message}`);
  const known = new Set((exist ?? []).map((r: { title: string }) => r.title));

  const todo = SAFE_CASES.filter((c) => !known.has(c.title));
  console.log(`安全案例：共 ${SAFE_CASES.length} 条，待插入 ${todo.length} 条`);
  if (todo.length === 0) return;

  for (const c of todo) {
    const vec = await createEmbedding(`${c.title}\n${c.content}`);
    const { error: insErr } = await supabase.from("cases").insert({
      title: c.title,
      category: c.category,
      risk_label: "安全",
      content: c.content,
      source: c.source,
      tags: c.tags,
      embedding: `[${vec.join(",")}]`,
    });
    if (insErr) throw new Error(`插入失败 ${c.title}: ${insErr.message}`);
    console.log(`  ✅ [${c.category}] ${c.title}`);
  }

  const { count } = await supabase.from("cases").select("*", { count: "exact", head: true });
  console.log(`\n完成，cases 总数 = ${count}`);
})().catch((e) => {
  console.error("写入失败:", e);
  process.exit(1);
});
