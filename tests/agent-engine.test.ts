import assert from "node:assert/strict";
import test from "node:test";
import { AgentEngine, normalizeModelCode, type ModelClient } from "../src/core/agent-engine.js";

class SequenceClient implements ModelClient {
  readonly calls: Array<Array<{ role: "system" | "user" | "assistant"; content: string }>> = [];
  constructor(private readonly responses: string[]) {}
  async generate(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
    this.calls.push([...messages]);
    return this.responses[this.calls.length - 1] ?? "";
  }
}

test("normaliza uma resposta cercada por Markdown", () => {
  assert.equal(normalizeModelCode("```ts\nexport const x = 1;\n```"), "export const x = 1;");
});

test("autocorrige após o gate rejeitar a primeira proposta", async () => {
  const client = new SequenceClient(["", "export const value = 2;\n"]);
  const engine = new AgentEngine(client, { maxRetries: 2, maxFileBytes: 10_000, maxChangeRatio: 1 });
  const result = await engine.run("mude o valor", "src/a.ts", "export const value = 1;\n", "typescript");
  assert.equal(result.status, "approved");
  assert.equal(result.attempts, 2);
  assert.match(client.calls[1]?.at(-1)?.content ?? "", /empty_file/);
});

test("encerra depois do limite de tentativas", async () => {
  const client = new SequenceClient(["", ""]);
  const engine = new AgentEngine(client, { maxRetries: 2, maxFileBytes: 10_000, maxChangeRatio: 1 });
  const result = await engine.run("quebre", "src/a.ts", "export const value = 1;\n", "typescript");
  assert.equal(result.status, "rejected");
  assert.equal(result.attempts, 2);
});
