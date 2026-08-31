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
  blocks?: MarkdownContentBlock[];
  dividerBefore: boolean;
};

export type MarkdownContentBlock =
  | { type: "paragraph"; value: string }
  | { type: "list"; items: string[] }
  | { type: "table"; table: MarkdownTable };

export type MarkdownTab = {
  id: string;
  label: string;
  sections: MarkdownSection[];
};

export type MarkdownTable = {
  headers: string[];
  alignments?: Array<"left" | "center" | "right" | undefined>;
  rows: string[][];
};

export type ScopedMarkdownTableResult =
  | { ok: true; table: MarkdownTable }
  | { ok: false; message: string };

export type SlatePluginManifest = {
  id: "slate";
  displayName: "Slate";
  configFile: "slate.config.json";
  hostCapabilities: ["read-configured-markdown", "watch-configured-markdown", "manage-configured-markdown", "browse-markdown-file", "open_external_url"];
};

export const slatePluginManifest: SlatePluginManifest = {
  id: "slate",
  displayName: "Slate",
  configFile: "slate.config.json",
  hostCapabilities: ["read-configured-markdown", "watch-configured-markdown", "manage-configured-markdown", "browse-markdown-file", "open_external_url"],
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
  optionalHostCapabilities: ["configured_markdown_config_management", "browse_markdown_file", "open_external_url"] as const,
  dataRoots: [] as string[],
  importActions: [] as string[],
  exportActions: [] as string[],
  status: "ready" as const,
  runtime: { kind: "native-bridge" as const, entryPoint: "read-configured-markdown-source" },
  privateWorkspace: { kind: "runner-root" as const, requiredFields: ["slate.config.json"] },
};

export { WorkshopToolView } from "./plugin.js";
export type { BrowseMarkdownFile, BrowseWorkspaceRoot, MarkdownFileBrowseResult, WorkshopToolViewProps, WorkspaceRootBrowseResult, WorkspaceRootRequestResult } from "./plugin.js";

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

/** Accepts an absolute, traversal-free path to a conventional Markdown file. */
export function isSlateMarkdownPath(path: string): boolean {
  return /^\/(?!.*(?:^|\/)\.\.(?:\/|$)).+\.(?:md|markdown)$/i.test(path);
}

export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const contentLines = new Map<MarkdownSection, string[]>();
  let current: MarkdownSection | undefined;
  let dividerBefore = false;
  let fence: MarkdownFence | undefined;

  const ensureCurrent = () => {
    if (current) return current;
    current = { heading: "", level: 0, paragraphs: [], items: [], blocks: [], dividerBefore };
    sections.push(current);
    contentLines.set(current, []);
    dividerBefore = false;
    return current;
  };

  const appendContent = (line: string, forceParagraph = false) => {
    const section = ensureCurrent();
    contentLines.get(section)?.push(line);
    if (!line.trim()) return;
    const item = forceParagraph ? null : /^\s*(?:[-*+]|\d+\.)\s+(.+?)\s*$/.exec(line);
    if (item) section.items.push(item[1]);
    else section.paragraphs.push(line.trim());
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (fence) {
      appendContent(rawLine, true);
      if (closesMarkdownFence(rawLine, fence)) fence = undefined;
      continue;
    }

    const openingFence = markdownFence(rawLine);
    if (openingFence) {
      appendContent(rawLine, true);
      fence = openingFence;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      current = { heading: heading[2], level: heading[1].length, paragraphs: [], items: [], blocks: [], dividerBefore };
      sections.push(current);
      contentLines.set(current, []);
      dividerBefore = false;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rawLine)) { dividerBefore = true; continue; }
    if (!current && !rawLine.trim()) continue;
    appendContent(rawLine);
  }

  for (const section of sections) section.blocks = parseMarkdownContentBlocks(contentLines.get(section) ?? []);

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
  const firstHeading = sections.findIndex((section) => section.level > 0);
  if (firstHeading === -1) return { intro: sections, tabs: [] };
  const leadingIntro = sections.slice(0, firstHeading);
  const headedSections = sections.slice(firstHeading);
  const firstTabStart = headedSections.findIndex((section, index) => section.level === 1 && index > 0 && section.dividerBefore);
  if (firstTabStart === -1) return { intro: leadingIntro, tabs: buildTopLevelTabs(headedSections) };
  return { intro: [...leadingIntro, ...headedSections.slice(0, firstTabStart)], tabs: buildTopLevelTabs(headedSections.slice(firstTabStart)) };
}

export function parseMarkdownTable(markdown: string): MarkdownTable {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const tables: MarkdownTable[] = [];
  let fence: MarkdownFence | undefined;
  for (let headerIndex = 0; headerIndex < lines.length - 1; headerIndex += 1) {
    if (fence) {
      if (closesMarkdownFence(lines[headerIndex], fence)) fence = undefined;
      continue;
    }
    const openingFence = markdownFence(lines[headerIndex]);
    if (openingFence) {
      fence = openingFence;
      continue;
    }
    const candidate = tableAt(lines, headerIndex);
    if (candidate.kind === "none") continue;
    if (candidate.kind === "invalid") throw new Error("Slate table rows must match the header column count.");
    tables.push(candidate.table);
    headerIndex = candidate.nextIndex - 1;
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
    ...(section.level > 0 ? [`${"#".repeat(section.level)} ${section.heading}`] : []),
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
    typeof source.path === "string" && isSlateMarkdownPath(source.path) &&
    typeof source.view === "string" && (slateViewFormats as readonly string[]).includes(source.view),
  );
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

type TableCandidate =
  | { kind: "none" }
  | { kind: "invalid"; nextIndex: number }
  | { kind: "table"; table: MarkdownTable; nextIndex: number };

type MarkdownFence = { character: "`" | "~"; length: number };

function markdownFence(line: string): MarkdownFence | undefined {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (!match) return undefined;
  return { character: match[1][0] as MarkdownFence["character"], length: match[1].length };
}

function closesMarkdownFence(line: string, fence: MarkdownFence): boolean {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function tableAt(lines: string[], headerIndex: number): TableCandidate {
  if (!hasUnescapedPipe(lines[headerIndex] ?? "") || !isTableSeparator(lines[headerIndex + 1] ?? "")) return { kind: "none" };
  const headers = tableCells(lines[headerIndex]);
  const separators = tableCells(lines[headerIndex + 1]);
  if (separators.length !== headers.length) return { kind: "invalid", nextIndex: headerIndex + 2 };
  const alignments = separators.map(tableAlignment);
  const rows: string[][] = [];
  let rowIndex = headerIndex + 2;
  while (rowIndex < lines.length && hasUnescapedPipe(lines[rowIndex])) {
    const row = tableCells(lines[rowIndex]);
    if (row.length !== headers.length) return { kind: "invalid", nextIndex: rowIndex + 1 };
    rows.push(row);
    rowIndex += 1;
  }
  return { kind: "table", table: { headers, alignments, rows }, nextIndex: rowIndex };
}

function tableAlignment(separator: string): "left" | "center" | "right" | undefined {
  if (separator.startsWith(":") && separator.endsWith(":")) return "center";
  if (separator.endsWith(":")) return "right";
  if (separator.startsWith(":")) return "left";
  return undefined;
}

function hasUnescapedPipe(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "\\") { index += 1; continue; }
    if (line[index] === "|") return true;
  }
  return false;
}

function parseMarkdownContentBlocks(lines: string[]): MarkdownContentBlock[] {
  const blocks: MarkdownContentBlock[] = [];
  let fence: MarkdownFence | undefined;
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index += 1; continue; }

    if (fence) {
      blocks.push({ type: "paragraph", value: lines[index].trim() });
      if (closesMarkdownFence(lines[index], fence)) fence = undefined;
      index += 1;
      continue;
    }

    const openingFence = markdownFence(lines[index]);
    if (openingFence) {
      blocks.push({ type: "paragraph", value: lines[index].trim() });
      fence = openingFence;
      index += 1;
      continue;
    }

    const candidate = tableAt(lines, index);
    if (candidate.kind === "table") {
      blocks.push({ type: "table", table: candidate.table });
      index = candidate.nextIndex;
      continue;
    }

    const firstItem = /^\s*(?:[-*+]|\d+\.)\s+(.+?)\s*$/.exec(lines[index]);
    if (firstItem) {
      const items = [firstItem[1]];
      index += 1;
      while (index < lines.length) {
        const nextItem = /^\s*(?:[-*+]|\d+\.)\s+(.+?)\s*$/.exec(lines[index]);
        if (!nextItem) break;
        items.push(nextItem[1]);
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    blocks.push({ type: "paragraph", value: lines[index].trim() });
    index += 1;
  }
  return blocks;
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
