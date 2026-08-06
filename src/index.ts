export const slateViewFormats = ["markdown-tabs", "markdown", "table"] as const;
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
  if (config.version !== 1 || !Array.isArray(config.sources) || !config.sources.length) {
    return { ok: false, message: "Slate configuration requires version 1 and at least one source." };
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

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      current = { heading: heading[2], level: heading[1].length, paragraphs: [], items: [] };
      sections.push(current);
      continue;
    }
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
      current = { id: `${tabs.length}-${section.heading}`, label: stripLeadingEmoji(section.heading), sections: [section] };
      tabs.push(current);
    } else if (current) {
      current.sections.push(section);
    }
  }
  return tabs;
}

export function parseMarkdownTable(markdown: string): MarkdownTable {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line, index) => line.trim().startsWith("|") && isTableSeparator(lines[index + 1] ?? ""));
  if (headerIndex === -1) throw new Error("Slate table view requires a Markdown table with a header and separator row.");

  const headers = tableCells(lines[headerIndex]);
  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim() || !line.trim().startsWith("|")) break;
    const row = tableCells(line);
    if (row.length !== headers.length) throw new Error("Slate table rows must match the header column count.");
    rows.push(row);
  }
  return { headers, rows };
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

function stripLeadingEmoji(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+/u, "");
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}
