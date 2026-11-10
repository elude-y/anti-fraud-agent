/**
 * 继续扩充：从《国家反诈中心提醒：警惕十大高发诈骗》中提取尚未覆盖的场景。
 *
 * 来源（已核实可访问）：
 *   http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107
 *   晋中市公安局转载，2025-06-11
 *
 * 新增：注销校园贷、虚假购物；补充：虚假投资理财（荐股群）、冒充熟人、刷单
 * 幂等：按 title 去重。
 *
 * 运行：npx tsx scripts/seed-news-cases3.ts
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

const SRC = {
  source: "国家反诈中心十大高发诈骗（晋中市公安局转载）",
  source_url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107",
  source_title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）",
  published_at: "2025-06-11",
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
  {
    title: "荐股群导师推荐优股致受害人投入七十六万无法提现",
    category: "虚假投资理财",
    content:
      "受害人对投资理财文章产生兴趣后添加所谓导师助理，被拉入投资讲解微信群并安装指定理财软件。群内“导师”每日推荐股票，多人称收益可观，受害人先后分八笔投入七十六万元，账面盈利二百万元，准备提现时发现无法操作并被拉黑。",
    tags: ["荐股群", "导师", "虚假理财APP", "无法提现"],
    risk_features: ["冒充投资导师", "群内托儿造势", "指定理财软件", "提现受阻后拉黑"],
    prevention: "荐股群、投资群里的“导师”和“学员”多为托儿；正规证券投资不使用来路不明的理财软件。",
    script_text: "跟着导师买，稳赚不赔，下载这个软件一起操作",
    ...SRC,
  },
  {
    title: "投资群里除受害人外全是托儿",
    category: "虚假投资理财",
    content:
      "警方查明，受害人所处的微信聊天群由诈骗团伙操控，群内所谓的导师、助理与晒收益的群友大多是诈托，仅受害人一人是真实投资者。团伙通过操控虚假平台数据制造盈利假象，最终使受害人血本无归。",
    tags: ["投资群", "托儿", "虚假盈利", "操控后台"],
    risk_features: ["群成员多为托", "伪造盈利截图", "后台操控盈亏"],
    prevention: "凡是拉你进群、晒收益、催你入金的“投资群”，都应视为高风险；投资前核实平台是否持牌。",
    script_text: "群里大家都在赚钱，就你还在观望",
    ...SRC,
  },
  {
    title: "冒充客服以注销校园贷记录为由诱导贷款转账",
    category: "注销校园贷",
    content:
      "受害人接到自称支付平台客服的电话，对方称其有“校园贷”记录需要注销、否则影响征信，并能准确说出其个人信息。受害人按要求开启会议软件共享屏幕，在多个网贷平台申请贷款后转入对方提供的四个陌生账户，损失近四万元。",
    tags: ["注销校园贷", "征信", "共享屏幕", "网贷"],
    risk_features: ["冒充电商或支付客服", "以征信施压", "诱导共享屏幕", "指导网贷后转账"],
    prevention: "不存在“注销校园贷”业务；凡是称不注销就影响征信、并要求转账或共享屏幕的，一律是诈骗。",
    script_text: "你名下有校园贷记录，不注销会上征信黑名单，按我说的操作就能清掉",
    ...SRC,
  },
  {
    title: "直播间购物送抽奖，中奖后奖品永不发货",
    category: "虚假购物",
    content:
      "受害人在直播间看到“购物送抽奖、中奖率百分百”的广告，花一千一百元购买化妆品并抽中平板电脑，但迟迟收不到奖品，联系主播也未获答复。警方研判认定该主播涉嫌以抽奖为名实施诈骗。",
    tags: ["直播带货", "抽奖", "虚假购物", "不发货"],
    risk_features: ["中奖率百分百为诱饵", "诱导高价购物", "奖品不发货"],
    prevention: "对“购物必中奖”“百分百中奖”等宣传保持警惕；购物请通过正规电商平台并保留交易凭证。",
    script_text: "今天下单百分百中奖，奖品马上安排发货",
    ...SRC,
  },
  {
    title: "盗用朋友头像加好友以代付礼品钱为由骗十八万",
    category: "冒充熟人",
    content:
      "受害人收到头像与朋友一致的微信好友申请，通过后对方称要给领导送礼、希望其代为支付礼品款，并发来银行卡账户。受害人未进一步核实即转账十八万元，随后对方又以需要继续转账为由反复索要，直至当面询问朋友才知被骗。",
    tags: ["冒充熟人", "盗用头像", "代付", "转账"],
    risk_features: ["盗用熟人头像昵称", "编造送礼等紧急事由", "提供陌生收款账户"],
    prevention: "凡是通过微信、QQ、短信要求转账的，务必电话或当面核实；头像和昵称都可以伪造。",
    script_text: "我这边不方便转账，你先帮我垫一下，晚点还你",
    ...SRC,
  },
  {
    title: "兼职刷单被引导至博彩平台充值一百零八万",
    category: "刷单",
    content:
      "受害人被拉入兼职刷单微信群，群内客服诱导其向所谓网络博彩平台充值刷流水。前期小额充值均能获利并顺利提现，随着本金不断加大，累计充值达一百零八万元，待准备提现时发现账户无法操作并被踢出群聊。",
    tags: ["刷单", "博彩平台", "刷流水", "无法提现"],
    risk_features: ["以兼职刷单引流", "转入博彩平台刷流水", "小额可提现建立信任", "大额后封号"],
    prevention: "所有刷单都是诈骗；被要求向博彩平台充值刷流水的，属于典型诈骗兼违法赌博，应立即停止并报警。",
    script_text: "充值刷流水就能赚差价，前面几单都能提现，放心做",
    ...SRC,
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
