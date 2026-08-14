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

  it("parses a generic Markdown table with arbitrary columns", () => {
    expect(parseMarkdownTable("# Inventory\n\n| Item | Count | Location |\n| --- | --- | --- |\n| Tea | 2 | Shelf |"))
      .toEqual({ headers: ["Item", "Count", "Location"], rows: [["Tea", "2", "Shelf"]] });
  });

  it("keeps escaped pipes inside their table cell and renders their display value naturally", () => {
    expect(parseMarkdownTable(`| Keyword | Note |
| --- | --- |
| content system \\| operating model | valid |`))
      .toEqual({
        headers: ["Keyword", "Note"],
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
