import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256 } from "../src/core/gate.js";
import { resolveWorkspacePath } from "../src/core/path-policy.js";
import { WorkspaceService } from "../src/core/workspace-service.js";

test("bloqueia fuga e arquivos sensíveis", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lightning-path-"));
  try {
    await assert.rejects(resolveWorkspacePath(root, "../secret"), /política/);
    await assert.rejects(resolveWorkspacePath(root, ".env"), /política/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cria, revalida, aplica proposta e mantém backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lightning-workspace-"));
  try {
    await mkdir(path.join(root, "src"));
    const target = path.join(root, "src", "value.ts");
    const original = "export const value = 1;\n";
    const proposed = "export const value = 2;\n";
    await writeFile(target, original);
    const service = new WorkspaceService({ workspaceRoot: root, maxFileBytes: 10_000, maxChangeRatio: 1 });
    const proposal = await service.proposeChange({ relativePath: "src/value.ts", expectedSha256: sha256(original), proposedContent: proposed,
      language: "typescript", rationale: "teste" });
    assert.equal(proposal.verdict.approved, true);
    const applied = await service.applyProposal(proposal.id);
    assert.equal(applied.state, "applied");
    assert.equal(await readFile(target, "utf8"), proposed);
    assert.equal(await readFile(path.join(root, ".agent", "backups", proposal.id, "value.ts"), "utf8"), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recusa aplicação quando o arquivo mudou", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lightning-conflict-"));
  try {
    const target = path.join(root, "value.ts");
    const original = "export const value = 1;\n";
    await writeFile(target, original);
    const service = new WorkspaceService({ workspaceRoot: root, maxFileBytes: 10_000, maxChangeRatio: 1 });
    const proposal = await service.proposeChange({ relativePath: "value.ts", expectedSha256: sha256(original),
      proposedContent: "export const value = 2;\n", language: "typescript", rationale: "teste" });
    await writeFile(target, "export const value = 3;\n");
    await assert.rejects(service.applyProposal(proposal.id), /mudou/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
