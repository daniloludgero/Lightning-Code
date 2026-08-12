import { createHash } from "node:crypto";
import ts from "typescript";
import { parseDocument } from "yaml";
import { isCodeLanguage } from "./language-profiles.js";
import type { GateVerdict, GateViolation, SupportedLanguage } from "./types.js";

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function changedLineRatio(original: string, proposed: string): number {
  const before = original.split(/\r?\n/);
  const after = proposed.split(/\r?\n/);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const changed = Math.max(before.length - prefix - suffix, after.length - prefix - suffix);
  return changed / Math.max(1, before.length, after.length);
}

function publicSymbols(content: string, language: SupportedLanguage): Set<string> {
  const symbols = new Set<string>();
  if (language !== "typescript" && language !== "javascript") return symbols;
  const source = ts.createSourceFile("candidate.ts", content, ts.ScriptTarget.Latest, false,
    language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) symbols.add(element.name.text);
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const defaultExport = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (exported && defaultExport) symbols.add("default");
    if (!exported) continue;
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) symbols.add(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) symbols.add(declaration.name.text);
      }
    }
  }
  return symbols;
}

function delimiterViolations(content: string): GateViolation[] {
  const opening: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closing = new Set(Object.values(opening));
  const stack: Array<{ character: string; line: number }> = [];
  let quote: "'" | "\"" | "`" | undefined;
  let escaped = false;
  let line = 1;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < content.length; index++) {
    const character = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (character === "\n") { line++; lineComment = false; continue; }
    if (lineComment) continue;
    if (blockComment) {
      if (character === "*" && next === "/") { blockComment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && next === "/") { lineComment = true; index++; continue; }
    if (character === "/" && next === "*") { blockComment = true; index++; continue; }
    if (character === "#") { lineComment = true; continue; }
    if (character === "'" || character === "\"" || character === "`") { quote = character; continue; }
    if (opening[character]) { stack.push({ character, line }); continue; }
    if (closing.has(character)) {
      const last = stack.pop();
      if (!last || opening[last.character] !== character) {
        return [{ code: "unbalanced_delimiter", severity: "error", message: `Unexpected closing delimiter ${character}.`, line }];
      }
    }
  }
  const unclosed = stack.at(-1);
  if (unclosed) return [{ code: "unbalanced_delimiter", severity: "error", message: `Unclosed delimiter ${unclosed.character}.`, line: unclosed.line }];
  return [];
}

function typescriptViolations(content: string, language: "typescript" | "javascript"): GateViolation[] {
  const result = ts.transpileModule(content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
    reportDiagnostics: true,
    fileName: language === "typescript" ? "candidate.ts" : "candidate.js",
  });
  return (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).map((diagnostic) => {
    const location = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : undefined;
    return {
      code: `typescript_${diagnostic.code}`,
      severity: "error" as const,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      ...(location ? { line: location.line + 1 } : {}),
    };
  });
}

function syntaxViolations(content: string, language: SupportedLanguage): GateViolation[] {
  if (language === "json") {
    try { JSON.parse(content); return []; }
    catch (error) { return [{ code: "invalid_json", severity: "error", message: `Invalid JSON: ${(error as Error).message}` }]; }
  }
  if (language === "jsonc") {
    const parsed = ts.parseConfigFileTextToJson("candidate.jsonc", content);
    return parsed.error ? [{ code: "invalid_jsonc", severity: "error", message: ts.flattenDiagnosticMessageText(parsed.error.messageText, " ") }] : [];
  }
  if (language === "yaml") {
    const document = parseDocument(content);
    return document.errors.map((error) => ({ code: "invalid_yaml", severity: "error" as const, message: `Invalid YAML: ${error.message}` }));
  }
  if (language === "typescript" || language === "javascript") return typescriptViolations(content, language);
  return isCodeLanguage(language) ? delimiterViolations(content) : [];
}

export function validateChange(original: string, proposed: string, language: SupportedLanguage,
  options: { maxFileBytes: number; maxChangeRatio: number; allowBreakingChanges?: boolean }): GateVerdict {
  const violations: GateViolation[] = [];
  const byteLength = Buffer.byteLength(proposed, "utf8");
  const ratio = changedLineRatio(original, proposed);
  if (!proposed.trim()) violations.push({ code: "empty_file", severity: "error", message: "The proposal empties the file." });
  if (byteLength > options.maxFileBytes) violations.push({ code: "file_too_large", severity: "error", message: `The proposal has ${byteLength} bytes; limit: ${options.maxFileBytes}.` });
  if (proposed.includes("\0")) violations.push({ code: "nul_byte", severity: "error", message: "The proposal contains a NUL byte." });
  if (language !== "markdown" && /^\s*```/m.test(proposed)) violations.push({ code: "markdown_fence", severity: "error", message: "The model response contains Markdown code fences." });
  if (/^(<{7}|={7}|>{7})(?:\s|$)/m.test(proposed)) violations.push({ code: "merge_conflict_marker", severity: "error", message: "The proposal contains an unresolved merge-conflict marker." });
  if (original.trim() && ratio > options.maxChangeRatio) violations.push({ code: "change_too_large", severity: "error", message: `The change affects ${(ratio * 100).toFixed(1)}% of lines; limit: ${(options.maxChangeRatio * 100).toFixed(1)}%.` });
  if (!options.allowBreakingChanges) {
    const after = publicSymbols(proposed, language);
    for (const symbol of publicSymbols(original, language)) {
      if (!after.has(symbol)) violations.push({ code: "public_symbol_removed", severity: "error", message: `Public symbol removed without authorization: ${symbol}.` });
    }
  }
  violations.push(...syntaxViolations(proposed, language));
  return { approved: !violations.some((item) => item.severity === "error"), originalSha256: sha256(original), proposedSha256: sha256(proposed), changedLineRatio: ratio, violations };
}
