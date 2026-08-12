import * as vscode from "vscode";
import type { ModelClient } from "./core/agent-engine.js";

export class VsCodeModelClient implements ModelClient {
  constructor(private readonly family?: string) {}

  async generate(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
    const selector = this.family ? { family: this.family } : {};
    const models = await vscode.lm.selectChatModels(selector);
    const model = models[0];
    if (!model) throw new Error("Nenhum modelo de linguagem está disponível no VS Code. Instale ou habilite um provedor compatível com a Language Model API.");
    const converted = messages.map((message) => message.role === "assistant"
      ? vscode.LanguageModelChatMessage.Assistant(message.content)
      : vscode.LanguageModelChatMessage.User(message.role === "system" ? `[INSTRUÇÕES DO SISTEMA]\n${message.content}` : message.content));
    const response = await model.sendRequest(converted, {}, new vscode.CancellationTokenSource().token);
    let content = "";
    for await (const fragment of response.text) content += fragment;
    if (!content.trim()) throw new Error("O modelo retornou uma resposta vazia");
    return content;
  }
}
