import type { SupportedLanguage } from "./types.js";

const LANGUAGE_IDS: Readonly<Record<string, SupportedLanguage>> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  json: "json",
  jsonc: "jsonc",
  python: "python",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  kotlin: "kotlin",
  swift: "swift",
  shellscript: "shell",
  powershell: "powershell",
  sql: "sql",
  yaml: "yaml",
  html: "html",
  css: "css",
  scss: "css",
  less: "css",
  vue: "vue",
  svelte: "svelte",
  xml: "xml",
  markdown: "markdown",
  plaintext: "text",
};

export const SUPPORTED_LANGUAGE_IDS = Object.freeze(Object.keys(LANGUAGE_IDS));

export function resolveLanguage(languageId: string): SupportedLanguage {
  return LANGUAGE_IDS[languageId.toLowerCase()] ?? "text";
}

export function isCodeLanguage(language: SupportedLanguage): boolean {
  return !["json", "jsonc", "yaml", "markdown", "text", "html", "xml"].includes(language);
}
