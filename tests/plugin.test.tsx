import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkshopToolView, workshopPluginDeclaration } from "../src/index.js";
import { slateDemoSnapshots } from "../src/pluginModel.js";
import { buildTopLevelTabs, parseMarkdownSections, parseMarkdownTable } from "../src/index.js";

describe("Slate Workshop plugin surface", () => {
  it("declares the versioned plugin contract and its own navigation", () => {
    expect(workshopPluginDeclaration).toMatchObject({
      contractVersion: 1,
      id: "slate",
      navigationMode: "plugin",
      status: "ready",
      privateWorkspace: { requiredFields: ["slate.config.json"] },
      requiredLocalCapabilities: ["local-workspace"],
    });
  });

  it("renders a neutral private-workspace setup view without reading a source", () => {
    const markup = renderToStaticMarkup(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
    expect(markup).toContain("Slate private folder");
    expect(markup).toContain("Connect Slate");
    expect(markup).not.toContain("disabled");
  });

  it("ships substantial non-private preview data for layout review", () => {
    expect(buildTopLevelTabs(parseMarkdownSections(slateDemoSnapshots.tasks.contents))).toHaveLength(8);
    expect(parseMarkdownTable(slateDemoSnapshots.inventory.contents).rows).toHaveLength(18);
  });

  it("marks top-level and nested list headings distinctly", () => {
    const markup = renderToStaticMarkup(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
    expect(markup).toContain("slate-plugin-main-heading");
    expect(markup).toContain("slate-plugin-subheading");
  });
});
