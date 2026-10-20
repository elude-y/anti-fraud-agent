/**
 * 数据打磨（第四周）：把早期几条笼统、过短的案例改写为具体可检索的条目，并重算向量。
 *
 * 幂等：按旧标题定位，若旧标题已不存在则跳过（说明已打磨过）。
 * 运行：npx tsx scripts/polish-data.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "../src/lib/rag/embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

interface Fix {
  oldTitle: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
}

const FIXES: Fix[] = [
  {
    oldTitle: "刷单返利诈骗",
    title: "兼职刷单小额返利诱导大额垫付",
    content:
      "骗子在社交软件发布刷单兼职广告，先用小额任务返还佣金建立信任，随后下发大额连单任务，要求受害人不断充值垫付，最后以任务未完成、账户冻结为由拒绝返还本金并将受害人拉黑。",
    tags: ["刷单", "垫付", "连单", "返利"],
    source: "反诈知识库种子",
  },
  {
    oldTitle: "冒充公检法要求转账",
    title: "冒充公安称涉嫌犯罪要求资金清查",
    content:
      "骗子冒充公安机关或检察院工作人员来电，谎称受害人涉嫌洗钱等犯罪，出示伪造的法律文书制造恐慌，要求将资金转入所谓安全监管账户接受清查，并叮嘱不得告知家人，转账后资金无法追回。",
    tags: ["冒充公检法", "资金清查", "安全账户", "伪造文书"],
    source: "反诈知识库种子",
  },
  {
    oldTitle: "快递理赔诈骗",
    title: "冒充快递员谎称快递丢失主动理赔",
    content:
      "骗子冒充快递公司工作人员，电话或短信告知受害人的包裹在运输中丢失或损坏，主动提出高额理赔，随后发送仿冒链接或要求提供银行卡号、短信验证码，进而盗刷受害人账户资金。",
    tags: ["快递理赔", "包裹丢失", "钓鱼链接", "验证码"],
    source: "反诈知识库种子",
  },
  {
    oldTitle: "冒充客服退款诈骗",
    title: "冒充电商客服谎称订单异常办理退款",
    content:
      "骗子冒充电商平台客服，准确报出受害人订单信息后谎称订单异常需要退款，诱导点击陌生链接填写银行卡与验证码，或要求开启屏幕共享远程操作，最终盗取账户资金。",
    tags: ["冒充客服", "订单异常", "退款", "屏幕共享"],
    source: "反诈知识库种子",
  },
  {
    oldTitle: "冒充品牌公众号抽奖中奖诈骗",
    title: "冒充品牌公众号抽奖中奖诈骗",
    content:
      "不法分子仿冒知名品牌公众号推送中奖通知，谎称用户抽中手机或现金大奖，要求先行支付运费、税费、保证金后才能领奖，转账完成后对方立即拉黑，奖品始终不会发放。",
    tags: ["中奖", "仿冒公众号", "运费税费", "保证金"],
    source: "反诈知识库种子",
  },
];

(async () => {
  let updated = 0;

  for (const f of FIXES) {
    const { data, error } = await supabase
      .from("cases")
      .select("id,title,content")
      .eq("title", f.oldTitle)
      .limit(1);
    if (error) throw new Error(`查询失败: ${error.message}`);

    if (!data || data.length === 0) {
      console.log(`跳过（已打磨过或不存在）: ${f.oldTitle}`);
      continue;
    }

    const row = data[0] as { id: string; title: string; content: string };
    const vec = await createEmbedding(`${f.title}\n${f.content}`);

    const { error: upErr } = await supabase
      .from("cases")
      .update({
        title: f.title,
        content: f.content,
        tags: f.tags,
        source: f.source,
        embedding: `[${vec.join(",")}]`,
      })
      .eq("id", row.id);

    if (upErr) throw new Error(`更新失败 ${f.title}: ${upErr.message}`);
    updated++;
    console.log(`✅ ${f.oldTitle}  →  ${f.title}`);
  }

  console.log(`\n本次打磨 ${updated} 条`);
})().catch((e) => {
  console.error("打磨失败:", e);
  process.exit(1);
});
