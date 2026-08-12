import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256, validateChange } from "./gate.js";
import { resolveWorkspacePath, toWorkspaceRelative } from "./path-policy.js";
import { AuditStore, ProposalStore } from "./stores.js";
import type { EngineConfig, ProposalRecord, SupportedLanguage } from "./types.js";

export class WorkspaceService {
  readonly audit: AuditStore;
  private readonly proposals: ProposalStore;
  constructor(private readonly config: EngineConfig) {
    this.audit = new AuditStore(config.workspaceRoot);
    this.proposals = new ProposalStore(config.workspaceRoot);
  }

  async readFile(relativePath: string): Promise<{ path: string; content: string; sha256: string; bytes: number }> {
    const target = await resolveWorkspacePath(this.config.workspaceRoot, relativePath);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("O caminho não aponta para um arquivo");
    if (info.size > this.config.maxFileBytes) throw new Error("Arquivo excede o limite configurado");
    const content = await readFile(target, "utf8");
    return { path: toWorkspaceRelative(this.config.workspaceRoot, target), content, sha256: sha256(content), bytes: info.size };
  }

  async proposeChange(input: { relativePath: string; expectedSha256: string; proposedContent: string; language: SupportedLanguage;
    rationale: string; allowBreakingChanges?: boolean }): Promise<ProposalRecord> {
    const target = await resolveWorkspacePath(this.config.workspaceRoot, input.relativePath);
    const original = await readFile(target, "utf8");
    if (sha256(original) !== input.expectedSha256) throw new Error("O arquivo mudou durante a geração; execute a tarefa novamente");
    const verdict = validateChange(original, input.proposedContent, input.language, {
      maxFileBytes: this.config.maxFileBytes,
      maxChangeRatio: this.config.maxChangeRatio,
      ...(input.allowBreakingChanges ? { allowBreakingChanges: true } : {}),
    });
    const proposal = await this.proposals.create({ relativePath: toWorkspaceRelative(this.config.workspaceRoot, target),
      language: input.language, expectedSha256: input.expectedSha256, proposedContent: input.proposedContent,
      rationale: input.rationale, allowBreakingChanges: input.allowBreakingChanges ?? false, verdict });
    await this.audit.append({ action: "proposal_created", success: verdict.approved, path: proposal.relativePath,
      proposalId: proposal.id, details: { violations: verdict.violations } });
    return proposal;
  }

  async applyProposal(id: string): Promise<ProposalRecord> {
    const proposal = await this.proposals.get(id);
    if (proposal.state !== "pending" || !proposal.verdict.approved) throw new Error("A proposta não está pronta para aplicação");
    if (sha256(proposal.proposedContent) !== proposal.proposedSha256) throw new Error("A proposta armazenada foi adulterada");
    const target = await resolveWorkspacePath(this.config.workspaceRoot, proposal.relativePath);
    const original = await readFile(target, "utf8");
    if (sha256(original) !== proposal.expectedSha256) throw new Error("O arquivo mudou depois da proposta");
    const fresh = validateChange(original, proposal.proposedContent, proposal.language, {
      maxFileBytes: this.config.maxFileBytes, maxChangeRatio: this.config.maxChangeRatio,
      ...(proposal.allowBreakingChanges ? { allowBreakingChanges: true } : {}),
    });
    if (!fresh.approved || fresh.proposedSha256 !== proposal.proposedSha256) throw new Error("A proposta falhou na revalidação");
    const backupDirectory = path.join(this.config.workspaceRoot, ".agent", "backups", proposal.id);
    await mkdir(backupDirectory, { recursive: true });
    await copyFile(target, path.join(backupDirectory, path.basename(target)));
    const temporary = `${target}.${proposal.id}.tmp`;
    await writeFile(temporary, proposal.proposedContent, { encoding: "utf8", mode: (await stat(target)).mode });
    await rename(temporary, target);
    const updated = await this.proposals.markApplied(proposal);
    await this.audit.append({ action: "proposal_applied", success: true, path: proposal.relativePath,
      proposalId: proposal.id, details: { backupDirectory: toWorkspaceRelative(this.config.workspaceRoot, backupDirectory) } });
    return updated;
  }
}
