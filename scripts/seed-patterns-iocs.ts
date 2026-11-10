/**
 * 补齐 patterns（话术模式）与 iocs（域名/IP/短链）种子数据。
 *
 * 运行：npx tsx scripts/seed-patterns-iocs.ts
 *
 * 说明：
 *  - patterns 的 embedding 用 bge-m3 现场生成，与 cases 保持同一向量空间
 *  - iocs 一律使用保留命名空间（.example 域名、192.0.2.0/24 等文档 IP 段），
 *    避免把真实域名/IP 写进反诈库造成误伤；
 *  - 幂等：patterns 按 pattern 文本去重，iocs 按 value 去重
 */
import { createClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "../src/lib/db/supabase";
import { createEmbedding } from "../src/lib/rag/embedding";

// cases/patterns/iocs 三张表都启用了 RLS，anon key 只能读不能写。
// 种子写入必须用 service_role 绕过 RLS（该 key 只存在于服务端 .env.local）。
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = serviceKey
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : createSupabaseClient();

if (!serviceKey) {
  console.warn("⚠️ 未找到 SUPABASE_SERVICE_ROLE_KEY，将用 anon key 尝试写入（很可能被 RLS 拒绝）");
}

interface PatternSeed {
  pattern: string;
  category: string;
  keywords: string[];
}

const PATTERNS: PatternSeed[] = [
  // 刷单
  { pattern: "先做小额任务返佣建立信任，再要求大额连单垫付，以任务未完成冻结资金为由拒绝返款", category: "刷单", keywords: ["小额返佣", "连单", "垫付", "冻结"] },
  { pattern: "刷单平台提现失败，提示需缴纳解冻金或保证金才能取出本金", category: "刷单", keywords: ["提现失败", "解冻金", "保证金"] },
  { pattern: "招募点赞、好评、关注兼职，要求下载陌生APP完成刷单任务", category: "刷单", keywords: ["点赞兼职", "好评", "陌生APP"] },
  // 冒充客服
  { pattern: "自称平台客服，称订单异常或商品质量问题需办理退款，引导添加私人微信", category: "冒充客服", keywords: ["订单异常", "商品质量", "退款", "私人微信"] },
  { pattern: "理赔退款过程中要求开启屏幕共享，远程查看银行卡与验证码", category: "冒充客服", keywords: ["理赔", "屏幕共享", "验证码"] },
  { pattern: "称误开通会员将自动扣费，需点击链接关闭，页面套取银行卡信息", category: "冒充客服", keywords: ["会员扣费", "误开通", "钓鱼链接"] },
  // 快递理赔
  { pattern: "冒充快递客服称包裹丢失，主动提出高额理赔，要求提供银行卡号与短信验证码", category: "快递理赔", keywords: ["包裹丢失", "理赔", "银行卡", "验证码"] },
  { pattern: "短信通知快递损毁，点击链接领取赔偿金，页面为仿冒物流网站", category: "快递理赔", keywords: ["快递损毁", "短信", "链接", "赔偿"] },
  { pattern: "称快递包裹含违禁品需配合理赔调查，诱导向指定账户转账", category: "快递理赔", keywords: ["违禁品", "理赔调查", "转账"] },
  // ETC
  { pattern: "短信称ETC账户异常或即将停用，点击链接完成认证否则影响通行", category: "ETC", keywords: ["ETC", "账户异常", "停用", "认证"] },
  { pattern: "称ETC即将到期失效，点击链接续约，页面收集身份证与银行卡", category: "ETC", keywords: ["ETC", "到期", "续约"] },
  { pattern: "冒充ETC客服称多扣通行费可退费，索要验证码后盗刷", category: "ETC", keywords: ["ETC", "退费", "验证码"] },
  // KYC
  { pattern: "称账户KYC身份信息不全将被冻结，引导跳转页面补全人脸与银行卡", category: "KYC", keywords: ["KYC", "冻结", "人脸", "银行卡"] },
  { pattern: "支付账号实名信息过期，点击链接补全身份资料，实为钓鱼页面", category: "KYC", keywords: ["实名", "过期", "身份资料"] },
  { pattern: "冒充银行称KYC核验不通过，要求转账做流水核验", category: "KYC", keywords: ["银行", "KYC", "流水核验"] },
  // 中奖
  { pattern: "恭喜中奖，需先缴纳个人所得税、保证金或手续费才能领奖", category: "中奖", keywords: ["中奖", "税费", "保证金", "手续费"] },
  { pattern: "抽中手机或平板，支付运费即可领取，付款后无任何实物", category: "中奖", keywords: ["抽奖", "运费", "领取"] },
  { pattern: "仿冒品牌公众号推送中奖通知，要求转账税费后拉黑", category: "中奖", keywords: ["仿冒公众号", "中奖", "税费"] },
  // 杀猪盘
  { pattern: "网恋对象取得信任后推荐内部投资平台，前期小额可提现，大额后无法登录", category: "杀猪盘", keywords: ["网恋", "内部平台", "投资", "无法提现"] },
  { pattern: "自称掌握博彩平台漏洞，带受害人下注稳赚，充值后无法提现", category: "杀猪盘", keywords: ["博彩", "漏洞", "下注", "充值"] },
  { pattern: "以家人重病、生意周转为由多次借钱，得手后拉黑失联", category: "杀猪盘", keywords: ["借钱", "家庭变故", "拉黑"] },
  // 贷款
  { pattern: "低息无抵押贷款，称银行卡号填写错误需缴纳解冻金才能放款", category: "贷款", keywords: ["低息", "无抵押", "解冻金"] },
  { pattern: "可洗白征信办理大额贷款，先收取服务费、征信修复费", category: "贷款", keywords: ["征信", "洗白", "服务费"] },
  { pattern: "贷款审批不通过，称需转账刷流水提高通过率", category: "贷款", keywords: ["审批失败", "刷流水", "转账"] },
  // 冒充公检法
  { pattern: "自称公安、检察院，称涉嫌洗钱需资金清查，要求转入安全账户", category: "冒充公检法", keywords: ["公安", "检察院", "洗钱", "安全账户"] },
  { pattern: "发送伪造逮捕证、传票，通过视频做笔录恐吓受害人转账", category: "冒充公检法", keywords: ["逮捕证", "传票", "视频笔录"] },
  { pattern: "要求受害人单独隔离、不得告知家人，配合所谓保密调查", category: "冒充公检法", keywords: ["隔离", "保密", "配合调查"] },
  // 退费
  { pattern: "冒充培训机构称可办理学费退费，需先缴纳手续费或保证金", category: "退费", keywords: ["培训机构", "退费", "手续费"] },
  { pattern: "网课平台全额退费，要求扫码进群、下载APP做验资", category: "退费", keywords: ["网课", "全额退费", "验资", "APP"] },
  { pattern: "以机构倒闭清退为由，引导填写银行卡信息并转账", category: "退费", keywords: ["机构倒闭", "清退", "银行卡"] },
];

interface IocSeed {
  type: "domain" | "ip" | "url" | "shortlink";
  value: string;
  verdict: string;
  source: string;
}

const SRC = "示例数据（保留域名/文档IP段，非真实恶意地址）";

const IOCS: IocSeed[] = [
  { type: "domain", value: "etc-auth.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "etc-renew.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "kuaidi-claim.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "refund-service.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "kyc-verify.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "loan-apply.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "parttime-task.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "award-center.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "safe-account.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "tuifei-online.example", verdict: "恶意", source: SRC },
  { type: "domain", value: "invest-pro.example", verdict: "恶意", source: SRC },

  { type: "url", value: "https://etc-auth.example/login?redirect=wx", verdict: "恶意", source: SRC },
  { type: "url", value: "https://kuaidi-claim.example/refund?id=8821", verdict: "恶意", source: SRC },
  { type: "url", value: "https://kyc-verify.example/upload", verdict: "恶意", source: SRC },
  { type: "url", value: "https://refund-service.example/pay", verdict: "恶意", source: SRC },
  { type: "url", value: "https://invest-pro.example/trade", verdict: "恶意", source: SRC },

  { type: "shortlink", value: "https://t.example/x8Kq2", verdict: "可疑", source: SRC },
  { type: "shortlink", value: "https://u.example/9fLm3", verdict: "可疑", source: SRC },
  { type: "shortlink", value: "https://s.example/aB12c", verdict: "可疑", source: SRC },

  // 文档保留地址段（RFC 5737），仅用于演示匹配逻辑
  { type: "ip", value: "192.0.2.45", verdict: "恶意", source: SRC },
  { type: "ip", value: "198.51.100.23", verdict: "恶意", source: SRC },
  { type: "ip", value: "203.0.113.77", verdict: "恶意", source: SRC },
  { type: "ip", value: "203.0.113.201", verdict: "可疑", source: SRC },
];

async function seedPatterns() {
  const { data: exist, error } = await supabase.from("patterns").select("pattern");
  if (error) throw new Error(`读取 patterns 失败: ${error.message}`);
  const known = new Set((exist ?? []).map((r: { pattern: string }) => r.pattern));

  const todo = PATTERNS.filter((p) => !known.has(p.pattern));
  console.log(`patterns: 共 ${PATTERNS.length} 条，待插入 ${todo.length} 条`);
  if (todo.length === 0) return;

  const rows: { pattern: string; category: string; keywords: string[]; embedding: string }[] = [];
  for (const p of todo) {
    const vec = await createEmbedding(`${p.pattern}\n${p.keywords.join("、")}`);
    rows.push({
      pattern: p.pattern,
      category: p.category,
      keywords: p.keywords,
      embedding: `[${vec.join(",")}]`,
    });
    console.log(`  向量化 ${p.category} / ${p.pattern.slice(0, 24)}…`);
  }

  const { error: insErr } = await supabase.from("patterns").insert(rows);
  if (insErr) throw new Error(`插入 patterns 失败: ${insErr.message}`);
  console.log(`patterns 插入完成：${rows.length} 条`);
}

async function seedIocs() {
  const { data: exist, error } = await supabase.from("iocs").select("value");
  if (error) throw new Error(`读取 iocs 失败: ${error.message}`);
  const known = new Set((exist ?? []).map((r: { value: string }) => r.value));

  const todo = IOCS.filter((i) => !known.has(i.value));
  console.log(`iocs: 共 ${IOCS.length} 条，待插入 ${todo.length} 条`);
  if (todo.length === 0) return;

  const { error: insErr } = await supabase.from("iocs").insert(
    todo.map((i) => ({ ...i, last_seen: new Date().toISOString() }))
  );
  if (insErr) throw new Error(`插入 iocs 失败: ${insErr.message}`);
  console.log(`iocs 插入完成：${todo.length} 条`);
}

(async () => {
  await seedPatterns();
  await seedIocs();

  const [{ count: pc }, { count: ic }] = await Promise.all([
    supabase.from("patterns").select("*", { count: "exact", head: true }),
    supabase.from("iocs").select("*", { count: "exact", head: true }),
  ]);
  console.log(`\n最终：patterns=${pc}  iocs=${ic}`);
})().catch((e) => {
  console.error("种子写入失败:", e);
  process.exit(1);
});
