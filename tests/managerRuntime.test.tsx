// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkshopToolView } from "../src/index.js";

function openManager() {
  render(<WorkshopToolView requestWorkspaceRoot={() => undefined} />);
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
    expect(screen.getByText(/Arrows change configuration order; Slate home stays alphabetical/)).toBeTruthy();
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

  it("reorders the configuration and protects unsaved edits on exit", () => {
    openManager();
    const index = screen.getByRole("navigation", { name: "Configured documents" });
    const labels = () => within(index).getAllByRole("button", { name: /^Edit / }).map((button) => button.getAttribute("aria-label"));
    expect(labels().slice(0, 2)).toEqual(["Edit Tasks", "Edit Notes"]);

    fireEvent.click(screen.getByRole("button", { name: "Move Tasks down" }));
    expect(labels().slice(0, 2)).toEqual(["Edit Notes", "Edit Tasks"]);
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
