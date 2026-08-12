import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEvent, GateVerdict, ProposalRecord, SupportedLanguage } from "./types.js";

export class ProposalStore {
  private readonly directory: string;
  constructor(workspaceRoot: string) { this.directory = path.join(workspaceRoot, ".agent", "proposals"); }

  async create(input: { relativePath: string; language: SupportedLanguage; expectedSha256: string; proposedContent: string;
    rationale: string; allowBreakingChanges: boolean; verdict: GateVerdict }): Promise<ProposalRecord> {
    await mkdir(this.directory, { recursive: true });
    const record: ProposalRecord = { id: randomUUID(), relativePath: input.relativePath, language: input.language,
      expectedSha256: input.expectedSha256, proposedSha256: input.verdict.proposedSha256, proposedContent: input.proposedContent,
      rationale: input.rationale, allowBreakingChanges: input.allowBreakingChanges, createdAt: new Date().toISOString(),
      verdict: input.verdict, state: "pending" };
    await this.write(record);
    return record;
  }

  async get(id: string): Promise<ProposalRecord> {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("ID de proposta inválido");
    return JSON.parse(await readFile(path.join(this.directory, `${id}.json`), "utf8")) as ProposalRecord;
  }

  async markApplied(record: ProposalRecord): Promise<ProposalRecord> {
    const updated: ProposalRecord = { ...record, state: "applied", appliedAt: new Date().toISOString() };
    await this.write(updated);
    return updated;
  }

  private async write(record: ProposalRecord): Promise<void> {
    const target = path.join(this.directory, `${record.id}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}

export class AuditStore {
  private readonly directory: string;
  readonly auditPath: string;
  constructor(workspaceRoot: string) {
    this.directory = path.join(workspaceRoot, ".agent");
    this.auditPath = path.join(this.directory, "audit.jsonl");
  }
  async append(event: Omit<AuditEvent, "timestamp">): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(this.auditPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, { encoding: "utf8", mode: 0o600 });
  }
}
