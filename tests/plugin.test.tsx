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
      optionalHostCapabilities: ["configured_markdown_config_management", "browse_markdown_file", "open_external_url"],
    });
  });

  it("renders a private Slate-folder setup view without reading a source", () => {
    const markup = renderToStaticMarkup(<WorkshopToolView requestWorkspaceRoot={() => undefined} browseWorkspaceRoot={() => ({ ok: true, root: "/preview/slate" })} />);
    expect(markup).toContain("Connect a Slate folder");
    expect(markup).toContain("Folder containing slate.config.json");
    expect(markup).toContain("Browse…");
    expect(markup).toContain("Connect folder");
    expect(markup).toContain("The folder must already contain");
    expect(markup).toContain('<form>');
    expect(markup).toContain('<button type="submit" class="slate-plugin-workspace-connect">Connect folder</button>');
  });

  it("keeps manual folder entry usable when the host does not provide browsing", () => {
    const markup = renderToStaticMarkup(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
    expect(markup).toContain("Folder containing slate.config.json");
    expect(markup).not.toContain("Browse…");
    expect(markup).toContain("Connect folder");
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
    expect(pluginSource).toContain("@media (max-width:760px){.slate-plugin-sources{grid-template-columns:repeat(2,minmax(0,1fr))}");
    expect(pluginSource).toContain("@media (max-width:520px){.slate-plugin-sources{grid-template-columns:1fr}");
  });

  it("keeps stacked document management actions from covering the editor", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("@media (max-width:760px)");
    expect(pluginSource).toContain(".slate-plugin-manager-footer{position:static}");
    expect(pluginSource).toContain(".slate-plugin-manager-editor{padding:22px 0;scroll-margin-top:16px}");
  });

  it("renders a dedicated favorite control and omits an empty Favorites shelf", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Add ${source.label} to favorites");
    expect(pluginSource).toContain("Remove ${source.label} from favorites");
    expect(pluginSource).toContain("groups.favorites.length ? <SourceGroup label=\"Favorites\"");
    expect(pluginSource).not.toContain("No favorites yet");
  });

  it("keeps connected-folder replacement inside Slate's UI", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Change Slate folder");
    expect(pluginSource).toContain("Use a different folder");
    expect(pluginSource).toContain("Slate does not search this folder");
    expect(pluginSource).toContain("requestWorkspaceRoot(nextRoot)");
  });

  it("makes folder removal explicit and keeps the private folder untouched", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Disconnect Slate folder?");
    expect(pluginSource).toContain("Slate will forget this folder's path");
    expect(pluginSource).toContain("The folder and its Markdown files will not change");
    expect(pluginSource).toContain("clearWorkspaceRoot?.()");
  });

  it("owns a private, validated document manager without arbitrary filesystem access", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Manage documents");
    expect(pluginSource).toContain("read_configured_markdown_config");
    expect(pluginSource).toContain("write_configured_markdown_config");
    expect(pluginSource).not.toContain("Move ${label} up");
    expect(pluginSource).not.toContain("Move ${label} down");
    expect(pluginSource).toContain("Remove");
    expect(pluginSource).toContain("Markdown files are never edited");
    expect(pluginSource).toContain("browseMarkdownFile");
  });

  it("gives a remembered but inaccessible folder a specific recovery path", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    expect(pluginSource).toContain("Workshop has access to it");
    expect(pluginSource).toContain("Change Slate folder to try again");
    expect(pluginSource).toContain("keep the last good view");
  });

  it("does not bundle a Tauri opener plugin", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("@tauri-apps/plugin-opener");
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("@tauri-apps/plugin-dialog");
  });

  it("publishes explicit MIT package metadata with the canonical copyright", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { license?: string };
    const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
    expect(packageJson.license).toBe("MIT");
    expect(license).toContain("Copyright (c) 2026 Lindsay Brunner");
  });
});
