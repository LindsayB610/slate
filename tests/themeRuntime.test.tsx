// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkshopToolView } from "../src/index.js";
import { slateOwnedSemanticColors, slateThemeFallbacks } from "../src/themeContract.js";

function renderPreview(hostStyle?: Record<string, string>) {
  const host = document.createElement("div");
  for (const [property, value] of Object.entries(hostStyle ?? {})) {
    host.style.setProperty(property, value);
  }
  document.body.append(host);
  return { host, ...render(<WorkshopToolView requestWorkspaceRoot={() => undefined} />, { container: host }) };
}

function slateStyles(): HTMLStyleElement {
  const style = document.querySelector(".slate-plugin style");
  if (!(style instanceof HTMLStyleElement)) throw new Error("Slate's scoped stylesheet was not mounted.");
  return style;
}

describe("mounted Slate host theme behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(() => cleanup());

  it("keeps every standalone fallback mounted when the host supplies no tokens", () => {
    renderPreview();
    const css = slateStyles().textContent ?? "";
    for (const [token, fallback] of Object.entries(slateThemeFallbacks)) {
      expect(css).toContain(`var(--workshop-${token}, ${fallback})`);
    }
  });

  it("inherits live host tokens without remounting Slate", () => {
    const { host } = renderPreview({
      "--workshop-canvas": "#052f34",
      "--workshop-accent": "#4de5d3",
    });
    const slate = screen.getByRole("main");
    expect(host.contains(slate)).toBe(true);
    expect(host.style.getPropertyValue("--workshop-accent")).toBe("#4de5d3");
    expect(slateStyles().textContent).toContain(
      `--slate-accent:var(--workshop-accent, ${slateThemeFallbacks.accent})`,
    );

    host.style.setProperty("--workshop-accent", "#ff9f43");

    expect(host.style.getPropertyValue("--workshop-accent")).toBe("#ff9f43");
    expect(host.contains(slate)).toBe(true);
  });

  it("does not recolor filled favorite stars with the host warm accent", () => {
    renderPreview({ "--workshop-accent-warm": "#ffca6a" });
    fireEvent.click(screen.getByRole("button", { name: "Add Tasks to favorites" }));

    expect(screen.getByRole("button", { name: "Remove Tasks from favorites" }).getAttribute("aria-pressed")).toBe("true");
    const css = slateStyles().textContent ?? "";
    expect(css).toContain(`--slate-favorite:${slateOwnedSemanticColors.favorite}`);
    expect(css).toContain("[aria-pressed=true]{color:var(--slate-favorite)!important}");
  });

  it("keeps portaled table tooltips inside Slate's themed subtree", async () => {
    renderPreview();
    const inventory = screen.getByText("Inventory").closest("button");
    if (!inventory) throw new Error("Inventory source button was not mounted.");
    fireEvent.click(inventory);
    const sort = screen.getByRole("button", { name: "Sort Category ascending" });
    fireEvent.focus(sort);

    const tooltip = await waitFor(() => screen.getByRole("tooltip"), { timeout: 1_500 });
    const slate = screen.getByRole("main");
    expect(slate.contains(tooltip)).toBe(true);

    const css = slateStyles().textContent ?? "";
    expect(css).toContain(".slate-plugin-tooltip{background:var(--slate-text)");
    expect(css).toContain("color:var(--slate-canvas)");
    expect(css).toContain(".slate-plugin-tooltip-arrow{fill:var(--slate-text)}");
  });
});
