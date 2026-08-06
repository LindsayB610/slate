import { describe, expect, it } from "vitest";
import { parseMarkdownSections, parseMarkdownTable, buildTopLevelTabs, splitTabbedDocument } from "../src/index.js";

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

  it("preserves simple Markdown sections without imposing tabs", () => {
    expect(parseMarkdownSections("# Notes\nKeep this nearby.")[0]).toMatchObject({ heading: "Notes", paragraphs: ["Keep this nearby."] });
  });

  it("parses a generic Markdown table with arbitrary columns", () => {
    expect(parseMarkdownTable("# Inventory\n\n| Item | Count | Location |\n| --- | --- | --- |\n| Tea | 2 | Shelf |"))
      .toEqual({ headers: ["Item", "Count", "Location"], rows: [["Tea", "2", "Shelf"]] });
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

  it("treats Markdown link and HTML syntax as text rather than executable markup", () => {
    const section = parseMarkdownSections("# Notes\n[bad](javascript:alert(1)) <img src=x onerror=alert(1)>")[0];
    expect(section.paragraphs[0]).toContain("javascript:");
    expect(section.paragraphs[0]).toContain("<img");
  });

  it("does not render Markdown divider lines as source content", () => {
    expect(parseMarkdownSections("# Notes\n---\nKeep this nearby.")[0].paragraphs).toEqual(["Keep this nearby."]);
  });
});
