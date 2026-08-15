export const slateViewFormats = ["markdown-tabs", "markdown", "table", "table-tabs"] as const;
export type SlateViewFormat = (typeof slateViewFormats)[number];

export type SlateSourceDefinition = {
  id: string;
  label: string;
  path: string;
  view: SlateViewFormat;
};

export type SlateConfig = {
  version: 1;
  sources: SlateSourceDefinition[];
};

export type SlateConfigResult =
  | { ok: true; config: SlateConfig }
  | { ok: false; message: string };

export type MarkdownSection = {
  heading: string;
  level: number;
  paragraphs: string[];
  items: string[];
  dividerBefore: boolean;
};

export type MarkdownTab = {
  id: string;
  label: string;
  sections: MarkdownSection[];
};

export type MarkdownTable = {
  headers: string[];
  rows: string[][];
};

export type ScopedMarkdownTableResult =
  | { ok: true; table: MarkdownTable }
  | { ok: false; message: string };

export type SlatePluginManifest = {
  id: "slate";
  displayName: "Slate";
  configFile: "slate.config.json";
  hostCapabilities: ["read-configured-markdown", "watch-configured-markdown", "manage-configured-markdown", "open_external_url"];
};

export const slatePluginManifest: SlatePluginManifest = {
  id: "slate",
  displayName: "Slate",
  configFile: "slate.config.json",
  hostCapabilities: ["read-configured-markdown", "watch-configured-markdown", "manage-configured-markdown", "open_external_url"],
};

/**
 * Data-only declaration consumed by a host's plugin registry.  Keeping this
 * here means a host never needs to duplicate Slate's routes or configuration
 * contract in its own source tree.
 */
export const workshopPluginDeclaration = {
  contractVersion: 1,
  ...slatePluginManifest,
  description: "View explicitly configured local Markdown files without copying their content.",
  docsPath: "/docs/tools/slate.md",
  workspaceRequirement: "Needs a private folder containing slate.config.json.",
  uninstallSafetyCopy: "Disabling Slate hides the tool only. Local configuration and source files stay untouched.",
  routes: [
    { id: "sources", label: "Sources", path: "/slate", sectionId: "slate-sources" },
  ],
  navigationMode: "plugin" as const,
  requiredLocalCapabilities: ["local-workspace"] as const,
  optionalHostCapabilities: ["configured_markdown_config_management", "open_external_url"] as const,
  dataRoots: [] as string[],
  importActions: [] as string[],
  exportActions: [] as string[],
  status: "ready" as const,
  runtime: { kind: "native-bridge" as const, entryPoint: "read-configured-markdown-source" },
  privateWorkspace: { kind: "runner-root" as const, requiredFields: ["slate.config.json"] },
};

export { WorkshopToolView } from "./plugin.js";
export type { BrowseWorkspaceRoot, WorkshopToolViewProps, WorkspaceRootBrowseResult, WorkspaceRootRequestResult } from "./plugin.js";

export function parseSlateConfig(contents: string): SlateConfigResult {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    return { ok: false, message: "Slate configuration is not valid JSON." };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Slate configuration must be an object." };
  }

  const config = value as Partial<SlateConfig>;
  if (config.version !== 1 || !Array.isArray(config.sources)) {
    return { ok: false, message: "Slate configuration requires version 1 and a sources array." };
  }

  const sources: SlateSourceDefinition[] = [];
  for (const source of config.sources) {
    if (!isSourceDefinition(source)) {
      return { ok: false, message: "Each Slate source needs an id, label, absolute Markdown path, and supported view." };
    }
    sources.push(source);
  }

  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    return { ok: false, message: "Slate source ids must be unique." };
  }
  if (new Set(sources.map((source) => source.path)).size !== sources.length) {
    return { ok: false, message: "Slate source paths must be unique." };
  }

  return { ok: true, config: { version: 1, sources } };
}

export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | undefined;
  let dividerBefore = false;

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      current = { heading: heading[2], level: heading[1].length, paragraphs: [], items: [], dividerBefore };
      sections.push(current);
      dividerBefore = false;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rawLine)) { dividerBefore = true; continue; }
    if (!current || !rawLine.trim()) continue;
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.+?)\s*$/.exec(rawLine);
    if (item) current.items.push(item[1]);
    else current.paragraphs.push(rawLine.trim());
  }

  return sections;
}

export function buildTopLevelTabs(sections: MarkdownSection[]): MarkdownTab[] {
  const tabs: MarkdownTab[] = [];
  let current: MarkdownTab | undefined;
  for (const section of sections) {
    if (section.level === 1) {
      current = { id: `${tabs.length}-${section.heading}`, label: section.heading, sections: [section] };
      tabs.push(current);
    } else if (current) {
      current.sections.push(section);
    }
  }
  return tabs;
}

/** Separates a divider-delimited document title from the sections that become tabs. */
export function splitTabbedDocument(sections: MarkdownSection[]): { intro: MarkdownSection[]; tabs: MarkdownTab[] } {
  const firstTabStart = sections.findIndex((section, index) => section.level === 1 && index > 0 && section.dividerBefore);
  if (firstTabStart === -1) return { intro: [], tabs: buildTopLevelTabs(sections) };
  return { intro: sections.slice(0, firstTabStart), tabs: buildTopLevelTabs(sections.slice(firstTabStart)) };
}

export function parseMarkdownTable(markdown: string): MarkdownTable {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const tables: MarkdownTable[] = [];
  for (let headerIndex = 0; headerIndex < lines.length - 1; headerIndex += 1) {
    if (!lines[headerIndex].trim().startsWith("|") || !isTableSeparator(lines[headerIndex + 1])) continue;
    const headers = tableCells(lines[headerIndex]);
    const rows: string[][] = [];
    let rowIndex = headerIndex + 2;
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const row = tableCells(lines[rowIndex]);
      if (row.length !== headers.length) throw new Error("Slate table rows must match the header column count.");
      rows.push(row);
      rowIndex += 1;
    }
    tables.push({ headers, rows });
    headerIndex = rowIndex - 1;
  }
  if (!tables.length) throw new Error("Slate table view requires a Markdown table with a header and separator row.");
  return tables.reduce((largest, table) => table.rows.length > largest.rows.length ? table : largest);
}

/**
 * Rebuilds parsed sections as Markdown for a tab-local operation. This keeps
 * table selection confined to the active tab rather than the whole document.
 */
export function markdownFromSections(sections: MarkdownSection[]): string {
  return sections.flatMap((section) => [
    `${"#".repeat(section.level)} ${section.heading}`,
    ...section.paragraphs,
    ...section.items.map((item) => `- ${item}`),
  ]).join("\n");
}

/** Returns a table result for one tab only; it never searches sibling tabs. */
export function parseScopedMarkdownTable(sections: MarkdownSection[]): ScopedMarkdownTableResult {
  try {
    return { ok: true, table: parseMarkdownTable(markdownFromSections(sections)) };
  } catch {
    return { ok: false, message: "This tab does not contain a valid Markdown table." };
  }
}

function isSourceDefinition(value: unknown): value is SlateSourceDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Partial<SlateSourceDefinition>;
  return Boolean(
    typeof source.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(source.id) &&
    typeof source.label === "string" && source.label.trim() &&
    typeof source.path === "string" && /^\/(?!.*(?:^|\/)\.\.(?:\/|$)).+\.md$/.test(source.path) &&
    typeof source.view === "string" && (slateViewFormats as readonly string[]).includes(source.view),
  );
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line: string): string[] {
  const value = line.trim();
  const cells: string[] = [];
  let cell = "";
  let index = value.startsWith("|") ? 1 : 0;

  for (; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }

  if (cell || !value.endsWith("|")) cells.push(cell.trim());
  return cells;
}
