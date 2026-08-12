import * as vscode from "vscode";
import { SUPPORTED_LANGUAGE_IDS } from "./core/language-profiles.js";

type PanelCommand = "runTask" | "showAudit";

const COMMANDS: Record<PanelCommand, string> = {
  runTask: "lightningCode.runTask",
  showAudit: "lightningCode.showAudit",
};

function nonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export class LightningSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "lightningCode.panel";

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object" || !("command" in message)) return;
      const command = (message as { command?: string }).command;
      if (!command || !(command in COMMANDS)) return;
      await vscode.commands.executeCommand(COMMANDS[command as PanelCommand]);
    });
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${token}';`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    body { padding:18px 14px; color:var(--vscode-foreground); font-family:var(--vscode-font-family); }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .bolt { color:var(--vscode-textLink-foreground); font-size:28px; line-height:1; }
    h1 { font-size:18px; margin:0; }
    h2 { font-size:12px; text-transform:uppercase; color:var(--vscode-descriptionForeground); margin:20px 0 8px; }
    p { color:var(--vscode-descriptionForeground); line-height:1.45; margin:0 0 18px; }
    button { display:block; width:100%; text-align:left; border:1px solid var(--vscode-button-border, transparent); border-radius:4px;
      padding:9px 10px; margin:8px 0; color:var(--vscode-button-foreground); background:var(--vscode-button-background); cursor:pointer; }
    button:hover { background:var(--vscode-button-hoverBackground); }
    button.secondary { color:var(--vscode-foreground); background:var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background:var(--vscode-button-secondaryHoverBackground); }
    .languages { color:var(--vscode-descriptionForeground); font-size:11px; line-height:1.5; }
    .note { margin-top:18px; padding-top:12px; border-top:1px solid var(--vscode-panel-border); font-size:12px; }
  </style>
</head>
<body>
  <div class="brand"><span class="bolt">ϟ</span><h1>Lightning Code</h1></div>
  <p>Controlled multilingual changes with deterministic validation and reviewable diffs.</p>
  <button data-command="runTask">Run task on current file</button>
  <button class="secondary" data-command="showAudit">Open audit log</button>
  <h2>Language pack</h2>
  <div class="languages">${SUPPORTED_LANGUAGE_IDS.join(" · ")}</div>
  <p class="note">Open a saved file inside the workspace before starting a task.</p>
  <script nonce="${token}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`;
  }
}
