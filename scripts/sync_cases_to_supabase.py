# -*- coding: utf-8 -*-
"""把清洗后的 cases-fallback.json 的 category/risk_label/title/prevention 同步到 Supabase cases 表。"""
import json
import os
import re
import sys
import urllib.request

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


def query(select, limit=2000):
    req = urllib.request.Request(f"{BASE}?select={select}&limit={limit}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    fb = json.load(open("src/lib/data/cases-fallback.json", encoding="utf-8"))
    # 用 title 建映射（id 在 31 条旧案例上不一致，标题更稳）
    by_title = {}
    for c in fb:
        by_title[c.get("title", "").strip()] = c

    rows = query("id,title,category,risk_label,prevention")
    print("Supabase cases:", len(rows))

    patched = 0
    for row in rows:
        c = by_title.get((row.get("title") or "").strip())
        if not c:
            continue
        patch = {}
        if c.get("category") != row.get("category"):
            patch["category"] = c["category"]
        if c.get("riskLabel") != row.get("risk_label"):
            patch["risk_label"] = c["riskLabel"]
        if c.get("prevention") != row.get("prevention"):
            patch["prevention"] = c.get("prevention")
        if not patch:
            continue
        req = urllib.request.Request(
            f"{BASE}?id=eq.{row['id']}",
            data=json.dumps(patch).encode("utf-8"),
            headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json", "Prefer": "return=minimal"},
            method="PATCH",
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        patched += 1

    print(f"Supabase 同步完成: {patched} 条更新")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
