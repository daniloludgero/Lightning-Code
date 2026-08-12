import { validateChange } from "./gate.js";
import type { GateVerdict, SupportedLanguage } from "./types.js";

export interface ModelClient {
  generate(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string>;
}

export interface AgentResult {
  status: "approved" | "rejected";
  proposedContent?: string;
  verdict?: GateVerdict;
  attempts: number;
}

export function normalizeModelCode(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:[\w.+-]+)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  return (fenced?.[1] ?? trimmed).replace(/\r\n/g, "\n");
}

export class AgentEngine {
  constructor(private readonly client: ModelClient, private readonly options: { maxRetries: number; maxFileBytes: number; maxChangeRatio: number }) {}

  async run(task: string, relativePath: string, original: string, language: SupportedLanguage): Promise<AgentResult> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: "Você é o motor de edição do Lightning Code. Preserve o comportamento não relacionado à tarefa. Responda somente com o conteúdo completo do arquivo, sem cercas Markdown." },
      { role: "user", content: `Tarefa: ${task}\nArquivo: ${relativePath}\nLinguagem: ${language}\n\n--- CONTEÚDO ATUAL ---\n${original}` },
    ];
    let lastVerdict: GateVerdict | undefined;
    for (let attempts = 1; attempts <= this.options.maxRetries; attempts++) {
      const proposedContent = normalizeModelCode(await this.client.generate(messages));
      lastVerdict = validateChange(original, proposedContent, language, this.options);
      if (lastVerdict.approved) return { status: "approved", proposedContent, verdict: lastVerdict, attempts };
      messages.push({ role: "assistant", content: proposedContent });
      messages.push({ role: "user", content: `A proposta foi rejeitada. Corrija somente estes problemas e devolva novamente o arquivo completo:\n${lastVerdict.violations.map((v) => `- ${v.code}: ${v.message}`).join("\n")}` });
    }
    return { status: "rejected", ...(lastVerdict ? { verdict: lastVerdict } : {}), attempts: this.options.maxRetries };
  }
}
