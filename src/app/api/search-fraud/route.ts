import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/db/supabase';
import { createEmbedding } from '@/lib/rag/embedding';

const supabase = createSupabaseClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputText: string = body.text;
    if(!inputText) return NextResponse.json({error:"缺少输入文本"},{status:400});

    // 真实 embedding（原先这里是 Math.random() 造随机向量，检索结果等于随机排序）
    const queryVec = await createEmbedding(inputText);

    // 余弦相似度检索走数据库函数 match_cases，PostgREST 不支持直接写 embedding <-> $1
    const {data,error} = await supabase.rpc('match_cases', {
      query_embedding: queryVec,
      match_count: 3,
    });

    if(error) throw error;

    return NextResponse.json({
      input: inputText,
      result: data
    });

  } catch(err){
    console.error(err);
    return NextResponse.json({error:"检索失败"},{status:500});
  }
}
