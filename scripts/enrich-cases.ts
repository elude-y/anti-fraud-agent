/**
 * 案例字段规范化（对应《修改建议》"规范案例信息"一节）。
 *
 * 为每条案例补齐：
 *   - 来源链接 source_url / 标题 source_title / 发布时间 published_at / 来源类型 source_kind
 *   - 风险特征 risk_features
 *   - 防范建议 prevention
 *   - 话术文本 script_text
 *
 * 来源口径：
 *   official = 公安机关或政府网站发布的通报/宣传（可直接引用）
 *   media    = 中央或地方媒体对警方通报的报道
 *   seed     = 自建种子（无外部来源，安全类案例属此类）
 *
 * 运行：npx tsx scripts/enrich-cases.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

interface Source {
  url: string | null;
  title: string;
  published_at: string | null;
  kind: "official" | "media" | "seed";
}

/** 类别 → 来源（链接均已人工打开核实可访问） */
const SOURCES: Record<string, Source> = {
  刷单: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  贷款: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  杀猪盘: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  冒充客服: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  冒充公检法: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  中奖: { url: "http://gaj.sxjz.gov.cn/site/Public/showinfo.aspx?id=2021020518020938250107", title: "国家反诈中心提醒：警惕十大高发诈骗（晋中市公安局转载）", published_at: "2025-06-11", kind: "official" },
  快递理赔: { url: "http://www.pazjw.gov.cn/shuoan/202609/t20260927_31936970.shtml", title: "“三倍理赔”有猫腻 假客服设真骗局（人民公安报，平安浙江网转载）", published_at: "2026-09-27", kind: "official" },
  ETC: { url: "https://m.gmw.cn/toutiao/2025-02/06/content_1303963828.htm", title: "车主注意！警方重要提醒（光明网）", published_at: "2025-02-06", kind: "media" },
  KYC: { url: "https://news.youth.cn/fzlm/202605/t20260528_16684058.htm", title: "刷个脸，竟卷入跨境诈骗大案（中国青年网）", published_at: "2026-05-28", kind: "media" },
  退费: { url: "http://hn.people.com.cn/n2/2025/0826/c406630-41333223.html", title: "培训机构主动退费？当心落入“课程退费”诈骗陷阱（人民网湖南频道）", published_at: "2025-08-26", kind: "media" },
};

/** 类别 → 主要风险特征 */
const RISK_FEATURES: Record<string, string[]> = {
  刷单: ["小额返利建立信任", "诱导大额垫付", "以任务卡单/冻结拒返款", "脱离平台私下转账"],
  贷款: ["低息无抵押诱导", "放款前收费", "解冻金/保证金", "刷流水验资"],
  杀猪盘: ["情感包装建立信任", "虚假投资平台", "前期可提现后无法提现", "内部渠道/博彩漏洞"],
  冒充客服: ["准确报出订单信息", "订单异常/质量问题退款", "诱导点击陌生链接", "索要验证码或屏幕共享"],
  冒充公检法: ["伪造法律文书", "制造恐慌与保密要求", "资金清查/安全账户", "视频笔录或隔离审查"],
  中奖: ["天降中奖通知", "领奖前先收费", "运费/税费/保证金", "仿冒品牌公众号"],
  快递理赔: ["冒充快递客服", "主动高额理赔", "钓鱼链接/陌生APP", "索要银行卡与验证码"],
  ETC: ["短信称账户异常或到期", "附带短链接", "仿冒ETC认证页面", "索要身份证与银行卡"],
  KYC: ["账户信息不全将被冻结", "跳转外部页面补全", "采集人脸与银行卡", "要求转账做流水核验"],
  退费: ["机构倒闭可退费", "先交手续费/保证金", "扫码进群下载APP", "验资名义转账"],
  银行: ["官方短信格式", "客服号码与官网一致", "不索要验证码", "不要求转账"],
  正常服务: ["官方渠道通知", "不索取资金与凭证", "无陌生链接", "无需转账"],
};

/** 类别 → 防范建议 */
const PREVENTION: Record<string, string> = {
  刷单: "任何要求先垫付本金的兼职刷单都是诈骗；不要为陌生任务充值转账，发现被骗立即报警。",
  贷款: "办理贷款请走银行或持牌机构官方渠道；放款前要求缴费、验资、刷流水的，一律是诈骗。",
  杀猪盘: "网络交友涉及投资、博彩、内部渠道的一律停止；正规投资不会通过私人关系带你赚钱。",
  冒充客服: "退款理赔请登录官方App核实；任何人索要验证码、要求共享屏幕的都是诈骗。",
  冒充公检法: "公检法不会电话办案，不存在安全账户，不会要求转账或保密；挂断并拨打110核实。",
  中奖: "正规抽奖不会要求先交运费、税费或保证金；不要点击短信中的领奖链接。",
  快递理赔: "快递理赔由寄件方与快递公司处理；接到主动理赔电话请挂断并登录官方物流平台核实。",
  ETC: "ETC业务请通过发行方官方App或客服办理；不要点击短信链接填写身份证与银行卡。",
  KYC: "实名认证只在官方App内完成；不会要求转账，也不会通过外部链接采集人脸信息。",
  退费: "退费请通过原购买平台或机构官方渠道申请；要求先交手续费、保证金的一律拒绝。",
  银行: "银行不会索要验证码或要求转账；有疑问请拨打银行卡背面的官方客服电话。",
  正常服务: "此类通知无需操作；如遇要求转账或索要验证码的同类信息，请通过官方渠道核实。",
};

interface CaseRow {
  id: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
}

(async () => {
  const { data, error } = await supabase
    .from("cases")
    .select("id,category,risk_label,content,source");
  if (error) throw error;

  const rows = (data ?? []) as CaseRow[];
  console.log(`共 ${rows.length} 条案例`);

  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    const src = SOURCES[r.category];
    const features = RISK_FEATURES[r.category] ?? [];
    const prevention = PREVENTION[r.category] ?? null;

    // 安全类案例：无外部来源，标记为 seed，但仍补齐风险特征与建议
    const payload = {
      source_url: src?.url ?? null,
      source_title: src?.title ?? (r.risk_label === "安全" ? "自建安全案例" : null),
      published_at: src?.published_at ?? null,
      source_kind: src?.kind ?? "seed",
      risk_features: features,
      prevention,
      script_text: r.content,
    };

    if (!features.length || !prevention) {
      skipped++;
      console.warn(`  跳过（无模板）: [${r.category}] ${r.id}`);
      continue;
    }

    const { error: upErr } = await supabase.from("cases").update(payload).eq("id", r.id);
    if (upErr) throw new Error(`更新失败 ${r.id}: ${upErr.message}`);
    updated++;
  }

  console.log(`\n更新 ${updated} 条，跳过 ${skipped} 条`);

  const { count: withUrl } = await supabase
    .from("cases")
    .select("*", { count: "exact", head: true })
    .not("source_url", "is", null);
  const { count: withPrevention } = await supabase
    .from("cases")
    .select("*", { count: "exact", head: true })
    .not("prevention", "is", null);
  const { count: total } = await supabase.from("cases").select("*", { count: "exact", head: true });

  console.log(`有来源链接：${withUrl}/${total}　有防范建议：${withPrevention}/${total}`);
})().catch((e) => {
  console.error("填充失败:", e);
  process.exit(1);
});
