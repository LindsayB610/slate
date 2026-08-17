// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkshopToolView } from "../src/index.js";

function openManager(browseMarkdownFile?: Parameters<typeof WorkshopToolView>[0]["browseMarkdownFile"]) {
  render(<WorkshopToolView requestWorkspaceRoot={() => undefined} browseMarkdownFile={browseMarkdownFile} />);
  fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));
}

describe("mounted document manager", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("uses a focused master-detail editor instead of rendering every form at once", () => {
    openManager();

    expect(screen.getByRole("heading", { name: "Manage documents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Slate" })).toBeTruthy();
    const index = screen.getByRole("navigation", { name: "Configured documents" });
    expect(within(index).getAllByRole("button", { name: /^Edit / })).toHaveLength(6);
    expect(screen.getAllByLabelText("Label")).toHaveLength(1);
    expect(screen.getAllByLabelText("Absolute Markdown path")).toHaveLength(1);
    expect(document.querySelector(".slate-plugin-manager-layout")).toBeTruthy();
    expect(document.querySelector(".slate-plugin-manager-footer")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Move .* (up|down)$/ })).toHaveLength(0);
  });

  it("passes an automated accessibility scan in its primary editing state", async () => {
    openManager(() => ({ ok: true, path: "/preview/selected.md" }));

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
  });

  it("uses native form submission for document edits without turning secondary actions into submits", async () => {
    openManager();
    const label = screen.getByLabelText("Label") as HTMLInputElement;
    const form = label.closest("form");
    expect(form).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save documents" }).getAttribute("type")).toBe("submit");
    for (const button of within(form!).getAllByRole("button").filter((item) => item.textContent !== "Save documents")) {
      expect(button.getAttribute("type")).toBe("button");
    }

    fireEvent.change(label, { target: { value: "Renamed tasks" } });
    fireEvent.submit(form!);

    expect(await screen.findByText("Renamed tasks")).toBeTruthy();
    expect(screen.getByText("Preview data — native Workshop uses only your configured local files.")).toBeTruthy();
  });

  it("returns to Slate from the manager", () => {
    openManager();
    fireEvent.click(screen.getByRole("button", { name: "Back to Slate" }));

    expect(screen.getByRole("heading", { name: "Slate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage documents" })).toBeTruthy();
  });

  it("adds, validates, edits, and saves a document without touching a Markdown file", async () => {
    openManager();
    fireEvent.click(screen.getByRole("button", { name: /Add document/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));
    expect(await screen.findByText("Enter an absolute path to a Markdown file.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Field notes" } });
    fireEvent.change(screen.getByLabelText("Absolute Markdown path"), { target: { value: "/preview/field-notes.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));

    expect(await screen.findByText("Field notes")).toBeTruthy();
    expect(screen.getByText("Preview data — native Workshop uses only your configured local files.")).toBeTruthy();
  });

  it("makes native Markdown-file browsing the primary path workflow", async () => {
    const browseMarkdownFile = vi.fn(async () => ({ ok: true, path: "/private/reference-notes.markdown" } as const));
    openManager(browseMarkdownFile);

    expect(screen.getByText("tasks.md")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change Markdown file for Tasks" })).toBeTruthy();
    expect(screen.getByText("Enter path manually").closest("details")?.hasAttribute("open")).toBe(false);

    const browseButton = screen.getByRole("button", { name: "Change Markdown file for Tasks" });
    browseButton.focus();
    fireEvent.click(browseButton);

    expect(await screen.findByText("reference-notes.markdown")).toBeTruthy();
    expect(browseMarkdownFile).toHaveBeenCalledWith("/preview/tasks.md");
    expect(screen.getByRole("status").textContent).toContain("selected");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(browseButton));
  });

  it("keeps the existing file when native browsing is canceled or fails", async () => {
    const browseMarkdownFile = vi.fn()
      .mockResolvedValueOnce({ ok: false, canceled: true })
      .mockResolvedValueOnce({ ok: false, message: "Workshop could not open the file browser." });
    openManager(browseMarkdownFile);

    const browseButton = screen.getByRole("button", { name: "Change Markdown file for Tasks" });
    browseButton.focus();
    fireEvent.click(browseButton);
    await waitFor(() => expect(browseMarkdownFile).toHaveBeenCalledTimes(1));
    expect(screen.getByText("tasks.md")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Change Markdown file for Tasks" }).hasAttribute("disabled")).toBe(false));
    expect(document.activeElement).toBe(browseButton);

    fireEvent.click(screen.getByRole("button", { name: "Change Markdown file for Tasks" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not open the file browser");
    expect(screen.getByText("tasks.md")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(browseButton));
  });

  it("rejects an invalid picker result without replacing the existing draft path", async () => {
    openManager(() => ({ ok: true, path: "../not-a-markdown-file.txt" }));

    fireEvent.click(screen.getByRole("button", { name: "Change Markdown file for Tasks" }));

    expect((await screen.findByRole("alert")).textContent).toContain("absolute path to a Markdown file");
    expect(screen.getByText("tasks.md")).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("keeps picker progress truthful and treats choosing the current file as a no-op", async () => {
    let finishBrowse: ((result: { ok: true; path: string }) => void) | undefined;
    openManager(() => new Promise((resolve) => { finishBrowse = resolve; }));

    fireEvent.click(screen.getByRole("button", { name: "Change Markdown file for Tasks" }));
    expect(screen.getByRole("status").textContent).toContain("Opening file browser");
    const pendingButton = screen.getByRole("button", { name: "Change Markdown file for Tasks" });
    expect(pendingButton.textContent).toBe("Choosing…");
    expect(pendingButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Save documents" }).hasAttribute("disabled")).toBe(true);

    finishBrowse?.({ ok: true, path: "/preview/tasks.md" });
    expect((await screen.findByRole("status")).textContent).toContain("already selected");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("ignores a late picker result after leaving the manager", async () => {
    let finishBrowse: ((result: { ok: true; path: string }) => void) | undefined;
    openManager(() => new Promise((resolve) => { finishBrowse = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Change Markdown file for Tasks" }));

    fireEvent.click(screen.getByRole("button", { name: "Back to Slate" }));
    expect(screen.getByRole("heading", { name: "Slate" })).toBeTruthy();
    finishBrowse?.({ ok: true, path: "/private/late.md" });
    await Promise.resolve();

    expect(screen.getByRole("heading", { name: "Slate" })).toBeTruthy();
    expect(screen.queryByText("late.md")).toBeNull();
  });

  it("retains an explicit manual-path fallback when native browsing is unavailable", () => {
    openManager();

    expect(screen.queryByRole("button", { name: "Change Markdown file for Tasks" })).toBeNull();
    expect(screen.getByText("File browsing is unavailable in this host.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Markdown file" })).toBeTruthy();
    expect((screen.getByLabelText("Absolute Markdown path") as HTMLInputElement).value).toBe("/preview/tasks.md");
  });

  it("opens manual entry as the recovery path when a new document has no file", async () => {
    openManager(() => ({ ok: false, canceled: true }));
    fireEvent.click(screen.getByRole("button", { name: /Add document/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));

    expect(await screen.findByText("Enter an absolute path to a Markdown file.")).toBeTruthy();
    expect(screen.getByLabelText("Absolute Markdown path")).toBeTruthy();
  });

  it("reveals and focuses the editor after selecting or adding a document in a stacked layout", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 480 });
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      openManager();

      fireEvent.click(screen.getByRole("button", { name: "Edit Inventory" }));
      const inventoryHeading = await screen.findByRole("heading", { name: "Inventory" });
      await waitFor(() => expect(document.activeElement).toBe(inventoryHeading));
      expect(scrollIntoView).toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /Add document/ }));
      const newHeading = await screen.findByRole("heading", { name: "Untitled document" });
      await waitFor(() => expect(document.activeElement).toBe(newHeading));
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  });

  it("makes document removal explicit and truthful", () => {
    openManager();
    const removeTrigger = screen.getByRole("button", { name: "Remove Tasks" });
    removeTrigger.focus();
    fireEvent.click(removeTrigger);

    const confirmation = screen.getByRole("alertdialog", { name: "Remove Tasks?" });
    expect(within(confirmation).getByText(/The Markdown file will not be deleted/)).toBeTruthy();
    expect(confirmation.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: "Keep document" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: "Remove from Slate" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: "Keep document" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(removeTrigger);

    fireEvent.click(screen.getByRole("button", { name: "Remove Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from Slate" }));
    expect(screen.queryByRole("button", { name: "Edit Tasks" })).toBeNull();
  });

  it("protects unsaved edits on exit without exposing meaningless source ordering", () => {
    openManager();
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Renamed tasks" } });
    const back = screen.getByRole("button", { name: "Back to Slate" });
    back.focus();
    fireEvent.click(back);

    const confirmation = screen.getByRole("alertdialog", { name: "Discard changes?" });
    expect(within(confirmation).getByText("Your Slate configuration has not been changed.")).toBeTruthy();
    expect(confirmation.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(back);
  });
});
