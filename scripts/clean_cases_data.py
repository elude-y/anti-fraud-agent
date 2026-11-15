# -*- coding: utf-8 -*-
"""清洗 cases-fallback.json：标题截断、补 prevention、风险标签补 4 档、'其他'类重新分类。
用法：python scripts/clean_cases_data.py
"""
import json
import re
import sys

SRC = "src/lib/data/cases-fallback.json"

# 风险标签映射（基于类别，粗略但合理）
HIGH_RISK = {"两卡/跑分洗钱", "冒充公检法", "冒充领导/熟人", "虚假投资理财", "虚拟货币与AI伪造", "贷款/信用服务"}
SUSPICIOUS = {"ETC", "退费", "中奖", "KYC/账户核验", "机票退改签", "网络游戏交易", "医保社保", "养老诈骗"}

# '其他'类重新分类的关键词规则（按优先级）
RECLASSIFY = [
    ("刷单返利", ["刷单", "返利", "兼职", "垫付", "点赞", "做任务", "佣金"]),
    ("冒充客服", ["客服", "退款", "理赔", "会员", "扣费", "误开通"]),
    ("快递理赔", ["快递", "包裹", "物流", "快件"]),
    ("冒充公检法", ["公安", "检察院", "法院", "警官", "涉嫌", "安全账户", "通缉"]),
    ("网络婚恋/交友", ["婚恋", "交友", "杀猪盘", "网恋", "相亲"]),
    ("虚假投资理财", ["投资", "理财", "股票", "基金", "期货", "收益", "高回报"]),
    ("贷款/信用服务", ["贷款", "征信", "解冻", "额度", "利息", "放款"]),
    ("中奖", ["中奖", "奖品", "领奖", "抽奖"]),
    ("退费", ["退费", "学费", "培训", "退款", "退赔"]),
    ("两卡/跑分洗钱", ["跑分", "洗钱", "取现", "两卡", "出租银行卡", "过账"]),
    ("医保社保", ["医保", "社保", "补贴", "津贴"]),
    ("养老诈骗", ["养老", "老人", "保健品", "夕阳红"]),
    ("机票退改签", ["机票", "航班", "退改签", "航空"]),
    ("ETC", ["ETC", "高速", "通行费", "扣费"]),
    ("网络游戏交易", ["游戏", "账号", "装备", "点卡", "皮肤"]),
    ("冒充领导/熟人", ["领导", "熟人", "朋友", "借钱", "急需用钱", "转账"]),
    ("虚拟货币与AI伪造", ["虚拟货币", "USDT", "炒币", "AI换脸", "数字货币", "挖矿"]),
    ("KYC/账户核验", ["KYC", "核验", "认证", "身份验证", "人脸"]),
]

DEFAULT_PREVENTION = "请勿轻信此类信息，不要转账或提供银行卡、验证码，通过官方渠道核实后再操作。"


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    stats = {"title_truncated": 0, "prevention_filled": 0, "reclassified": 0, "relabeled": 0}

    for c in data:
        # 1) 标题截断到 40 字
        title = c.get("title", "")
        if len(title) > 40:
            c["title"] = title[:40] + "…"
            stats["title_truncated"] += 1

        # 2) 补 prevention
        if not c.get("prevention"):
            c["prevention"] = DEFAULT_PREVENTION
            stats["prevention_filled"] += 1

        # 3) '其他'类重新分类
        cat = c.get("category", "")
        if cat in ("其他电信网络诈骗", "其他与求职购物"):
            text = f"{c.get('title','')} {c.get('content','')} {c.get('scriptText','')}"
            for new_cat, kws in RECLASSIFY:
                if any(kw in text for kw in kws):
                    c["category"] = new_cat
                    stats["reclassified"] += 1
                    break

        # 4) 风险标签补 4 档
        rl = c.get("riskLabel")
        if rl == "安全":
            continue
        cat2 = c.get("category", "")
        if cat2 in HIGH_RISK and rl == "诈骗":
            c["riskLabel"] = "高危"
            stats["relabeled"] += 1
        elif cat2 in SUSPICIOUS and rl == "诈骗":
            c["riskLabel"] = "可疑"
            stats["relabeled"] += 1

    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 报告
    print("清洗完成：", stats, flush=True)
    cats = {}
    rls = {}
    for c in data:
        cats[c.get("category", "?")] = cats.get(c.get("category", "?"), 0) + 1
        rls[c.get("riskLabel", "?")] = rls.get(c.get("riskLabel", "?"), 0) + 1
    print("总案例数:", len(data))
    print("类别分布:")
    for k in sorted(cats, key=lambda x: -cats[x]):
        print(f"  {k}: {cats[k]}")
    print("风险标签分布:", rls)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
