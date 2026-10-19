import type { RagMatch } from "@/lib/contracts";
/**
 * 文档三个信号：
 * topSimilarity：top‑1最大相似度
 * labelAgreement：风险标签一致性，匹配集合风险标签相同占比
 * coverageScore：检索案例类别与输入文本类别覆盖度，简易实现
 */
export function calcSignals(matches: RagMatch[]) {
  if(matches.length ===0){
    return { topSimilarity:0, labelAgreement:0, coverageScore:0 };
  }
  // topSimilarity：最高分
  const topSimilarity = matches[0].similarity;

  // labelAgreement：多数标签的占比
  const labelCount:Record<string,number> = {};
  matches.forEach(m=>{
    labelCount[m.riskLabel] = (labelCount[m.riskLabel]||0)+1;
  });
  const maxCnt = Math.max(...Object.values(labelCount));
  const labelAgreement = maxCnt / matches.length;
  // coverageScore：类别简单覆盖率，非0即有命中类别
  const catSet = new Set(matches.map(m=>m.category));
  const coverageScore = Math.min(1, catSet.size / 3);
  return {
    topSimilarity,
    labelAgreement,
    coverageScore
  };
}
