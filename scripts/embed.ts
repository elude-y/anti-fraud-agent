import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 指向项目根目录下 .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") });
import { createSupabaseClient } from "../src/lib/db/supabase";
import { createEmbedding } from "../src/lib/rag/embedding";

async function main() {
  const supabase = createSupabaseClient();
  console.log("读取还未生成向量的案例...");
  // 取出embedding为空的记录
  const { data: cases, error } = await supabase
    .from("cases")
    .select("id, title, content")
    .is("embedding", null);

  if (error) throw error;
  if (!cases || cases.length === 0) {
    console.log("所有案例向量已生成，无需处理");
    return;
  }
  console.log(`待处理案例数量：${cases.length}`);

  for (const item of cases) {
    // 拼接标题+正文作为向量化文本
    const text = `${item.title}\n${item.content}`;
    const vec = await createEmbedding(text);
    // 更新向量到数据库
    const { error: updateErr } = await supabase
      .from("cases")
      .update({ embedding: vec })
      .eq("id", item.id);
    if(updateErr){
      console.error(`id:${item.id} 更新失败`, updateErr);
      continue;
    }
    console.log(`✅ ${item.title} 向量写入成功`);
  }
  console.log("全部向量生成任务结束");
}

main().catch(console.error);
