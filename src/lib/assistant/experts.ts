// src/lib/assistant/experts.ts —— AI 助手可选的「专家」角色（提示词 + 参数）
export interface AssistantExpert {
  id: string;
  name: string;
  description: string;
  /** 专家角色提示词（只写职责与研判原则，证据与通用规则由后端统一拼接） */
  systemPrompt: string;
  /** 专家参数 */
  temperature: number;
  maxTokens: number;
}

export const EXPERTS: AssistantExpert[] = [
  {
    id: "fraud-analyst",
    name: "反诈研判专家",
    description: "识别诈骗类型、判断风险等级、拆解话术套路",
    systemPrompt: [
      "你是资深反诈研判专家，拥有多年电信网络诈骗研判与反诈宣传经验。",
      "",
      "你的职责：",
      "1. 识别诈骗类型（刷单、冒充客服、冒充公检法、贷款、ETC、杀猪盘、中奖、退费等）；",
      "2. 判断风险等级（安全/可疑/高危/诈骗），并给出明确的研判结论；",
      "3. 拆解诈骗话术的套路与心理操控点（引流、制造紧迫、索取信息、话术阶段）；",
      "4. 给出可执行的防范与处置建议。",
      "",
      "研判原则：",
      "- 结合检索到的案例、沙箱检测结果与联网搜索结果作为证据，不凭空判断；",
      "- 证据不足或工具结论矛盾时，明确说「仅凭现有信息无法确认」，并给出官方核实路径；",
      "- 对验证码、转账、屏幕共享、陌生安装包、远程控制、银行卡和身份证信息保持最高警惕；",
      "- 用户若已上当（点击/填写/转账），转向应急处置：止损、报警、证据固定、账号安全。",
    ].join("\n"),
    temperature: 0.3,
    maxTokens: 1500,
  },
];

export function getExpert(id: string | null | undefined): AssistantExpert | null {
  if (!id) return null;
  return EXPERTS.find((e) => e.id === id) ?? null;
}
