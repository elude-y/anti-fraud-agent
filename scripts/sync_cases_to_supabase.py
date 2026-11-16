# -*- coding: utf-8 -*-
"""把清洗后的 cases-fallback.json 全量同步到 Supabase cases 表（按 content 匹配）。
- PATCH：title / category / risk_label / prevention（与 fallback 不一致才改）
- DELETE：同一 content 的重复行、以及 content 已不在 fallback 里的过期行
用法：
  python scripts/sync_cases_to_supabase.py            # 直接同步
  python scripts/sync_cases_to_supabase.py --dry-run  # 只预览，不写
"""
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

BASE = "https://gebuhmlxrsgzwfphexrz.supabase.co/rest/v1/cases"


def _load_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if val:
        return val
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                m = re.match(rf"^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", line)
                if m:
                    return m.group(1).strip()
    raise SystemExit(f"未找到 {key}（请设置环境变量或 .env.local）")


SERVICE = _load_env("SUPABASE_SERVICE_ROLE_KEY")
KEY = _load_env("NEXT_PUBLIC_SUPABASE_ANON_KEY")
DRY_RUN = "--dry-run" in sys.argv


def request(method, url, payload=None):
    headers = {
        "apikey": SERVICE,
        "Authorization": f"Bearer {SERVICE}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def query(select, limit=2000):
    req = urllib.request.Request(
        f"{BASE}?select={select}&limit={limit}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    fb = json.load(open("src/lib/data/cases-fallback.json", encoding="utf-8"))
    by_content = {}
    for c in fb:
        by_content[(c.get("content") or "").strip()] = c

    rows = query("id,title,category,risk_label,prevention,content")
    print("Supabase cases:", len(rows), "| fallback:", len(fb), "| dry-run:", DRY_RUN)

    groups = defaultdict(list)
    for row in rows:
        groups[(row.get("content") or "").strip()].append(row)

    patched = 0
    deleted = 0
    for content, group in groups.items():
        meta = by_content.get(content)
        if meta is None:
            # 过期行：content 已不在 fallback（被去重/删除）→ 删除
            for row in group:
                print(f"  [DELETE] 过期行 id={row['id']} title={row.get('title','')[:24]}")
                if not DRY_RUN:
                    request("DELETE", f"{BASE}?id=eq.{row['id']}")
                deleted += 1
            continue

        keep, extras = group[0], group[1:]
        patch = {}
        if meta.get("title") != keep.get("title"):
            patch["title"] = meta["title"]
        if meta.get("category") != keep.get("category"):
            patch["category"] = meta["category"]
        if meta.get("riskLabel") != keep.get("risk_label"):
            patch["risk_label"] = meta["riskLabel"]
        if meta.get("prevention") != keep.get("prevention"):
            patch["prevention"] = meta.get("prevention")
        if patch:
            print(f"  [PATCH] id={keep['id']} title={keep.get('title','')[:24]} -> {patch}")
            if not DRY_RUN:
                request("PATCH", f"{BASE}?id=eq.{keep['id']}", patch)
            patched += 1
        for row in extras:
            print(f"  [DELETE] 重复行 id={row['id']} title={row.get('title','')[:24]}")
            if not DRY_RUN:
                request("DELETE", f"{BASE}?id=eq.{row['id']}")
            deleted += 1

    print(f"\n完成: {patched} 条更新, {deleted} 条删除" + ("（预览，未写入）" if DRY_RUN else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("FAILED:", e, file=sys.stderr)
        sys.exit(1)
