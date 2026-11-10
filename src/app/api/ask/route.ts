import { NextResponse } from "next/server";
import { z } from "zod";
import { demoCases } from "@/lib/demo-data";
import { rag_search } from "@/lib/rag/retrieve";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(200),
});

function questionMatchScore(question: string, category: string, similarity: number) {
  let score = similarity;
  if (/客服|退款|订单|验证码/.test(question) && /冒充客服|快递理赔/.test(category)) score += 0.3;
  if (/快递|包裹|物流/.test(question) && /快递理赔/.test(category)) score += 0.35;
  if (/ETC|高速|通行/.test(question) && /ETC/.test(category)) score += 0.35;
  if (/刷单|返利|垫付|兼职/.test(question) && /刷单/.test(category)) score += 0.35;
  if (/贷款|征信|解冻金/.test(question) && /贷款/.test(category)) score += 0.35;
  if (/中奖|奖品|保证金/.test(question) && /中奖/.test(category)) score += 0.35;
  return score;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体必须是有效 JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "请输入 2 至 200 字的问题" }, { status: 400 });
  }

  const result = await rag_search(parsed.data.question);
  const rankedMatches = [...result.matches].sort((left, right) =>
    questionMatchScore(parsed.data.question, right.category, right.similarity)
      - questionMatchScore(parsed.data.question, left.category, left.similarity));
  const references = rankedMatches.slice(0, 3).map((match) => {
    const bundled = demoCases.find((item) => item.id === match.caseId);
    return {
      caseId: match.caseId,
      title: match.title,
      category: match.category,
      riskLabel: match.riskLabel,
      source: match.source,
      sourceUrl: bundled?.sourceUrl,
    };
  });
  const top = rankedMatches[0];

  if (!top) {
    return NextResponse.json({
      answer: "案例库暂未找到足够相关的公开案例。请补充对方身份、具体话术、链接或要求提供的信息，再重新提问。",
      references: [],
    });
  }

  const action = top.riskLabel === "安全"
    ? "当前案例证据更接近正常服务，但仍应核对完整域名并从官方入口访问。"
    : "不要点击陌生链接、提供验证码或转账；请通过官方 App、官网或客服电话独立核实。";
  const answer = `案例库中最相关的是“${top.title}”，归类为${top.category}，风险标签为“${top.riskLabel}”。${top.content}${action}`;

  return NextResponse.json({ answer, references });
}
