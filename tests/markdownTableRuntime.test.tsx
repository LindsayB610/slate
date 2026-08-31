// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkshopToolView } from "../src/index.js";
import { slateDemoSnapshots } from "../src/pluginModel.js";

function renderPreview() {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  render(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
}

describe("inline Markdown tables", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("renders and sorts a valid table inside a normal Markdown document without changing its source", () => {
    const original = slateDemoSnapshots.notes.contents;
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Open Notes" }));

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Reference/ })).toBeTruthy();
    expect(within(table).getByRole("cell", { name: "Writing guide" })).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Ready" }).getAttribute("href")).toBe("https://example.com/ready");
    expect(within(table).getByRole("columnheader", { name: /Status/ }).getAttribute("data-align")).toBe("center");
    expect(screen.queryByText("| Reference | Status |", { exact: true })).toBeNull();

    fireEvent.click(within(table).getByRole("button", { name: "Sort Reference ascending" }));
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByRole("cell", { name: "Archive map" })).toBeTruthy();
    expect(slateDemoSnapshots.notes.contents).toBe(original);
  });

  it("keeps an inline table inside its owning Markdown tab", () => {
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Open Tasks" }));

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Project outline" })).toBeTruthy();

    const writingTab = screen.getByRole("tab", { name: /Writing/ });
    fireEvent.mouseDown(writingTab, { button: 0 });
    expect(writingTab.getAttribute("data-state")).toBe("active");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "Current state" })).toBeTruthy();
  });

  it("does not repeat a pipe-less table as summary text in table-tabs", () => {
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Open Reports" }));

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Content strategy" })).toBeTruthy();
    expect(screen.queryByText("Topic | Score", { exact: true })).toBeNull();
    expect(screen.queryByText("Content strategy | 71", { exact: true })).toBeNull();
  });

  it("passes an automated accessibility scan with an inline sortable table", async () => {
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Open Notes" }));

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
  });
});
