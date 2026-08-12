import path from "node:path";
import * as vscode from "vscode";
import { AgentEngine } from "./core/agent-engine.js";
import { resolveLanguage } from "./core/language-profiles.js";
import { WorkspaceService } from "./core/workspace-service.js";
import { LightningSidebarProvider } from "./sidebar-provider.js";
import { VsCodeModelClient } from "./vscode-model-client.js";

let output: vscode.OutputChannel;

function configuration() {
  const config = vscode.workspace.getConfiguration("lightningCode");
  return {
    maxChangeRatio: config.get<number>("maxChangeRatio", 0.6),
    maxFileBytes: config.get<number>("maxFileBytes", 1_048_576),
    maxRetries: config.get<number>("maxRetries", 2),
    modelFamily: config.get<string>("modelFamily", "").trim(),
  };
}

function activeWorkspace(): { folder: vscode.WorkspaceFolder; document: vscode.TextDocument } {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.isUntitled) throw new Error("Open a saved file inside a workspace first.");
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) throw new Error("The active file does not belong to an open workspace.");
  return { folder, document };
}

async function runTask(): Promise<void> {
  const { folder, document } = activeWorkspace();
  if (document.isDirty && !await document.save()) throw new Error("Save the active file before running a task.");
  const task = await vscode.window.showInputBox({
    title: "Lightning Code",
    prompt: "What should change in the current file?",
    ignoreFocusOut: true,
  });
  if (!task?.trim()) return;

  const config = configuration();
  const root = folder.uri.fsPath;
  const relativePath = path.relative(root, document.uri.fsPath).replaceAll("\\", "/");
  const language = resolveLanguage(document.languageId);
  const service = new WorkspaceService({
    workspaceRoot: root,
    maxFileBytes: config.maxFileBytes,
    maxChangeRatio: config.maxChangeRatio,
  });
  const current = await service.readFile(relativePath);
  const engine = new AgentEngine(new VsCodeModelClient(config.modelFamily || undefined), config);
  const result = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Lightning Code is preparing and validating a ${language} change…`,
    cancellable: false,
  }, () => engine.run(task.trim(), relativePath, current.content, language));

  if (result.status !== "approved" || !result.proposedContent || !result.verdict) {
    const reason = result.verdict?.violations.map((item) => item.message).join("; ") ?? "no valid proposal";
    throw new Error(`The gate rejected the change after ${result.attempts} attempt(s): ${reason}`);
  }

  const proposal = await service.proposeChange({
    relativePath,
    expectedSha256: current.sha256,
    proposedContent: result.proposedContent,
    language,
    rationale: task.trim(),
  });
  const preview = await vscode.workspace.openTextDocument({ content: proposal.proposedContent, language: document.languageId });
  await vscode.commands.executeCommand("vscode.diff", document.uri, preview.uri, `Lightning Code — ${relativePath}`);
  const action = await vscode.window.showInformationMessage(
    `The gate approved this proposal (${(proposal.verdict.changedLineRatio * 100).toFixed(1)}% changed). Apply it?`,
    { modal: true, detail: `Task: ${task}\nLightning Code will create a backup under .agent/backups.` },
    "Apply",
  );
  if (action !== "Apply") return;
  await service.applyProposal(proposal.id);
  await vscode.window.showInformationMessage("Lightning Code applied the change and created a local backup.");
}

async function showAudit(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a workspace before viewing its audit log.");
  const uri = vscode.Uri.file(path.join(folder.uri.fsPath, ".agent", "audit.jsonl"));
  try {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  } catch {
    void vscode.window.showInformationMessage("This workspace does not have audit events yet.");
  }
}

function guarded(command: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await command();
    } catch (error) {
      output.appendLine(String(error));
      output.show(true);
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Lightning Code");
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(LightningSidebarProvider.viewType, new LightningSidebarProvider()),
    vscode.commands.registerCommand("lightningCode.runTask", guarded(runTask)),
    vscode.commands.registerCommand("lightningCode.showAudit", guarded(showAudit)),
  );
}

export function deactivate(): void {}
