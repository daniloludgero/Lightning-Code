import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const FORBIDDEN_SEGMENTS = new Set([".git", ".agent", ".ssh", "node_modules", ".env", ".npmrc", ".pypirc"]);

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveWorkspacePath(workspaceRoot: string, requestedPath: string,
  options: { allowMissingLeaf?: boolean; allowRoot?: boolean } = {}): Promise<string> {
  if (!requestedPath || requestedPath.includes("\0")) throw new Error("Caminho inválido");
  if (path.isAbsolute(requestedPath)) throw new Error("Use somente caminhos relativos ao workspace");
  const normalized = path.normalize(requestedPath).replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || FORBIDDEN_SEGMENTS.has(segment))) throw new Error("Caminho fora da política do agente");
  const rootReal = await realpath(workspaceRoot);
  const candidate = path.resolve(rootReal, normalized);
  if (!isWithin(rootReal, candidate) || (!options.allowRoot && candidate === rootReal)) throw new Error("Caminho escapa do workspace");
  try {
    const candidateReal = await realpath(candidate);
    if (!isWithin(rootReal, candidateReal)) throw new Error("Symlink escapa do workspace");
    return candidateReal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !options.allowMissingLeaf) throw error;
    const parentReal = await realpath(path.dirname(candidate));
    if (!isWithin(rootReal, parentReal) || !(await lstat(parentReal)).isDirectory()) throw new Error("Diretório pai inválido");
    return path.join(parentReal, path.basename(candidate));
  }
}

export function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replaceAll("\\", "/");
}
