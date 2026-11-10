/**
 * 继续扩充：机票退改签、虚拟货币（元宇宙投资）两类。
 *
 * 来源（已核实可访问）：
 *   1. 央视新闻/光明网《从“赔你钱”到“让你贷” 总台曝光机票退改签诈骗》2026-01-07
 *      https://m.gmw.cn/2026-01/07/content_1304294170.htm
 *   2. 广州市公安局《轻信“元宇宙”投资骗局损失百万 广州番禺警方循线追踪全额挽损》2026-03-21
 *      https://gaj.gz.gov.cn/zzzq/jwzx/content/post_10736182.html
 *
 * 幂等：按 title 去重。
 * 运行：npx tsx scripts/seed-news-cases4.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "../src/lib/rag/embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

const SRC_FLIGHT = {
  source: "央视新闻曝光案例（光明网转载）",
  source_url: "https://m.gmw.cn/2026-01/07/content_1304294170.htm",
  source_title: "从“赔你钱”到“让你贷” 总台曝光机票退改签诈骗（央视新闻）",
  published_at: "2026-01-07",
  source_kind: "media" as const,
};

const SRC_META = {
  source: "广州市公安局警情通报",
  source_url: "https://gaj.gz.gov.cn/zzzq/jwzx/content/post_10736182.html",
  source_title: "轻信“元宇宙”投资骗局损失百万 广州番禺警方循线追踪全额挽损（广州市公安局）",
  published_at: "2026-03-21",
  source_kind: "official" as const,
};

interface NewsCase {
  title: string;
  category: string;
  content: string;
  tags: string[];
  risk_features: string[];
  prevention: string;
  script_text: string;
  source: string;
  source_url: string;
  source_title: string;
  published_at: string;
  source_kind: "official" | "media";
}

const CASES: NewsCase[] = [
  // ── 机票退改签（央视新闻 2026-01-07）──
  {
    title: "冒充航空理赔员以航班延误理赔为名骗取银行卡密码",
    category: "机票退改签",
    content:
      "旅客收到航班延误可理赔的短信，联系所谓客服后告知了银行卡号与密码。对方随后以卡内余额不足、不满足赔付标准为由，要求旅客通过网贷平台贷款五万元用于“验资”，旅客在列车上按指引进行人脸识别时被乘警发现并制止。",
    tags: ["航班延误", "理赔", "银行卡密码", "网贷"],
    risk_features: ["伪造航班延误理赔通知", "索要银行卡号与密码", "以余额不足为由诱导网贷"],
    prevention: "航空公司理赔不会索要银行卡密码，也不会要求贷款验资；接到此类电话请挂断并通过官方渠道核实。",
    script_text: "您的航班延误可以理赔，但卡内余额不足，需要先贷款验资",
    ...SRC_FLIGHT,
  },
  {
    title: "虚假民航局网站配合专用App与NFC盗刷二十万",
    category: "机票退改签",
    content:
      "受害人接到自称航空公司保险理赔员的电话，称可免费改签并理赔。受害人点击对方提供的网址进入仿冒平台，客服又发来新链接，要求确认收款银行卡、开启手机NFC“碰一碰”、下载名为“card2.0”的专用App，并向公众号发送理赔信息、输入银行卡密码。操作中手机黑屏数十秒，随后发现银行卡少了二十万元。",
    tags: ["虚假民航网站", "NFC", "专用App", "盗刷"],
    risk_features: ["仿冒民航局或航司网站", "要求开启NFC功能", "诱导安装专用App", "索要银行卡密码"],
    prevention: "退改签请通过航空公司官网或官方App办理；不要在陌生页面开启NFC、安装不明App或输入银行卡密码。",
    script_text: "打开NFC碰一碰，再装个card2.0登记银行卡，退款马上到账",
    ...SRC_FLIGHT,
  },
  {
    title: "以退费需先交保证金手续费为由骗取转账",
    category: "机票退改签",
    content:
      "国家反诈中心总结的话术显示，诈骗分子在取得信任并制造行程危机感后，会以“航班退费需先交保证金”“改签需先交手续费”等理由骗取转账，或发送链接要求填写个人信息、输入二维码与验证码，从而转走账户资金。",
    tags: ["保证金", "手续费", "验证码", "话术套路"],
    risk_features: ["以退费为名先收费", "制造行程危机感", "诱导填写验证码"],
    prevention: "正规退改签不会要求先交保证金或手续费；凡提及“保证金”“手续费”“验证码”的客服电话都应立即挂断。",
    script_text: "退费要先把保证金交一下，改签的话还要交手续费",
    ...SRC_FLIGHT,
  },
  {
    title: "以屏幕共享远程操作方式转走机票退款受害人资金",
    category: "机票退改签",
    content:
      "警方提示，此类诈骗中嫌疑人在非法获取公民机票信息后，以“航班故障、退改签给赔偿”为幌子，诱使受害人下载不熟悉的手机App，再通过屏幕共享、后台窃密等方式，远程转走受害人账户中的资金。",
    tags: ["屏幕共享", "远程操控", "航班故障", "盗刷"],
    risk_features: ["诱导下载陌生App", "要求屏幕共享", "后台窃密远程转账"],
    prevention: "任何要求开启屏幕共享的操作都应立即拒绝；退改签只通过官方渠道办理，不要安装陌生人推荐的App。",
    script_text: "你开个屏幕共享，我教你怎么操作退款",
    ...SRC_FLIGHT,
  },

  // ── 虚拟货币 / 元宇宙投资（广州市公安局 2026-03-21）──
  {
    title: "元宇宙虚拟房产投资骗局骗取一百一十四万",
    category: "虚拟货币",
    content:
      "受害人轻信所谓“元宇宙新型投资平台”，对方虚构“虚拟房产增值”“数字矿机挖币”“虚拟人物打卡日结薪酬”等投资项目，以高回报、低风险为噱头进行话术洗脑。受害人下载不明App后，通过银行转账和USDT虚拟货币交易多次转入资金，累计损失一百一十四万元。",
    tags: ["元宇宙", "虚拟房产", "USDT", "高回报"],
    risk_features: ["借元宇宙等新概念包装", "虚构虚拟房产与矿机项目", "通过USDT转移资金", "承诺高回报低风险"],
    prevention: "新兴概念不等于投资机会；凡是承诺高回报、低风险且要求转入虚拟货币的项目，基本都是诈骗。",
    script_text: "元宇宙虚拟房产马上升值，矿机每天产币，稳赚不赔",
    ...SRC_META,
  },
  {
    title: "以虚拟矿机挖币与虚拟人物打卡日结薪酬为诱饵的投资骗局",
    category: "虚拟货币",
    content:
      "诈骗分子虚构“数字矿机挖币”“虚拟人物打卡日结薪酬”等投资与收益模式，宣称投入后可按日获得稳定回报，并以平台内收益截图营造真实感。受害人投入资金后，所谓项目毫无实际价值，账户资金也无法提现。",
    tags: ["数字矿机", "日结薪酬", "虚假收益", "无法提现"],
    risk_features: ["虚构稳定收益模式", "伪造收益数据", "提现受阻"],
    prevention: "任何声称“日结收益”“稳定产币”的项目都应高度警惕；投资前核实平台资质，不要向陌生平台转账。",
    script_text: "买矿机每天产币，打卡还有日结工资，回本很快",
    ...SRC_META,
  },
  {
    title: "下载不明投资App后多次转账至指定平台无法提现",
    category: "虚拟货币",
    content:
      "受害人在诈骗分子指引下下载了来源不明的投资App，随后按对方提供的账户与平台地址多次转账，既有银行人民币转账，也有USDT虚拟货币交易。直到发现账户资金无法提现、所谓投资项目没有实际价值，才意识到被骗并报警。",
    tags: ["不明App", "USDT", "无法提现", "指定平台"],
    risk_features: ["引导下载非官方App", "指定账户与平台转账", "虚拟货币转移资金"],
    prevention: "投资理财请使用持牌机构的官方App；不要下载陌生人推荐的软件，更不要向私人账户或虚拟货币地址转账。",
    script_text: "下载这个App，钱转到平台账户，收益随时能提",
    ...SRC_META,
  },
];

(async () => {
  const { data: exist, error } = await supabase.from("cases").select("title");
  if (error) throw new Error(`读取 cases 失败: ${error.message}`);
  const known = new Set((exist ?? []).map((r: { title: string }) => r.title));

  const todo = CASES.filter((c) => !known.has(c.title));
  console.log(`新增案例：共 ${CASES.length} 条，待插入 ${todo.length} 条`);
  if (todo.length === 0) return;

  for (const c of todo) {
    const vec = await createEmbedding(`${c.title}\n${c.content}`);
    const { error: insErr } = await supabase.from("cases").insert({
      title: c.title,
      category: c.category,
      risk_label: "诈骗",
      content: c.content,
      source: c.source,
      tags: c.tags,
      embedding: `[${vec.join(",")}]`,
      source_url: c.source_url,
      source_title: c.source_title,
      published_at: c.published_at,
      source_kind: c.source_kind,
      risk_features: c.risk_features,
      prevention: c.prevention,
      script_text: c.script_text,
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
