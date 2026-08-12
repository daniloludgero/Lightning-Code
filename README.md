# Lightning Code

Lightning Code is a multilingual VS Code extension for producing controlled, reviewable code changes from natural-language tasks. It combines model-assisted editing with deterministic validation, version-aware writes, automatic backups, and local audit records.

**Author:** Danilo Ludgero

## Core capabilities

- Generates a complete-file proposal for the active editor.
- Detects the language from the active VS Code document.
- Uses the VS Code Language Model API with optional model-family selection.
- Validates every proposal before it can reach the workspace.
- Retries rejected proposals with exact validation feedback.
- Opens approved proposals in the native VS Code diff editor.
- Requires explicit user confirmation before applying a change.
- Detects concurrent file modifications through SHA-256 verification.
- Revalidates proposals immediately before writing.
- Creates a backup of every modified file.
- Records proposal and application events in an append-only audit log.

## Language pack

Lightning Code recognizes the following VS Code language modes:

| Family | Languages and modes |
| --- | --- |
| Web | TypeScript, TSX, JavaScript, JSX, HTML, CSS, SCSS, Less, Vue, Svelte |
| Data and configuration | JSON, JSON with Comments, YAML, XML, SQL |
| Systems | C, C++, Rust, Go |
| Application | Python, Java, C#, Kotlin, Swift, PHP, Ruby |
| Scripting | Shell Script, PowerShell |
| Documentation | Markdown, plain text |

Unknown VS Code language identifiers fall back to the plain-text profile, retaining integrity, size, change-scope, conflict-marker, version, backup, and audit safeguards.

### Validation levels

- **TypeScript and JavaScript:** compiler-backed syntax diagnostics and exported-symbol preservation.
- **JSON:** strict parser validation.
- **JSONC:** TypeScript configuration parser validation, including comment-aware syntax.
- **YAML:** document parser validation with structured error reporting.
- **Programming and stylesheet profiles:** balanced delimiter validation with string and comment awareness.
- **Markup, Markdown, SQL, and plain text:** general integrity, size, change-scope, conflict-marker, and version checks.

## User interface

The Lightning Code icon in the Activity Bar opens a dedicated sidebar with two operations:

- **Run task on current file** — generate, validate, review, and optionally apply a proposal.
- **Open audit log** — inspect the workspace event history.

The same operations are available from the Command Palette:

- `Lightning Code: Run Task on Current File`
- `Lightning Code: Open Audit Log`

## Task execution lifecycle

1. Lightning Code requires an active, saved file inside an open workspace.
2. The extension resolves the file through the workspace path policy and records its SHA-256 digest.
3. The model receives the task, relative path, detected language, and current content.
4. The deterministic gate evaluates the complete-file proposal.
5. A rejected proposal returns to the model with exact violation codes and messages, up to the configured retry limit.
6. An approved proposal is persisted under `.agent/proposals` and opened in the VS Code diff editor.
7. The user decides whether to apply it.
8. Before writing, Lightning Code verifies the original digest and executes the gate again.
9. The original file is backed up, the replacement is written atomically, and the action is audited.

## Deterministic safeguards

The gate enforces:

- maximum output file size;
- maximum changed-line ratio;
- non-empty file content;
- NUL-byte rejection;
- accidental response-fence rejection outside Markdown documents;
- unresolved merge-conflict marker rejection;
- language-aware syntax or structure validation;
- preservation of exported TypeScript and JavaScript symbols;
- proposal-content integrity through SHA-256;
- optimistic concurrency checks before application;
- workspace-relative paths only;
- traversal and symlink-escape rejection;
- protected path-segment rejection.

Protected segments include `.git`, `.agent`, `.ssh`, `.env`, `.npmrc`, `.pypirc`, and `node_modules`.

## Workspace records

Lightning Code creates a private `.agent` directory inside each workspace:

```text
.agent/
├── audit.jsonl
├── backups/
│   └── <proposal-id>/
│       └── <original-file>
└── proposals/
    └── <proposal-id>.json
```

- `proposals` stores the task rationale, expected digest, proposed content, detected language, gate verdict, and state.
- `backups` preserves the original content before each applied change.
- `audit.jsonl` records timestamped proposal and application events.

Add `.agent/` to workspace ignore rules when local agent records should not be committed.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `lightningCode.maxChangeRatio` | `0.6` | Maximum fraction of lines a proposal may change. |
| `lightningCode.maxFileBytes` | `1048576` | Maximum file size accepted by the engine. |
| `lightningCode.maxRetries` | `2` | Maximum model attempts after gate rejection. |
| `lightningCode.modelFamily` | empty | Optional preferred VS Code model family. |

Example:

```json
{
  "lightningCode.maxChangeRatio": 0.4,
  "lightningCode.maxFileBytes": 1048576,
  "lightningCode.maxRetries": 2,
  "lightningCode.modelFamily": ""
}
```

## Requirements

- VS Code 1.100 or later.
- A language model exposed through the VS Code Language Model API.
- Node.js 20 or later for extension development.

## Development

Install dependencies and run the validation suite:

```powershell
npm.cmd install
npm.cmd run check
```

Press `F5` from the project folder to launch an Extension Development Host.

Create an installable package:

```powershell
npm.cmd run package
```

Install the generated package:

```powershell
code --install-extension .\lightning-code-<version>.vsix --force
```

## Project structure

```text
src/
├── core/
│   ├── agent-engine.ts       # proposal and correction loop
│   ├── gate.ts               # deterministic multilingual validation
│   ├── language-profiles.ts  # VS Code language-mode mapping
│   ├── path-policy.ts        # workspace path containment
│   ├── stores.ts             # proposal and audit persistence
│   ├── types.ts              # shared domain types
│   └── workspace-service.ts  # guarded read, proposal, backup, and apply operations
├── extension.ts              # commands and VS Code workflow
├── sidebar-provider.ts       # Activity Bar webview
└── vscode-model-client.ts    # VS Code Language Model API adapter
```

## Current scope

- Each task targets one existing file.
- The model must return the complete proposed file.
- Applying a proposal always requires explicit user confirmation.
- Full compiler or language-server validation is currently available only for the parser-backed profiles listed above.
