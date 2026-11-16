# -*- coding: utf-8 -*-
"""统一案例数据：去重同名、补 prevention、同步 fallback ↔ vectors。
用法：python scripts/unify_cases_data.py
"""
import json
import sys

FALLBACK = "src/lib/data/cases-fallback.json"
VECTORS = "src/lib/rag/data/cases-vectors.json"
DEFAULT_PREVENTION = "请勿轻信此类信息，不要转账或提供银行卡、验证码，通过官方渠道核实后再操作。"


def main():
    fallback = json.load(open(FALLBACK, encoding="utf-8"))
    vectors = json.load(open(VECTORS, encoding="utf-8"))
    stats = {"removed_dups": 0, "renamed": 0, "prevention_filled": 0}

    # 1) 去真重复：同 title + 同 content 只保留第一条
    seen = set()
    clean_fallback = []
    for c in fallback:
        key = (c.get("title", ""), c.get("content", ""))
        if key in seen:
            stats["removed_dups"] += 1
            continue
        seen.add(key)
        clean_fallback.append(c)

    # 2) 标题撞名（不同 content）→ 加（二）（三）后缀
    cnt = {}
    for c in clean_fallback:
        t = c.get("title", "")
        cnt[t] = cnt.get(t, 0) + 1
        if cnt[t] > 1:
            c["title"] = "%s（%d）" % (t, cnt[t])
            stats["renamed"] += 1

    # 3) 补 prevention
    for c in clean_fallback:
        if not c.get("prevention"):
            c["prevention"] = DEFAULT_PREVENTION
            stats["prevention_filled"] += 1

    # 4) 同步 vectors：同样去重 + 按 content 更新 title/prevention/category/riskLabel
    seen_v = set()
    clean_vectors = []
    for v in vectors:
        key = (v.get("title", ""), v.get("content", ""))
        if key in seen_v:
            continue
        seen_v.add(key)
        clean_vectors.append(v)

    # 用 content 作为唯一键，从 fallback 映射新字段
    meta_by_content = {}
    for c in clean_fallback:
        meta_by_content[c.get("content", "")] = c

    matched = 0
    for v in clean_vectors:
        meta = meta_by_content.get(v.get("content", ""))
        if meta is None:
            continue
        matched += 1
        v["title"] = meta.get("title", v.get("title", ""))
        v["category"] = meta.get("category", v.get("category", ""))
        v["riskLabel"] = meta.get("riskLabel", v.get("riskLabel", ""))
        v["prevention"] = meta.get("prevention", DEFAULT_PREVENTION)

    json.dump(clean_fallback, open(FALLBACK, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(clean_vectors, open(VECTORS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print("清洗完成：", stats)
    print("fallback:", len(fallback), "->", len(clean_fallback), "条")
    print("vectors:", len(vectors), "->", len(clean_vectors), "条（匹配更新", matched, "条）")

    # 校验：两边 title 集合一致、无重名
    import collections
    ft = [c.get("title", "") for c in clean_fallback]
    vt = [c.get("title", "") for c in clean_vectors]
    dup_f = {t: n for t, n in collections.Counter(ft).items() if n > 1}
    dup_v = {t: n for t, n in collections.Counter(vt).items() if n > 1}
    miss_p = sum(1 for c in clean_vectors if not c.get("prevention"))
    print("fallback 重名:", len(dup_f), "| vectors 重名:", len(dup_v), "| vectors 缺 prevention:", miss_p)
    print("title 集合一致:", set(ft) == set(vt))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("FAILED:", e, file=sys.stderr)
        sys.exit(1)
