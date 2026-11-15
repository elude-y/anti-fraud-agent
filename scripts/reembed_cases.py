# -*- coding: utf-8 -*-
"""把 cases-fallback.json 全部案例重新嵌入，写入 src/lib/rag/data/cases-vectors.json
实现「知识库（球池页）与研判 RAG 共享同一份数据」。
用法：python scripts/reembed_cases.py
"""
import json
import sys
import time
import urllib.request

BASE_URL = "https://api.siliconflow.cn/v1/embeddings"
API_KEY = "REDACTED_SK_KEY"
MODEL = "BAAI/bge-m3"

SRC = "src/lib/data/cases-fallback.json"
DST = "src/lib/rag/data/cases-vectors.json"


def embed(text: str):
    last_err = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                BASE_URL,
                data=json.dumps({"model": MODEL, "input": text}).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {API_KEY}",
                },
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return payload["data"][0]["embedding"]
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"embedding failed: {last_err}")


def main():
    cases = json.load(open(SRC, encoding="utf-8"))
    out = []
    print(f"共 {len(cases)} 条案例，开始嵌入…", flush=True)
    for i, c in enumerate(cases, 1):
        text = f"{c['title']}\n{c.get('content', '')}"
        vec = embed(text)
        out.append({
            "id": c.get("id"),
            "title": c.get("title", ""),
            "category": c.get("category", ""),
            "riskLabel": c.get("riskLabel", "诈骗"),
            "content": c.get("content", ""),
            "source": c.get("source"),
            "embedding": vec,
        })
        print(f"[{i}/{len(cases)}] {c.get('title','')}", flush=True)
        time.sleep(0.15)

    json.dump(out, open(DST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"DONE: 写入 {len(out)} 条 -> {DST}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"FAILED: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
