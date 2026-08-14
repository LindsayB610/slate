import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkshopToolView } from "../src/index.js";
import { slateHostThemeVariables, slateOwnedSemanticColors, slateThemeFallbacks } from "../src/themeContract.js";

const expectedHostTokens = [
  "canvas",
  "surface",
  "surface-raised",
  "border",
  "text",
  "text-muted",
  "accent",
  "accent-strong",
  "accent-warm",
  "focus-ring",
  "success",
  "warning",
  "danger",
  "gradient-start",
  "gradient-middle",
  "gradient-end",
] as const;

describe("Slate host theme contract", () => {
  it("maps every supported Workshop semantic token to an explicit standalone fallback", () => {
    expect(Object.keys(slateHostThemeVariables)).toEqual(expectedHostTokens);
    for (const token of expectedHostTokens) {
      expect(slateHostThemeVariables[token]).toBe(
        `var(--workshop-${token}, ${slateThemeFallbacks[token]})`,
      );
      expect(slateThemeFallbacks[token]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("keeps the current Slate visual treatment as the no-host fallback", () => {
    expect(slateThemeFallbacks).toMatchObject({
      canvas: "#070708",
      surface: "#111113",
      "surface-raised": "#171719",
      border: "#454147",
      text: "#f6f3f4",
      "text-muted": "#aaa7ab",
      accent: "#f81b8f",
      "accent-strong": "#ff79b9",
      "accent-warm": "#ffe500",
      "focus-ring": "#ffe500",
    });
  });

  it("keeps the favorite affordance recognizably yellow across host palettes", () => {
    expect(slateOwnedSemanticColors.favorite).toBe("#ffe500");
    expect(slateOwnedSemanticColors.favorite).not.toContain("workshop");
  });

  it("renders the embedded-token path and every no-host fallback into Slate's scoped stylesheet", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkshopToolView, { requestWorkspaceRoot: () => undefined }),
    );
    for (const token of expectedHostTokens) {
      expect(markup).toContain(`var(--workshop-${token}, ${slateThemeFallbacks[token]})`);
    }
    expect(markup).toContain(".slate-plugin{");
    expect(markup).toContain("background:var(--slate-canvas)");
    expect(markup).toContain("outline:2px solid var(--slate-focus)");
    expect(markup).toContain(`--slate-favorite:${slateOwnedSemanticColors.favorite}`);
    expect(markup).toContain("[aria-pressed=true]{color:var(--slate-favorite)!important}");
  });

  it("scopes theme consumption to Slate and does not import Workshop implementation", () => {
    const pluginSource = readFileSync(new URL("../src/plugin.tsx", import.meta.url), "utf8");
    const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    expect(pluginSource).toContain(".slate-plugin{");
    expect(pluginSource).not.toMatch(/from ["'][^"']*workshop/i);
    expect(packageSource).not.toMatch(/"(?:@[^"/]+\/)?workshop[^"\n]*"\s*:/i);
  });

  it("documents progressive inheritance and standalone behavior for consumers", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("Progressive theme inheritance");
    expect(readme).toContain("--workshop-canvas");
    expect(readme).toContain("standalone fallbacks");
  });
});
