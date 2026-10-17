import { pipeline } from '@xenova/transformers';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;


const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let embedder: any = null;
async function getEmbedding(text: string) {
  if (!embedder) {
    console.log("🔄 正在加载本地BGE-small-zh模型（使用hf镜像），耐心等待...");
    embedder = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
      remoteURLBase: "https://hf-mirror.com"
    });
  }
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function run() {
  console.log("=== 查询embedding为null的记录 ===");
  const { data, error } = await supabase
    .from('cases')
    .select('id, title')
    .is('embedding', null);

  if (error) throw error;
  if (!data || data.length === 0) {
    console.log("✅ 没有待生成向量的数据");
    return;
  }
  console.log(`找到${data.length}条待生成向量的数据`, data);

  for (const row of data) {
    console.log(`\n正在处理：${row.id} | ${row.title}`);
    const vec = await getEmbedding(row.title);
    const { error: updateErr } = await supabase
      .from('cases')
      .update({ embedding: vec })
      .eq('id', row.id);
    if(updateErr) throw updateErr;
    console.log(`✅ ${row.title} 向量写入数据库成功`);
  }
  console.log("\n🎉 全部数据向量处理完成！");
}

run().catch((err)=>{
  console.error("脚本异常：", err);
})
