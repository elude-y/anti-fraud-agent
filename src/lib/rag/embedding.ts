import { recordProviderRequest } from "@/lib/agent/provider-usage";

export async function createEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error("缺失Embedding环境变量，请检查.env.local");
  }

  const recordUsage = recordProviderRequest("embedding");
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      input: text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`embedding接口调用失败: ${errText}`);
  }
  const json = await res.json();
  recordUsage(json.usage);
  return json.data[0].embedding;
}
