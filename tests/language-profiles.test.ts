import assert from "node:assert/strict";
import test from "node:test";
import { resolveLanguage, SUPPORTED_LANGUAGE_IDS } from "../src/core/language-profiles.js";

test("maps extended VS Code language identifiers", () => {
  assert.equal(resolveLanguage("typescriptreact"), "typescript");
  assert.equal(resolveLanguage("python"), "python");
  assert.equal(resolveLanguage("cpp"), "cpp");
  assert.equal(resolveLanguage("csharp"), "csharp");
  assert.equal(resolveLanguage("shellscript"), "shell");
  assert.equal(resolveLanguage("scss"), "css");
  assert.equal(resolveLanguage("vue"), "vue");
  assert.equal(resolveLanguage("unknown-language"), "text");
  assert.ok(SUPPORTED_LANGUAGE_IDS.length >= 25);
});
