/**
 * 从公开报道扩充案例库（《修改建议》"增加真实案例"）。
 *
 * 来源（均已打开核实，正文为依据报道改写的简述，非逐字转载）：
 *   1. 中国警察网《一人分饰三角，男子专门"杀熟"》2025-08-22
 *      https://daan.cpd.com.cn/dajs/825/t_1197794.html
 *   2. 光明网（转公安部刑侦局）《警方提醒：警惕网络游戏虚假交易类诈骗》2025-07-29
 *      https://m.gmw.cn/2025-07/29/content_1304096705.htm
 *   3. 人民网四川频道《警惕！虚假投资理财诈骗成新套路》2025-11-15
 *      http://sc.people.com.cn/n2/2025/1115/c345509-41412377.html
 *
 * 新增三个类别：冒充熟人 / 网络游戏交易 / 虚假投资理财
 * 幂等：按 title 去重。
 *
 * 运行：npx tsx scripts/seed-news-cases.ts
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

interface NewsCase {
  title: string;
  category: string;
  content: string;
  tags: string[];
  source: string;
  source_url: string;
  source_title: string;
  published_at: string;
  source_kind: "official" | "media";
  risk_features: string[];
  prevention: string;
  script_text: string;
}

const SRC_A = {
  source: "中国警察网通报案例",
  source_url: "https://daan.cpd.com.cn/dajs/825/t_1197794.html",
  source_title: "一人分饰三角，男子专门“杀熟”（中国警察网-人民公安报）",
  published_at: "2025-08-22",
  source_kind: "official" as const,
};

const SRC_B = {
  source: "公安部刑侦局提示（光明网转载）",
  source_url: "https://m.gmw.cn/2025-07/29/content_1304096705.htm",
  source_title: "警方提醒：警惕网络游戏虚假交易类诈骗（公安部刑侦局）",
  published_at: "2025-07-29",
  source_kind: "official" as const,
};

const SRC_C = {
  source: "人民网四川频道报道",
  source_url: "http://sc.people.com.cn/n2/2025/1115/c345509-41412377.html",
  source_title: "警惕！虚假投资理财诈骗成新套路（人民网四川频道）",
  published_at: "2025-11-15",
  source_kind: "media" as const,
};

const CASES: NewsCase[] = [
  // ── 冒充熟人/领导（中国警察网 2025-08-22 漯河临颍案）──
  {
    title: "冒充领导侄子以安排工作需要打点费为由诈骗",
    category: "冒充熟人",
    content:
      "嫌疑人营造出手阔绰、背景深厚的形象，下载领导照片谎称是其叔叔，并以另外两个微信号分别冒充“当领导的叔叔”和“秘书”。以帮助安排工作需要打点关系、办理手续为由，先后骗取受害人十一万余元。",
    tags: ["冒充领导", "安排工作", "打点关系", "多重身份"],
    script_text: "我叔叔是某领导，能给你安排工作，先拿点钱打点关系、办手续",
    risk_features: ["虚构领导亲属身份", "多账号分饰角色", "以安排工作为诱饵", "层层索要打点费"],
    prevention: "国家机关和事业单位招录有公开程序，不存在“内部安排”；凡是自称领导亲属能办事并索要钱财的，一律是诈骗。",
    ...SRC_A,
  },
  {
    title: "冒充工友以安排司机岗位收取报名服装费",
    category: "冒充熟人",
    content:
      "嫌疑人得知旧工友正在找工作，便复用同一套路，谎称可以介绍给领导开车的工作，以缴纳报名费、服装费等名义骗取一万七千余元，随后又以帮忙办理毕业证为由继续索要钱款。",
    tags: ["冒充熟人", "介绍工作", "报名费", "服装费"],
    script_text: "我给领导开车，能帮你介绍一下，先交报名费和服装费",
    risk_features: ["利用熟人关系降低戒心", "虚假岗位名义收费", "连环索要费用"],
    prevention: "熟人介绍工作也要核实单位与岗位真实性；任何以报名费、服装费、押金为先决条件的招工，都应当警惕。",
    ...SRC_A,
  },
  {
    title: "谎称代办大专毕业证收取办证费用",
    category: "冒充熟人",
    content:
      "嫌疑人在为他人“安排工作”的过程中，被问及能否办理大专毕业证时满口答应，借机收取七千余元办证费用，实际上并未办理任何证件，钱款被其占为己有。",
    tags: ["办证诈骗", "学历证书", "熟人介绍"],
    script_text: "毕业证我能办，交点钱和材料就行",
    risk_features: ["承诺办理学历证件", "收取费用不办事", "依托熟人信任"],
    prevention: "学历证书只能通过正规教育渠道取得，任何“花钱办证”都是诈骗，且买卖证件本身违法。",
    ...SRC_A,
  },

  // ── 网络游戏虚假交易（光明网转公安部刑侦局 2025-07-29）──
  {
    title: "高价收购游戏账号诱导至虚假交易平台收解冻费",
    category: "网络游戏交易",
    content:
      "受害人在游戏中收到好友申请，对方提出以三千元高价收购其游戏账号。对方发来网址链接称需通过平台交易，受害人注册后平台显示有三千元冻结资金，需先支付九百元解冻费才能交易，付款后账号仍显示冻结。",
    tags: ["游戏账号", "虚假交易平台", "解冻费", "高价收购"],
    script_text: "你的号我出三千收，走平台交易，先交解冻费就能提现",
    risk_features: ["高价收购为诱饵", "引导至虚假交易平台", "以解冻费名义收费", "继续加收手续费认证金"],
    prevention: "买卖游戏账号、道具请使用官方或正规第三方平台；任何要求先交解冻费、手续费、认证金的交易都是诈骗。",
    ...SRC_B,
  },
  {
    title: "以注册费会员费名义层层加码的游戏交易诈骗",
    category: "网络游戏交易",
    content:
      "诈骗分子在社交和游戏平台发布低价充值、免费领取道具的广告，诱导玩家到指定平台或私下交易。随后以操作失误、账号等级不够等理由，要求支付注册费、会员费、解冻费，累计骗取三万余元后拉黑受害人。",
    tags: ["低价充值", "会员费", "注册费", "拉黑"],
    script_text: "充值要先开会员、交注册费，不然账号用不了",
    risk_features: ["低价充值诱导", "脱离官方平台", "编造操作失误理由", "层层收费后拉黑"],
    prevention: "游戏充值与道具交易请在游戏内官方商城完成；私下交易和第三方“低价渠道”均存在被骗风险。",
    ...SRC_B,
  },
  {
    title: "游戏代练赚钱为诱饵的虚假交易诈骗",
    category: "网络游戏交易",
    content:
      "诈骗分子以游戏代练、代打可以赚钱为诱饵吸引玩家，随后要求玩家先缴纳保证金或购买指定服务，声称完成任务后一并返还。玩家付款后对方以任务未完成、需要继续投入为由拒绝返款并失联。",
    tags: ["游戏代练", "保证金", "返款失败"],
    script_text: "做代练一天能赚几百，先交保证金，做完一起返",
    risk_features: ["代练兼职为诱饵", "缴纳保证金", "以任务未完成为由拒返款"],
    prevention: "游戏代练类兼职多与诈骗、盗号风险相关，切勿向陌生方缴纳保证金或提供账号密码。",
    ...SRC_B,
  },

  // ── 虚假投资理财（人民网四川 2025-11-15 成都高新案）──
  {
    title: "冒充理财大师承诺内幕消息要求线下交付现金",
    category: "虚假投资理财",
    content:
      "嫌疑人冒充理财大师，谎称可以代理炒股并有“高手指导”和“内幕消息”，承诺收益率不低于百分之十，但要求受害人必须通过其指定账户购买。为规避资金监管，最终要求受害人取现后线下交付现金。",
    tags: ["理财大师", "内幕消息", "线下取现", "指定账户"],
    script_text: "跟着我炒股，内部消息，收益不低于10%，但必须走我指定的账户",
    risk_features: ["冒充理财专家", "承诺保底高收益", "要求走指定账户", "诱导线下现金交付"],
    prevention: "正规证券投资必须通过持牌机构开户交易；承诺保本高收益、要求转账到个人账户或线下交付现金的，都是诈骗。",
    ...SRC_C,
  },
  {
    title: "线下现金交接规避监管的投资理财诈骗",
    category: "虚假投资理财",
    content:
      "警方在侦办一起投资理财诈骗案时发现，嫌疑人收取现金后正准备接手下一笔。受害人已从银行取出十六万元现金，在小区内准备交给自称“张经理”的嫌疑人，所幸被民警当场拦截，现金完好无损。",
    tags: ["线下交付", "现金", "投资理财", "警方拦截"],
    script_text: "现金交给我们经理，线下操作收益更高，也不用走银行流水",
    risk_features: ["要求现金交易规避监管", "线下专人收钱", "以高收益麻痹受害人"],
    prevention: "凡是要求取现、线下交付现金的“投资”，都是诈骗的典型特征；遇到此类要求应立即停止并报警。",
    ...SRC_C,
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
