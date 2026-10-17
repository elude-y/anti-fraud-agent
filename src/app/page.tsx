"use client";
import { useState } from "react";

type MatchItem = {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  similarity: number;
};

type SearchResult = {
  matches: MatchItem[];
  topSimilarity: number;
  labelAgreement: number;
  coverageScore: number;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analyze/rag_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK: 3 }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      alert("检索失败，请检查后端接口");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl text-red-600 font-bold">校园反诈宣传平台</h1>
      <hr className="my-4" />

      <section>
        <h2 className="text-2xl font-semibold">什么是电信网络诈骗?</h2>
        <p className="my-3">
          电信网络诈骗，是不法分子借助网络、电话等渠道，编造虚假信息，设置骗局，骗取受害人钱财的违法犯罪行为。大学生是电信诈骗高发受害群体。
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-2xl font-semibold">常见校园诈骗类型</h2>
        <ul className="list-disc pl-8 my-3">
          <li>刷单返利诈骗：先小额返利，后大额骗钱</li>
          <li>冒充客服退款诈骗：谎称订单异常，诱导转账</li>
          <li>冒充公检法：恐吓涉嫌犯罪，要求资金清查</li>
          <li>网贷、校园贷：低息贷款，索要保证金</li>
          <li>游戏交易、虚假兼职：虚假交易骗取账号与资金</li>
        </ul>
      </section>

      <section className="my-6">
        <h2 className="text-2xl font-semibold text-red-600">反诈口诀</h2>
        <p className="text-xl my-2">不轻信、不透露、不转账，遇疑问拨打96110反诈专线!</p>
      </section>

      {/* ===== RAG检索区域（新增）===== */}
      <div className="border-2 border-gray-200 p-6 rounded-xl mt-10">
        <h2 className="text-xl font-bold mb-4">🔍 诈骗案例智能检索</h2>
        <textarea
          className="w-full border p-3 rounded"
          placeholder="描述你遇到的诈骗场景，例如：有人说刷单可以返利..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading ? "检索中..." : "检索相似案例"}
        </button>

        {result && (
          <div className="mt-6">
            <h3 className="font-bold text-lg">检索结果</h3>
            <div className="flex gap-4 my-2">
              <span>最高相似度：{result.topSimilarity}</span>
              <span>标签一致性：{result.labelAgreement}</span>
              <span>覆盖度：{result.coverageScore}</span>
            </div>
            {result.matches.map((item) => (
              <div key={item.id} className="border p-4 my-3 rounded">
                <h4 className="font-bold">{item.title}</h4>
                <p>类型：{item.category}｜相似度：{item.similarity}</p>
                <p className="mt-2">{item.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
