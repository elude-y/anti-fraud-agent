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
}

export const demoCases: CaseItem[] = [
  {
    id: "CASE-2026-1048",
    title: "快递破损理赔仿冒页",
    category: "快递理赔",
    riskLabel: "诈骗",
    content: "以包裹破损理赔为由，引导用户进入仿冒物流页面并填写银行卡号、验证码。页面包含隐藏 iframe 与表单外发脚本。",
    source: "国家反诈中心公开案例整理",
  },
  {
    id: "CASE-2026-1013",
    title: "ETC 账户停用短信",
    category: "ETC 通知",
    riskLabel: "高危",
    content: "使用即将停用、逾期冻结等紧迫话术，诱导车主访问非官方域名完成所谓身份认证。",
    source: "运营商涉诈短信样本",
  },
  {
    id: "CASE-2026-0987",
    title: "电商平台冒充客服退款",
    category: "冒充客服",
    riskLabel: "诈骗",
    content: "冒充平台客服声称订单异常，要求添加私人联系方式并开启屏幕共享，引导用户转账。",
    source: "平台风控共享样本",
  },
  {
    id: "CASE-2026-0941",
    title: "银行卡安全认证页面",
    category: "银行认证",
    riskLabel: "高危",
    content: "仿冒银行视觉与登录流程，采集身份证号、银行卡密码、短信验证码等敏感字段。",
    source: "金融反诈联防样本",
  },
  {
    id: "CASE-2026-0892",
    title: "虚假中奖活动通知",
    category: "中奖活动",
    riskLabel: "可疑",
    content: "以手机、购物卡等奖品吸引点击，随后要求支付保证金或填写个人身份信息。",
    source: "互联网举报样本",
  },
  {
    id: "CASE-2026-0826",
    title: "官方政务服务域名",
    category: "正常服务",
    riskLabel: "安全",
    content: "域名、证书与备案主体一致，不包含敏感表单外发或异常跳转行为。",
    source: "白名单基准样本",
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
