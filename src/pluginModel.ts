import { slateViewFormats, type SlateSourceDefinition } from "./index.js";

export type SlateSourceMetadata = Pick<SlateSourceDefinition, "id" | "label" | "view">;
export type SlateSnapshot = { contents: string; updatedAt: number };
export type SlateSourceChange = { root: string; configFile: string; source: string };

export const slateDemoSources: SlateSourceMetadata[] = [
  { id: "tasks", label: "Tasks", view: "markdown-tabs" },
  { id: "notes", label: "Notes", view: "markdown" },
  { id: "inventory", label: "Inventory", view: "table" },
];

export const slateDemoSnapshots: Record<string, SlateSnapshot> = {
  tasks: { updatedAt: 0, contents: "# Projects\n## Today\n- Prepare the project brief\n- Review open decisions\n# Home\n## Next actions\n- Plan the week" },
  notes: { updatedAt: 0, contents: "# Notes\nKeep short reference notes close to the work." },
  inventory: { updatedAt: 0, contents: "# Inventory\n\n| Item | Count | Location |\n| --- | --- | --- |\n| Tea | 2 | Shelf |\n| Rice | 1 | Pantry |" },
};

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

/** Returns whether a subscription must be immediately released after an async setup race. */
export function releaseIfDisposed(disposed: boolean, unlisten: () => void): boolean {
  if (!disposed) return false;
  unlisten();
  return true;
}

function normalizeRoot(value: string): string { return value.length > 1 ? value.replace(/\/+$/, "") : value; }
