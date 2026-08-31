import { describe, expect, it } from "vitest";
import { parseMarkdownSections, parseMarkdownTable, parseScopedMarkdownTable, buildTopLevelTabs, splitTabbedDocument } from "../src/index.js";

describe("Slate presentation models", () => {
  it("groups Markdown sections under top-level tabs when requested", () => {
    const tabs = buildTopLevelTabs(parseMarkdownSections("# Projects\n## Today\n- Send draft\n# Home\n- Refill staples"));
    expect(tabs.map((tab) => [tab.label, tab.sections.length])).toEqual([["Projects", 2], ["Home", 1]]);
  });

  it("keeps a section emoji in its visible tab label", () => {
    const [tab] = buildTopLevelTabs(parseMarkdownSections("# 🎨 Creative\n## Current state\n- Sketch"));
    expect(tab.label).toBe("🎨 Creative");
  });

  it("keeps a divider-delimited document title above the tab set", () => {
    const document = splitTabbedDocument(parseMarkdownSections("# Current operating state\n---\n# 🎨 Creative\n## Current state"));
    expect(document.intro.map((section) => section.heading)).toEqual(["Current operating state"]);
    expect(document.tabs.map((tab) => tab.label)).toEqual(["🎨 Creative"]);
  });

  it("keeps a divider-delimited table archive intro above date tabs", () => {
    const document = splitTabbedDocument(parseMarkdownSections(`# Run archive
Reports are kept here.
---
# Aug 13, 2026
Short run summary.
| Priority | Keyword |
| --- | --- |
| 1 | First |

# Aug 20, 2026
| Priority | Keyword |
| --- | --- |
| 1 | Second |`));

    expect(document.intro.map((section) => section.heading)).toEqual(["Run archive"]);
    expect(document.tabs.map((tab) => tab.label)).toEqual(["Aug 13, 2026", "Aug 20, 2026"]);
  });

  it("preserves simple Markdown sections without imposing tabs", () => {
    expect(parseMarkdownSections("# Notes\nKeep this nearby.")[0]).toMatchObject({ heading: "Notes", paragraphs: ["Keep this nearby."] });
  });

  it("preserves prose, lists, and valid tables as ordered Markdown content blocks", () => {
    const [section] = parseMarkdownSections(`# Notes
Before the table.

| Item | Count |
| --- | ---: |
| Tea | 2 |

- Restock coffee
- Check labels

After the list.`);

    expect(section.blocks).toEqual([
      { type: "paragraph", value: "Before the table." },
      { type: "table", table: { headers: ["Item", "Count"], alignments: [undefined, "right"], rows: [["Tea", "2"]] } },
      { type: "list", items: ["Restock coffee", "Check labels"] },
      { type: "paragraph", value: "After the list." },
    ]);
  });

  it("preserves headingless prose and tables in an implicit document section", () => {
    const [section] = parseMarkdownSections(`Keep this reference nearby.

| Item | State |
| --- | --- |
| Draft | Ready |`);

    expect(section).toMatchObject({ heading: "", level: 0 });
    expect(section.paragraphs[0]).toBe("Keep this reference nearby.");
    expect(section.blocks).toEqual([
      { type: "paragraph", value: "Keep this reference nearby." },
      { type: "table", table: { headers: ["Item", "State"], alignments: [undefined, undefined], rows: [["Draft", "Ready"]] } },
    ]);
  });

  it("keeps leading headingless content above top-level Markdown tabs", () => {
    const document = splitTabbedDocument(parseMarkdownSections(`Reference index

| Owner | State |
| --- | --- |
| Avery | Ready |

# First
First tab.

# Second
Second tab.`));

    expect(document.intro).toHaveLength(1);
    expect(document.intro[0]).toMatchObject({ heading: "", level: 0 });
    expect(document.tabs.map((tab) => tab.label)).toEqual(["First", "Second"]);
  });

  it("keeps fenced Markdown examples as text instead of executable document structure", () => {
    const sections = parseMarkdownSections(`# Examples
\`\`\`md
# Example heading
| Name | State |
| --- | --- |
| Alpha | Ready |
\`\`\``);

    expect(sections).toHaveLength(1);
    expect(sections[0].blocks).not.toContainEqual(expect.objectContaining({ type: "table" }));
    expect(sections[0].blocks).toEqual([
      { type: "paragraph", value: "```md" },
      { type: "paragraph", value: "# Example heading" },
      { type: "paragraph", value: "| Name | State |" },
      { type: "paragraph", value: "| --- | --- |" },
      { type: "paragraph", value: "| Alpha | Ready |" },
      { type: "paragraph", value: "```" },
    ]);
  });

  it("also keeps tilde-fenced table examples as text", () => {
    const [section] = parseMarkdownSections(`# Examples
~~~md
| Name | State |
| --- | --- |
| Alpha | Ready |
~~~`);

    expect(section.blocks).not.toContainEqual(expect.objectContaining({ type: "table" }));
    expect(section.blocks?.map((block) => block.type === "paragraph" ? block.value : block.type)).toContain("| Name | State |");
  });

  it("preserves multiple inline tables in source order", () => {
    const [section] = parseMarkdownSections(`# Notes
| First | State |
| --- | --- |
| A | Ready |

Between tables.

Second | Count
--- | ---:
B | 2`);

    expect(section.blocks?.map((block) => block.type)).toEqual(["table", "paragraph", "table"]);
  });

  it("keeps malformed inline table syntax visible instead of silently dropping it", () => {
    const [section] = parseMarkdownSections(`# Notes
| Item | Count |
| --- | --- |
| Tea | 2 | extra |`);

    const blocks = section.blocks ?? [];
    expect(blocks).not.toContainEqual(expect.objectContaining({ type: "table" }));
    expect(blocks.map((block) => block.type === "paragraph" ? block.value : block.type)).toEqual([
      "| Item | Count |",
      "| --- | --- |",
      "| Tea | 2 | extra |",
    ]);
  });

  it("parses a generic Markdown table with arbitrary columns", () => {
    expect(parseMarkdownTable("# Inventory\n\n| Item | Count | Location |\n| --- | --- | --- |\n| Tea | 2 | Shelf |"))
      .toEqual({ headers: ["Item", "Count", "Location"], alignments: [undefined, undefined, undefined], rows: [["Tea", "2", "Shelf"]] });
  });

  it("parses tables without optional outer pipes and preserves column alignment", () => {
    expect(parseMarkdownTable(`Item | Count | Status
:--- | ---: | :---:
Tea | 2 | Ready`)).toEqual({
      headers: ["Item", "Count", "Status"],
      alignments: ["left", "right", "center"],
      rows: [["Tea", "2", "Ready"]],
    });
  });

  it("keeps escaped pipes inside their table cell and renders their display value naturally", () => {
    expect(parseMarkdownTable(`| Keyword | Note |
| --- | --- |
| content system \\| operating model | valid |`))
      .toEqual({
        headers: ["Keyword", "Note"],
        alignments: [undefined, undefined],
        rows: [["content system | operating model", "valid"]],
      });
  });

  it("selects the largest valid table when a file includes a small legend", () => {
    const table = parseMarkdownTable(`| State | Meaning |
| --- | --- |
| Open | Active |

| Name | Owner | Next action |
| --- | --- | --- |
| North | Avery | Email |
| South | Blair | Call |`);
    expect(table.headers).toEqual(["Name", "Owner", "Next action"]);
    expect(table.rows).toHaveLength(2);
  });

  it("ignores table examples inside fenced code when selecting a table view", () => {
    const table = parseMarkdownTable(`\`\`\`md
| Example | Score |
| --- | --- |
| Fake | 100 |
| Also fake | 90 |
\`\`\`

| Actual | Score |
| --- | --- |
| Real | 71 |`);

    expect(table).toMatchObject({ headers: ["Actual", "Score"], rows: [["Real", "71"]] });
  });

  it("selects tables only within the requested date tab", () => {
    const document = splitTabbedDocument(parseMarkdownSections(`# Run archive
---
# Aug 13, 2026
| Keyword | Score |
| --- | --- |
| First | 71 |

# Aug 20, 2026
| Keyword | Score |
| --- | --- |
| Second | 62 |
| Third | 55 |`));
    const first = parseScopedMarkdownTable(document.tabs[0].sections);
    const second = parseScopedMarkdownTable(document.tabs[1].sections);

    expect(first).toMatchObject({ ok: true, table: { rows: [["First", "71"]] } });
    expect(second).toMatchObject({ ok: true, table: { rows: [["Second", "62"], ["Third", "55"]] } });
  });

  it("keeps a table-tabs date section valid when a cell contains an escaped pipe", () => {
    const document = splitTabbedDocument(parseMarkdownSections(`# Run archive
---
# Aug 13, 2026
| Keyword | Score |
| --- | --- |
| content system \\| operating model | 71 |`));

    expect(parseScopedMarkdownTable(document.tabs[0].sections)).toMatchObject({
      ok: true,
      table: { rows: [["content system | operating model", "71"]] },
    });
  });

  it("still rejects an unescaped pipe that adds a column", () => {
    expect(() => parseMarkdownTable(`| Keyword | Note |
| --- | --- |
| content system | operating model | valid |`))
      .toThrow("Slate table rows must match the header column count.");
  });

  it("handles a table-less date tab without borrowing a sibling tab's table", () => {
    const document = splitTabbedDocument(parseMarkdownSections(`# Run archive
---
# Aug 13, 2026
| Keyword | Score |
| --- | --- |
| First | 71 |

# Aug 20, 2026
No table was generated for this run.`));

    expect(parseScopedMarkdownTable(document.tabs[1].sections)).toEqual({
      ok: false,
      message: "This tab does not contain a valid Markdown table.",
    });
  });

  it("treats Markdown link and HTML syntax as text rather than executable markup", () => {
    const section = parseMarkdownSections("# Notes\n[bad](javascript:alert(1)) <img src=x onerror=alert(1)>")[0];
    expect(section.paragraphs[0]).toContain("javascript:");
    expect(section.paragraphs[0]).toContain("<img");
  });

  it("does not render Markdown divider lines as source content", () => {
    expect(parseMarkdownSections("# Notes\n---\nKeep this nearby.")[0].paragraphs).toEqual(["Keep this nearby."]);
  });
});
