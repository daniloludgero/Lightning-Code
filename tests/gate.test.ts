import assert from "node:assert/strict";
import test from "node:test";
import { sha256, validateChange } from "../src/core/gate.js";

test("aprova alteração TypeScript pequena e válida", () => {
  const original = "export function sum(a: number, b: number) {\n  return a + b;\n}\n";
  const proposed = "export function sum(a: number, b: number) {\n  return Number(a) + Number(b);\n}\n";
  const verdict = validateChange(original, proposed, "typescript", { maxFileBytes: 10_000, maxChangeRatio: 0.6 });
  assert.equal(verdict.approved, true);
  assert.equal(verdict.originalSha256, sha256(original));
});

test("rejeita remoção de símbolo público", () => {
  const verdict = validateChange("export function run() { return true; }", "const run = () => true;", "typescript",
    { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(verdict.approved, false);
  assert.ok(verdict.violations.some((item) => item.code === "public_symbol_removed"));
});

test("rejeita JSON inválido e cercas Markdown", () => {
  const verdict = validateChange("{\"ok\":true}", "```json\n{\"ok\":}\n```", "json", { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(verdict.approved, false);
  assert.ok(verdict.violations.some((item) => item.code === "invalid_json"));
  assert.ok(verdict.violations.some((item) => item.code === "markdown_fence"));
});

test("validates YAML and JSONC with dedicated parsers", () => {
  const yaml = validateChange("name: old\n", "name: [broken\n", "yaml", { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(yaml.approved, false);
  assert.ok(yaml.violations.some((item) => item.code === "invalid_yaml"));

  const jsonc = validateChange("{\n  // old\n  \"value\": 1\n}\n", "{\n  // updated\n  \"value\": 2\n}\n", "jsonc",
    { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(jsonc.approved, true);
});

test("rejects unbalanced delimiters in an extended language", () => {
  const verdict = validateChange("class App {}\n", "class App {\n  void run() {\n}\n", "java", { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(verdict.approved, false);
  assert.ok(verdict.violations.some((item) => item.code === "unbalanced_delimiter"));
});

test("allows native code fences in Markdown documents", () => {
  const verdict = validateChange("# Example\n", "# Example\n\n```ts\nconst value = 1;\n```\n", "markdown",
    { maxFileBytes: 10_000, maxChangeRatio: 1 });
  assert.equal(verdict.approved, true);
});
