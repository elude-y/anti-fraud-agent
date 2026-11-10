export async function createEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error("缺失Embedding环境变量，请检查.env.local");
  }

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
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`embedding接口调用失败: ${errText}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}
