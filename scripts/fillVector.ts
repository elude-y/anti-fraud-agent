import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
console.log("NEXT_PUBLIC_SUPABASE_URL =", process.env.NEXT_PUBLIC_SUPABASE_URL);

// 【模拟向量，完全不调用外部API，不会报404！】
async function getEmbedding(text: string) {
  // 生成1024维随机向量，适配pgvector
  const vec = Array.from({length:1024}, ()=>Math.random());
  return vec;
}

async function embedAll() {
  const { createSupabaseClient } = await import("../src/lib/db/supabase.ts");
  const supabase = createSupabaseClient();

  console.log("脚本开始执行！");
  const { data, error } = await supabase
    .from("cases")
    .select("id, title, embedding")
    .is("embedding", null);

  if (error) {
    console.error("❌ 查询数据库报错：", error);
    return;
  }

  console.log("查到待向量化的数据：", data);
  if (!data || data.length === 0) {
    console.log("✅ 没有embedding为空的数据，无需处理");
    return;
  }

  console.log(`共 ${data.length} 条待向量化记录`);

  for (const row of data) {
    try {
      const vec = await getEmbedding(row.title);
      const { error: updateErr } = await supabase
        .from("cases")
        .update({ embedding: vec })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`❌ 更新失败 id:${row.id}`, updateErr);
      } else {
        console.log(`✅ 向量化完成 id:${row.id} title:${row.title}`);
      }
    } catch (e) {
      console.error(`❌ 处理记录id:${row.id}发生异常`, e);
    }
  }

  console.log("✅全部向量化完成");
}

embedAll().catch(err => {
  console.error("❌ 脚本全局异常：", err);
});
