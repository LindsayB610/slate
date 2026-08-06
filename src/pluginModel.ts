import { slateViewFormats, type SlateSourceDefinition } from "./index.js";

export type SlateSourceMetadata = Pick<SlateSourceDefinition, "id" | "label" | "view">;
export type SlateSnapshot = { contents: string; updatedAt: number };
export type SlateSourceChange = { root: string; configFile: string; source: string };

export function validateSourceMetadata(value: unknown): SlateSourceMetadata[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources: SlateSourceMetadata[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const source = item as Partial<SlateSourceMetadata>;
    if (typeof source.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(source.id) || ids.has(source.id)
      || typeof source.label !== "string" || !source.label.trim()
      || typeof source.view !== "string" || !(slateViewFormats as readonly string[]).includes(source.view)) return null;
    ids.add(source.id); sources.push({ id: source.id, label: source.label, view: source.view as SlateSourceMetadata["view"] });
  }
  return sources;
}

export function shouldRefreshSource(root: string, change: SlateSourceChange, configFile: string): boolean {
  return change.configFile === configFile && normalizeRoot(change.root) === normalizeRoot(root);
}

export function keepLatestSnapshot(
  current: Record<string, SlateSnapshot>, source: string, requestVersion: number, latestVersion: number, result: SlateSnapshot | null,
): Record<string, SlateSnapshot> {
  if (!result || requestVersion !== latestVersion) return current;
  return { ...current, [source]: result };
}

function normalizeRoot(value: string): string { return value.length > 1 ? value.replace(/\/+$/, "") : value; }
