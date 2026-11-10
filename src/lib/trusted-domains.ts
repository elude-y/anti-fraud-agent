export interface TrustedDomain {
  hostname: string;
  label: string;
  source: string;
}

const trustedDomains = [
  // 政务 / 官方
  { hostname: "gov.cn", label: "中国政府机构域名", source: "中国政府网域名体系" },
  { hostname: "12321.cn", label: "12321 网络不良与垃圾信息举报受理中心", source: "12321 官方域名" },
  { hostname: "smartedu.cn", label: "国家智慧教育公共服务平台", source: "国家智慧教育公共服务平台官方域名" },
  { hostname: "12306.cn", label: "中国铁路 12306", source: "国铁集团官方域名" },
  { hostname: "chsi.com.cn", label: "中国高等教育学生信息网（学信网）", source: "教育部官方域名" },
  // 银行
  { hostname: "icbc.com.cn", label: "中国工商银行", source: "工商银行官方域名" },
  { hostname: "ccb.com", label: "中国建设银行", source: "建设银行官方域名" },
  { hostname: "boc.cn", label: "中国银行", source: "中国银行官方域名" },
  { hostname: "abchina.com", label: "中国农业银行", source: "农业银行官方域名" },
  { hostname: "cmbchina.com", label: "招商银行", source: "招商银行官方域名" },
  // 电商 / 支付
  { hostname: "taobao.com", label: "淘宝", source: "阿里巴巴官方域名" },
  { hostname: "tmall.com", label: "天猫", source: "阿里巴巴官方域名" },
  { hostname: "jd.com", label: "京东", source: "京东官方域名" },
  { hostname: "alipay.com", label: "支付宝", source: "蚂蚁集团官方域名" },
  { hostname: "amazon.cn", label: "亚马逊中国", source: "亚马逊官方域名" },
  { hostname: "meituan.com", label: "美团", source: "美团官方域名" },
  { hostname: "dianping.com", label: "大众点评", source: "美团官方域名" },
  { hostname: "ctrip.com", label: "携程旅行", source: "携程官方域名" },
  { hostname: "qunar.com", label: "去哪儿旅行", source: "去哪儿官方域名" },
  // 内容 / 社区 / 技术
  { hostname: "github.com", label: "GitHub", source: "GitHub 官方域名" },
  { hostname: "bilibili.com", label: "哔哩哔哩", source: "B站官方域名" },
  { hostname: "zhihu.com", label: "知乎", source: "知乎官方域名" },
  { hostname: "weibo.com", label: "微博", source: "微博官方域名" },
  { hostname: "qq.com", label: "腾讯网", source: "腾讯官方域名" },
  { hostname: "163.com", label: "网易", source: "网易官方域名" },
  { hostname: "sina.com.cn", label: "新浪网", source: "新浪官方域名" },
  { hostname: "baidu.com", label: "百度", source: "百度官方域名" },
  // 新闻 / 媒体
  { hostname: "people.com.cn", label: "人民网", source: "人民日报官方域名" },
  { hostname: "xinhuanet.com", label: "新华网", source: "新华社官方域名" },
  { hostname: "cctv.com", label: "央视网", source: "中央电视台官方域名" },
  { hostname: "gcc.gnu.org", label: "GNU Compiler Collection 官方网站", source: "GNU 官方域名" },
] as const;

function matchesHostname(hostname: string, trustedHostname: string) {
  return hostname === trustedHostname || hostname.endsWith(`.${trustedHostname}`);
}

export function getTrustedDomain(input: URL | string | null | undefined): TrustedDomain | null {
  if (!input) return null;

  try {
    const hostname = (input instanceof URL ? input.hostname : new URL(input).hostname)
      .toLowerCase()
      .replace(/\.$/, "");
    const match = trustedDomains.find((item) => matchesHostname(hostname, item.hostname));
    return match ? { hostname, label: match.label, source: match.source } : null;
  } catch {
    return null;
  }
}
