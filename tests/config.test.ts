import { describe, expect, it } from "vitest";
import { parseSlateConfig, slatePluginManifest, workshopPluginDeclaration } from "../src/index.js";

describe("Slate configuration", () => {
  it("accepts any number of uniquely identified local Markdown sources in the supported view formats", () => {
    expect(parseSlateConfig(JSON.stringify({
      version: 1,
      sources: [
        { id: "tasks", label: "Tasks", path: "/private/tasks.md", view: "markdown-tabs" },
        { id: "notes", label: "Notes", path: "/private/notes.md", view: "markdown" },
        { id: "inventory", label: "Inventory", path: "/private/inventory.md", view: "table" },
        { id: "archive", label: "Archive", path: "/private/archive.md", view: "markdown" }
      ]
    }))).toMatchObject({ ok: true, config: { version: 1, sources: expect.arrayContaining([expect.objectContaining({ id: "archive", view: "markdown" })]) } });
  });

  it.each([
    ["no sources", { version: 1, sources: [] }],
    ["duplicate ids", { version: 1, sources: [{ id: "same", label: "One", path: "/private/one.md", view: "markdown" }, { id: "same", label: "Two", path: "/private/two.md", view: "table" }] }],
    ["duplicate paths", { version: 1, sources: [{ id: "one", label: "One", path: "/private/shared.md", view: "markdown" }, { id: "two", label: "Two", path: "/private/shared.md", view: "table" }] }],
    ["unsupported view", { version: 1, sources: [{ id: "one", label: "One", path: "/private/one.md", view: "html" }] }],
    ["relative path", { version: 1, sources: [{ id: "one", label: "One", path: "one.md", view: "markdown" }] }]
  ])("rejects %s", (_label, value) => {
    expect(parseSlateConfig(JSON.stringify(value))).toMatchObject({ ok: false });
  });
});

describe("Slate plugin contract", () => {
  it("declares its own configuration file and only generic host capabilities", () => {
    expect(slatePluginManifest).toEqual({
      id: "slate",
      displayName: "Slate",
      configFile: "slate.config.json",
      hostCapabilities: ["read-configured-markdown", "watch-configured-markdown"],
    });
  });

  it("keeps the Workshop-facing declaration in the Slate package", () => {
    expect(workshopPluginDeclaration).toMatchObject({
      id: "slate",
      configFile: "slate.config.json",
      runtime: { entryPoint: "read-configured-markdown-source" },
    });
  });
});
