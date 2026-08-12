export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "json"
  | "jsonc"
  | "python"
  | "java"
  | "csharp"
  | "cpp"
  | "c"
  | "go"
  | "rust"
  | "php"
  | "ruby"
  | "kotlin"
  | "swift"
  | "shell"
  | "powershell"
  | "sql"
  | "yaml"
  | "html"
  | "css"
  | "vue"
  | "svelte"
  | "xml"
  | "markdown"
  | "text";

export interface GateViolation {
  code: string;
  severity: "warning" | "error";
  message: string;
  line?: number;
}

export interface GateVerdict {
  approved: boolean;
  originalSha256: string;
  proposedSha256: string;
  changedLineRatio: number;
  violations: GateViolation[];
}

export interface ProposalRecord {
  id: string;
  relativePath: string;
  language: SupportedLanguage;
  expectedSha256: string;
  proposedSha256: string;
  proposedContent: string;
  rationale: string;
  allowBreakingChanges: boolean;
  createdAt: string;
  verdict: GateVerdict;
  state: "pending" | "applied";
  appliedAt?: string;
}

export interface AuditEvent {
  timestamp: string;
  action: string;
  success: boolean;
  path?: string;
  proposalId?: string;
  details?: Record<string, unknown>;
}

export interface EngineConfig {
  workspaceRoot: string;
  maxFileBytes: number;
  maxChangeRatio: number;
}
