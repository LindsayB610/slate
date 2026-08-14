import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
      optionalHostCapabilities: ["open_external_url"],
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

  it("uses a responsive three-column source grid once Slate has six sources", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain(".slate-plugin-sources{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}");
    expect(pluginSource).toContain("@media (max-width:760px){.slate-plugin-sources{grid-template-columns:repeat(2,minmax(0,1fr))}}");
    expect(pluginSource).toContain("@media (max-width:520px){.slate-plugin-sources{grid-template-columns:1fr}}");
  });

  it("renders a dedicated favorite control and omits an empty Favorites shelf", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Add ${source.label} to favorites");
    expect(pluginSource).toContain("Remove ${source.label} from favorites");
    expect(pluginSource).toContain("groups.favorites.length ? <SourceGroup label=\"Favorites\"");
    expect(pluginSource).not.toContain("No favorites yet");
  });

  it("does not bundle a Tauri opener plugin", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("@tauri-apps/plugin-opener");
  });
});
