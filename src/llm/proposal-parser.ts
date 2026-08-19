import { z } from "zod";

const llmOptionSchema = z.object({
  items: z.array(z.object({
    garmentId: z.string().min(1),
    role: z.string().trim().min(1).max(100),
  })).min(1),
  rationale: z.string().trim().min(1).max(3_000),
  cautions: z.array(z.string().trim().min(1).max(1_000)),
});

export const llmProposalSchema = z.object({
  options: z.array(llmOptionSchema).length(3),
});

export type LlmProposal = z.infer<typeof llmProposalSchema>;

export class InvalidLlmProposalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidLlmProposalError";
  }
}

/** Claude CLI の標準出力から JSON 部分を取り出し、提案契約を検証する。 */
export function parseLlmProposal(output: string): LlmProposal {
  const jsonText = extractJson(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new InvalidLlmProposalError("Claude CLI の応答に有効な JSON がありません。");
  }
  const result = llmProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidLlmProposalError("Claude CLI の提案形式が期待したスキーマと一致しません。");
  }
  return result.data;
}

function extractJson(output: string): string {
  const withoutFence = output
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new InvalidLlmProposalError("Claude CLI の応答に JSON オブジェクトがありません。");
  }
  return withoutFence.slice(firstBrace, lastBrace + 1);
}
