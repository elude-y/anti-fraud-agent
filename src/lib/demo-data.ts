import type { CaseItem, RiskLevel } from "@/lib/contracts";

export interface HistoryRecord {
  id: string;
  input: string;
  inputType: "链接" | "短信";
  verdict: RiskLevel;
  confidence: number;
  summary: string;
  evidenceCount: number;
  createdAt: string;
  source: string;
  snapshotId?: string;
  /** 记录性质：测试（内置演示） / 真实（用户实际检测） */
  kind?: "测试" | "真实";
}

export const demoCases: CaseItem[] = [
  {
    id: "CASE-2026-1048",
    title: "快递破损理赔仿冒页",
    category: "快递理赔",
    riskLabel: "诈骗",
    content: "以包裹破损理赔为由，引导用户进入仿冒物流页面并填写银行卡号、验证码。页面包含隐藏 iframe 与表单外发脚本。",
    source: "石泉县公安局反诈警示录",
    sourceUrl: "https://www.shiquan.gov.cn/Content-2646883.html",
    publishedAt: "2023-11-27",
    prevention: "退款应在原购物平台内发起；不要向所谓客服提供银行卡号、验证码，也不要按对方要求贷款或转账。",
  },
  {
    id: "CASE-2026-1013",
    title: "ETC 账户停用短信",
    category: "ETC 通知",
    riskLabel: "高危",
    content: "使用即将停用、逾期冻结等紧迫话术，诱导车主访问非官方域名完成所谓身份认证。",
    source: "深圳市公安局涉车短信诈骗案例",
    sourceUrl: "https://ga.sz.gov.cn/gkmlpt/content/10/10661/post_10661328.html",
    publishedAt: "2023-06-20",
    prevention: "不要点击陌生短信中的 ETC 或交通违章链接，应通过官方小程序、App 或线下网点核验。",
  },
  {
    id: "CASE-2026-0987",
    title: "电商平台冒充客服退款",
    category: "冒充客服",
    riskLabel: "诈骗",
    content: "冒充平台客服声称订单异常，要求添加私人联系方式并开启屏幕共享，引导用户转账。",
    source: "福建省公安厅冒充客服退款案例",
    sourceUrl: "https://gat.fujian.gov.cn/ztzl/fjjffpzxrx/dxal/201911/t20191129_5142091.htm",
    publishedAt: "2019-11-29",
    prevention: "不要扫描陌生二维码或打开来历不明的退款链接，不要提供身份证号、银行卡账号和验证码。",
  },
  {
    id: "CASE-2026-0941",
    title: "银行卡安全认证页面",
    category: "银行认证",
    riskLabel: "高危",
    content: "仿冒银行视觉与登录流程，采集身份证号、银行卡密码、短信验证码等敏感字段。",
    source: "官方反诈公开案例归纳",
    prevention: "银行不会通过陌生链接索取银行卡密码或短信验证码；账户问题应直接联系银行官方客服。",
  },
  {
    id: "CASE-2026-0892",
    title: "虚假中奖活动通知",
    category: "中奖活动",
    riskLabel: "可疑",
    content: "以手机、购物卡等奖品吸引点击，随后要求支付保证金或填写个人身份信息。",
    source: "广州市司法局电诈典型案例",
    sourceUrl: "https://sfj.gz.gov.cn/gzssfj/flfw/pf/yasf/content/post_9245853.html",
    publishedAt: "2023-09-27",
    prevention: "凡是以领奖为由要求先交保证金、税费或手续费的，都应停止操作并通过官方渠道核实。",
  },
  {
    id: "CASE-2026-0826",
    title: "官方政务服务域名",
    category: "正常服务",
    riskLabel: "安全",
    content: "域名、证书与备案主体一致，不包含敏感表单外发或异常跳转行为。",
    source: "中国政府网",
    sourceUrl: "https://www.gov.cn/",
    prevention: "确认地址栏主机名属于 gov.cn；不要仅凭页面外观判断真伪。",
  },
  {
    id: "SAFE-2026-0002",
    title: "国家中小学智慧教育平台官方域名",
    category: "正常服务",
    riskLabel: "安全",
    content: "basic.smartedu.cn 属于国家智慧教育公共服务平台官方域名，离线白名单只核验域名，不模拟远程页面截图。",
    source: "国家中小学智慧教育平台",
    sourceUrl: "https://basic.smartedu.cn/",
    prevention: "核对主机名是否以 smartedu.cn 结尾，警惕名称相似但域名不同的仿冒站点。",
  },
  {
    id: "SAFE-2026-0003",
    title: "GNU Compiler Collection 官方网站",
    category: "正常服务",
    riskLabel: "安全",
    content: "gcc.gnu.org 是 GNU Compiler Collection 官方网站。离线模式只做可信域名核验，不会伪造网站截图。",
    source: "GNU Project",
    sourceUrl: "https://gcc.gnu.org/",
    prevention: "下载编译器时优先使用 GNU 官方站点或可信发行版软件源，并核对域名与校验信息。",
  },
];

export const seedHistory: HistoryRecord[] = [
  {
    id: "AG-261016-0921",
    input: "https://claim-express.example.cn/refund",
    inputType: "链接",
    verdict: "诈骗",
    confidence: 0.94,
    summary: "仿冒快递理赔页面，命中银行卡与验证码采集行为",
    evidenceCount: 8,
    createdAt: "2026-10-16 09:21",
    source: "Tier0 + IOC",
  },
  {
    id: "AG-261015-1846",
    input: "【ETC】您的账户将在今晚停用，请完成认证……",
    inputType: "短信",
    verdict: "高危",
    confidence: 0.89,
    summary: "命中 ETC 停用紧迫话术与非官方认证域名",
    evidenceCount: 6,
    createdAt: "2026-10-15 18:46",
    source: "案例库 + Tier0",
  },
  {
    id: "AG-261015-1432",
    input: "https://www.gov.cn/zhengce/",
    inputType: "链接",
    verdict: "安全",
    confidence: 0.97,
    summary: "官方域名，未发现异常跳转、敏感表单或恶意脚本",
    evidenceCount: 4,
    createdAt: "2026-10-15 14:32",
    source: "白名单 + IOC",
  },
  {
    id: "AG-261014-2218",
    input: "客服称订单异常，需要添加好友处理退款",
    inputType: "短信",
    verdict: "可疑",
    confidence: 0.78,
    summary: "命中冒充客服退款话术，尚未提取到可验证链接",
    evidenceCount: 5,
    createdAt: "2026-10-14 22:18",
    source: "案例库",
  },
];

export const categoryStats = [
  { label: "冒充客服", value: 31, color: "#3478ef" },
  { label: "快递理赔", value: 24, color: "#5d90f5" },
  { label: "ETC 通知", value: 18, color: "#82a9f7" },
  { label: "银行认证", value: 15, color: "#a7c2f8" },
  { label: "其他类型", value: 12, color: "#cfddf8" },
];

export const trendData = [38, 52, 47, 65, 58, 76, 72, 89, 83, 101, 96, 118];
