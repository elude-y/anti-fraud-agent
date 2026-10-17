import type { RagSearchResult } from "./retrieve";

/** LLM重排占位，后续接入大模型，当前原样返回 */
export async function rerank(_query:string, res:RagSearchResult):Promise<RagSearchResult>{
  // 此处可调用LLM对matches重新打分排序
  return res;
}
