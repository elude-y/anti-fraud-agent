/**
 * 继续扩充：医保社保、AI 换脸两类新型诈骗。
 *
 * 来源（均已打开核实，正文为依据原文改写的简述）：
 *   1. 淮北市公安局《警方提示：别信！医保诈骗新套路！》2025-05-20
 *      https://gaj.huaibei.gov.cn/jwzx/jfts/57931954.html
 *   2. 忻州市忻府区人民法院《利用“AI换脸”诈骗网恋对象 女子被判刑罚》2025-11-28
 *      https://xzxffy.shanxify.gov.cn/article/detail/2025/11/id/9091051.shtml
 *
 * 幂等：按 title 去重。
 * 运行：npx tsx scripts/seed-news-cases2.ts
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

const SRC_MED = {
  source: "淮北市公安局警情提示",
  source_url: "https://gaj.huaibei.gov.cn/jwzx/jfts/57931954.html",
  source_title: "警方提示：别信！医保诈骗新套路！（淮北市公安局）",
  published_at: "2025-05-20",
  source_kind: "official" as const,
};

const SRC_AI = {
  source: "人民法院报案例（忻府区法院转载）",
  source_url: "https://xzxffy.shanxify.gov.cn/article/detail/2025/11/id/9091051.shtml",
  source_title: "利用“AI换脸”诈骗网恋对象 女子被判刑罚（人民法院报）",
  published_at: "2025-11-28",
  source_kind: "official" as const,
};

const CASES: NewsCase[] = [
  // ── 医保社保（淮北市公安局 2025-05-20，四种套路）──
  {
    title: "冒充医保部门称可二次报销诱导绑定银行卡",
    category: "医保社保",
    content:
      "受害人接到以95开头的七位数电话，对方自称医保部门工作人员，称可帮忙查看补充医保电子保单、报销剩余部分还能二次报销，随后指导其关注公众号并填写客服邀请码。当对方要求绑定银行卡时，受害人产生怀疑并挂断电话。",
    tags: ["医保", "二次报销", "公众号", "绑定银行卡"],
    script_text: "我是医保局的，你的报销还有剩余可以二次报销，关注公众号填个邀请码，再绑下银行卡",
    risk_features: ["冒用医保部门身份", "以二次报销为诱饵", "引导关注公众号填邀请码", "索要银行卡绑定"],
    prevention: "医保报销一律通过医保经办机构或官方App办理，不会电话引导关注公众号、填写邀请码或绑定银行卡。",
    ...SRC_MED,
  },
  {
    title: "短信称医保卡停用需点击链接验证身份",
    category: "医保社保",
    content:
      "不法分子群发短信，称“医保卡已停用，点击链接验证身份”“医保账户需升级，请完善信息”“医保资料缺失将被暂停使用”，诱导参保人点击短信中的钓鱼链接，进入仿冒页面填写身份证、银行卡与验证码。",
    tags: ["医保卡停用", "钓鱼链接", "身份验证", "短信"],
    script_text: "您的医保卡已停用，请点击链接验证身份，否则将影响使用",
    risk_features: ["伪造医保停用通知", "短信钓鱼链接", "套取身份与银行卡信息"],
    prevention: "医保电子凭证状态以官方App查询为准；短信中的链接不要点击，更不要在陌生页面填写验证码。",
    ...SRC_MED,
  },
  {
    title: "以医保补贴到账为名骗取银行卡验证码",
    category: "医保社保",
    content:
      "骗子群发“医保补贴到账”“报销款未领取”“居民补充医疗保险已申请”等信息，要求点击链接填写银行卡号、验证码以领取补贴，实际是将受害人银行卡与支付账户绑定后盗刷资金。",
    tags: ["医保补贴", "报销款", "验证码", "盗刷"],
    script_text: "您有一笔医保补贴未领取，点击链接填写银行卡和验证码即可到账",
    risk_features: ["虚假补贴通知", "诱导填写验证码", "关联账户盗刷"],
    prevention: "医保补贴不会通过短信链接发放，也不需要提供银行卡验证码；收到此类信息直接删除。",
    ...SRC_MED,
  },
  {
    title: "恐吓医保卡涉嫌套现需转账解冻",
    category: "医保社保",
    content:
      "骗子谎称受害人“不解除每年会扣款”“医保卡涉嫌套现、违规报销”“医保资料缺失将被暂停使用”，以冻结账户相威胁，诱导受害人联系所谓客服并转账“解冻”，从而骗取钱财。",
    tags: ["医保套现", "账户冻结", "转账解冻", "恐吓"],
    script_text: "你的医保卡涉嫌违规套现，账户要被冻结，赶紧转钱过来做资金解冻",
    risk_features: ["制造账户冻结恐慌", "虚构违规套现", "诱导转账解冻"],
    prevention: "医保部门不会以冻结账户为由要求转账；凡要求转入“安全账户”或缴纳解冻金的，都是诈骗。",
    ...SRC_MED,
  },
  {
    title: "伪造医保政策文件诱导下载木马APP",
    category: "医保社保",
    content:
      "骗子以“医保新规”“系统升级”为借口，要求参保人下载所谓政策文件或专用App，这些附件与安装包内嵌木马病毒，一旦下载安装，个人信息与短信验证码即可能被窃取，进而造成资金损失。",
    tags: ["医保新规", "木马APP", "系统升级", "附件"],
    script_text: "医保系统升级了，下载这个App完善信息，不然后面报销用不了",
    risk_features: ["伪造政策通知", "诱导安装木马应用", "窃取个人信息与验证码"],
    prevention: "政务与医保业务只通过官方应用商店下载的官方App办理；不要安装陌生来源的安装包或打开不明附件。",
    ...SRC_MED,
  },

  // ── AI 换脸（人民法院报 2025-11-28，山东宁阳法院判决）──
  {
    title: "AI换脸伪造白富美人设网恋诈骗十三万",
    category: "AI换脸",
    content:
      "被告人孙某在网络游戏中结识受害人后，虚构“白富美”人设，通过伪造身份证件、利用虚拟人脸技术与受害人视频聊天，骗取其信任并确立恋爱关系。自2024年11月起虚构各种事由索取钱财，累计诈骗近十三万元后失联，法院以诈骗罪判处其有期徒刑三年、缓刑四年。",
    tags: ["AI换脸", "网恋", "伪造身份证件", "视频通话"],
    script_text: "视频里你看到的就是我，我怎么可能骗你，先借我点钱周转",
    risk_features: ["AI换脸伪造视频形象", "伪造身份证件", "虚构优质人设", "以恋爱关系索财"],
    prevention: "视频中的人脸与声音都可以被伪造，涉及转账时务必通过多种方式核验身份，不要仅凭视频通话确认对方。",
    ...SRC_AI,
  },
  {
    title: "语音合成伪造对话谎称获巨额拆迁款",
    category: "AI换脸",
    content:
      "被告人使用录音合成软件制作虚假对话，谎称自己将获得巨额拆迁款，以此让受害人相信其还款能力，诱使受害人多次转账并为其购买高端手机，财物得手后立即失联。",
    tags: ["语音合成", "拆迁款", "虚假对话", "借款"],
    script_text: "我家马上拆迁，补偿款一下来就还你，先帮我垫一下",
    risk_features: ["语音合成伪造对话", "虚构大额收入来源", "以还款能力骗取信任"],
    prevention: "声音同样可以被合成，听到“熟人”声音要求转账时应挂断并回拨核实；任何借款都应留存书面凭证。",
    ...SRC_AI,
  },
  {
    title: "伪造身份证件与虚拟人脸骗取网恋对象信任",
    category: "AI换脸",
    content:
      "案件中被告人通过伪造身份证件、配合虚拟人脸技术进行视频通话，使受害人相信其真实身份与外貌，进而建立恋爱关系并持续实施诈骗。法院认定其利用AI换脸、语音合成等新技术手段虚构事实、骗取财物，构成诈骗罪。",
    tags: ["AI换脸", "伪造证件", "身份核验", "恋爱诈骗"],
    script_text: "身份证照片发你了，视频也通了，你还不信我？",
    risk_features: ["证件照片可伪造", "视频画面可换脸", "以恋爱关系掩护索财"],
    prevention: "身份证照片、视频画面均不能作为身份核验依据；网恋对象频繁索要钱财时，应提高警惕并及时报警。",
    ...SRC_AI,
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
