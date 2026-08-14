// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  config: {
    version: 1,
    sources: [{ id: "notes", label: "Notes", path: "/private/notes.md", view: "markdown" }],
  },
  readConfigFailures: 0,
  writeError: undefined as string | undefined,
}));

const invoke = vi.hoisted(() => vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (command === "read_configured_markdown_sources") {
    return host.config.sources.map(({ id, label, view }) => ({ id, label, view }));
  }
  if (command === "read_configured_markdown_source") return { contents: "# Notes", updatedAt: 1 };
  if (command === "start_configured_markdown_watch") return undefined;
  if (command === "read_configured_markdown_config") {
    if (host.readConfigFailures > 0) {
      host.readConfigFailures -= 1;
      throw new Error("Documents access expired");
    }
    return structuredClone(host.config);
  }
  if (command === "write_configured_markdown_config") {
    if (host.writeError) throw new Error(host.writeError);
    host.config = structuredClone(args?.config as typeof host.config);
    return structuredClone(host.config);
  }
  throw new Error(`Unexpected command: ${command}`);
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

import { WorkshopToolView } from "../src/index.js";

async function renderConnected() {
  const requestWorkspaceRoot = vi.fn();
  render(<WorkshopToolView workspaceRoot="/private/slate" requestWorkspaceRoot={requestWorkspaceRoot} />);
  await screen.findByRole("button", { name: "Manage documents" });
  return requestWorkspaceRoot;
}

describe("connected Slate workspace controls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    host.config = {
      version: 1,
      sources: [{ id: "notes", label: "Notes", path: "/private/notes.md", view: "markdown" }],
    };
    host.readConfigFailures = 0;
    host.writeError = undefined;
    invoke.mockClear();
  });
  afterEach(() => cleanup());

  it("returns from Change Slate folder without retaining an abandoned candidate", async () => {
    const requestWorkspaceRoot = await renderConnected();

    fireEvent.click(screen.getByRole("button", { name: "Change Slate folder" }));
    const input = screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement;
    expect(input.value).toBe("/private/slate");

    fireEvent.change(input, { target: { value: "/private/other" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to Slate" }));
    fireEvent.click(screen.getByRole("button", { name: "Change Slate folder" }));

    expect((screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement).value).toBe("/private/slate");
    expect(requestWorkspaceRoot).not.toHaveBeenCalled();
  });

  it("loads and saves through the generic configured-Markdown host boundary", async () => {
    await renderConnected();
    fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));
    await screen.findByDisplayValue("Notes");

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Reference notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));

    await screen.findByRole("heading", { name: "Slate" });
    expect(invoke).toHaveBeenCalledWith("read_configured_markdown_config", {
      workspaceRoot: "/private/slate",
      configFile: "slate.config.json",
    });
    expect(invoke).toHaveBeenCalledWith("write_configured_markdown_config", {
      workspaceRoot: "/private/slate",
      configFile: "slate.config.json",
      config: {
        version: 1,
        sources: [{ id: "notes", label: "Reference notes", path: "/private/notes.md", view: "markdown" }],
      },
    });
  });

  it("recovers from a configuration load failure through an explicit retry", async () => {
    await renderConnected();
    host.readConfigFailures = 1;
    fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Slate couldn’t load this configuration.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByDisplayValue("Notes")).toBeTruthy();
    expect(invoke.mock.calls.filter(([command]) => command === "read_configured_markdown_config")).toHaveLength(2);
  });

  it("keeps an unsaved draft visible after a native save failure and can retry", async () => {
    await renderConnected();
    fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));
    await screen.findByDisplayValue("Notes");
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Draft label" } });
    host.writeError = "Permission denied";

    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Slate couldn’t save these documents.");
    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("Draft label");

    host.writeError = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));
    await screen.findByRole("heading", { name: "Slate" });
    expect(host.config.sources[0]?.label).toBe("Draft label");
  });

  it("accepts an intentionally empty configuration and returns to Slate's empty state", async () => {
    await renderConnected();
    fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));
    await screen.findByDisplayValue("Notes");

    fireEvent.click(screen.getByRole("button", { name: "Remove Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from Slate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));

    expect(await screen.findByRole("heading", { name: "No documents configured" })).toBeTruthy();
    await waitFor(() => expect(host.config.sources).toEqual([]));
    expect(screen.queryByText(/couldn't open this folder/i)).toBeNull();
  });
});
