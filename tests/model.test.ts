import { describe, expect, it } from "vitest";
import { parseMarkdownSections, parseMarkdownTable, buildTopLevelTabs } from "../src/index.js";

describe("Slate presentation models", () => {
  it("groups Markdown sections under top-level tabs when requested", () => {
    const tabs = buildTopLevelTabs(parseMarkdownSections("# Projects\n## Today\n- Send draft\n# Home\n- Refill staples"));
    expect(tabs.map((tab) => [tab.label, tab.sections.length])).toEqual([["Projects", 2], ["Home", 1]]);
  });

  it("preserves simple Markdown sections without imposing tabs", () => {
    expect(parseMarkdownSections("# Notes\nKeep this nearby.")[0]).toMatchObject({ heading: "Notes", paragraphs: ["Keep this nearby."] });
  });

  it("parses a generic Markdown table with arbitrary columns", () => {
    expect(parseMarkdownTable("# Inventory\n\n| Item | Count | Location |\n| --- | --- | --- |\n| Tea | 2 | Shelf |"))
      .toEqual({ headers: ["Item", "Count", "Location"], rows: [["Tea", "2", "Shelf"]] });
  });
});
