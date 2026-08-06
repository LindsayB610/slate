import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkshopToolView, workshopPluginDeclaration } from "../src/index.js";

describe("Slate Workshop plugin surface", () => {
  it("declares the versioned plugin contract and its own navigation", () => {
    expect(workshopPluginDeclaration).toMatchObject({
      contractVersion: 1,
      id: "slate",
      navigationMode: "plugin",
      status: "planned",
      privateWorkspace: { requiredFields: ["slate.config.json"] },
      requiredLocalCapabilities: ["local-workspace"],
    });
  });

  it("renders a neutral private-workspace setup view without reading a source", () => {
    const markup = renderToStaticMarkup(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
    expect(markup).toContain("Slate private folder");
    expect(markup).toContain("Connect Slate");
  });
});
