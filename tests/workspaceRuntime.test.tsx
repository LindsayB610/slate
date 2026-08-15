// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  config: {
    version: 1,
    sources: [{ id: "notes", label: "Notes", path: "/private/notes.md", view: "markdown" }],
  },
  readConfigFailures: 0,
  writeError: undefined as string | undefined,
  metadataByRoot: {} as Partial<Record<string, Array<{ id: string; label: string; view: "markdown" | "markdown-tabs" | "table" | "table-tabs" }>>>,
  snapshotsByRoot: {} as Partial<Record<string, Record<string, { contents: string; updatedAt: number }>>>,
  pendingMetadataByRoot: {} as Partial<Record<string, Promise<Array<{ id: string; label: string; view: "markdown" | "markdown-tabs" | "table" | "table-tabs" }>>>>,
  pendingWatchByRoot: {} as Partial<Record<string, Promise<void>>>,
  metadataErrorRoots: new Set<string>(),
}));

const invoke = vi.hoisted(() => vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (command === "read_configured_markdown_sources") {
    const root = String(args?.workspaceRoot ?? "");
    if (host.metadataErrorRoots.has(root)) throw new Error("Folder access denied");
    if (host.pendingMetadataByRoot[root]) return host.pendingMetadataByRoot[root];
    if (host.metadataByRoot[root]) return host.metadataByRoot[root];
    return host.config.sources.map(({ id, label, view }) => ({ id, label, view }));
  }
  if (command === "read_configured_markdown_source") {
    const root = String(args?.workspaceRoot ?? "");
    const source = String(args?.source ?? "");
    return host.snapshotsByRoot[root]?.[source] ?? { contents: "# Notes", updatedAt: 1 };
  }
  if (command === "start_configured_markdown_watch") {
    const root = String(args?.workspaceRoot ?? "");
    return host.pendingWatchByRoot[root] ?? undefined;
  }
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
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    host.config = {
      version: 1,
      sources: [{ id: "notes", label: "Notes", path: "/private/notes.md", view: "markdown" }],
    };
    host.readConfigFailures = 0;
    host.writeError = undefined;
    host.metadataByRoot = {};
    host.snapshotsByRoot = {};
    host.pendingMetadataByRoot = {};
    host.pendingWatchByRoot = {};
    host.metadataErrorRoots.clear();
    invoke.mockClear();
  });
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("acknowledges a folder request while waiting for the host to apply it", () => {
    render(<WorkshopToolView requestWorkspaceRoot={() => ({ ok: true })} />);
    fireEvent.change(screen.getByLabelText("Folder containing slate.config.json"), { target: { value: "/private/slate" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    expect(screen.getByRole("status").textContent).toContain("Folder selected");
    expect(screen.getByRole("button", { name: "Connecting…" }).hasAttribute("disabled")).toBe(true);
  });

  it("submits the folder path through the setup form", () => {
    const requestWorkspaceRoot = vi.fn(() => ({ ok: true } as const));
    render(<WorkshopToolView requestWorkspaceRoot={requestWorkspaceRoot} />);
    const input = screen.getByLabelText("Folder containing slate.config.json");
    fireEvent.change(input, { target: { value: "/private/slate" } });

    expect(input.closest("form")).not.toBeNull();
    fireEvent.submit(input.closest("form")!);

    expect(requestWorkspaceRoot).toHaveBeenCalledWith("/private/slate");
    expect(screen.getByRole("status").textContent).toContain("Folder selected");
  });

  it("asks Workshop to browse for a folder and connects the selected root", async () => {
    const requestWorkspaceRoot = vi.fn();
    function HostHarness() {
      const [root, setRoot] = useState<string>();
      requestWorkspaceRoot.mockImplementation((requested?: string) => {
        setRoot(requested);
        return { ok: true } as const;
      });
      return <WorkshopToolView workspaceRoot={root} requestWorkspaceRoot={requestWorkspaceRoot} browseWorkspaceRoot={() => ({ ok: true, root: "/private/browsed-slate" })} />;
    }
    render(<HostHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Browse for Slate folder" }));

    expect(requestWorkspaceRoot).not.toHaveBeenCalled();
    expect((await screen.findByRole("status")).textContent).toContain("Folder selected");
    expect((screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement).value).toBe("/private/browsed-slate");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Connect folder" })));
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    expect(requestWorkspaceRoot).toHaveBeenCalledWith("/private/browsed-slate");
    expect((await screen.findByRole("status")).textContent).toContain("Slate folder connected");
    expect(await screen.findByRole("button", { name: "Manage documents" })).toBeTruthy();
  });

  it("returns to the editable setup when folder browsing is canceled", async () => {
    let finishBrowse: (() => void) | undefined;
    const browseWorkspaceRoot = vi.fn(() => new Promise<void>((resolve) => { finishBrowse = resolve; }));
    render(<WorkshopToolView requestWorkspaceRoot={() => ({ ok: true })} browseWorkspaceRoot={browseWorkspaceRoot} />);

    fireEvent.click(screen.getByRole("button", { name: "Browse for Slate folder" }));
    expect(screen.getByRole("status").textContent).toContain("Opening folder browser");
    expect(screen.getByRole("button", { name: "Browsing…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Connect folder" }).hasAttribute("disabled")).toBe(true);

    finishBrowse?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Browse for Slate folder" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement).hasAttribute("disabled")).toBe(false);
  });

  it("keeps the typed path when Workshop cannot browse for a folder", async () => {
    const browseWorkspaceRoot = vi.fn(() => ({ ok: false, message: "Workshop couldn't open the folder browser." } as const));
    render(<WorkshopToolView requestWorkspaceRoot={() => ({ ok: true })} browseWorkspaceRoot={browseWorkspaceRoot} />);
    fireEvent.change(screen.getByLabelText("Folder containing slate.config.json"), { target: { value: "/private/draft" } });

    fireEvent.click(screen.getByRole("button", { name: "Browse for Slate folder" }));

    expect((await screen.findByRole("alert")).textContent).toContain("couldn't open the folder browser");
    expect((screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement).value).toBe("/private/draft");
    expect(screen.getByRole("button", { name: "Browse for Slate folder" }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps the setup editable when Workshop rejects the folder", () => {
    render(<WorkshopToolView requestWorkspaceRoot={() => ({ ok: false, message: "That folder is unavailable." })} />);
    fireEvent.change(screen.getByLabelText("Folder containing slate.config.json"), { target: { value: "/private/missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    expect(screen.getByRole("alert").textContent).toContain("That folder is unavailable.");
    expect(screen.getByRole("button", { name: "Connect folder" }).hasAttribute("disabled")).toBe(false);
    expect((screen.getByLabelText("Folder containing slate.config.json") as HTMLInputElement).value).toBe("/private/missing");
  });

  it("confirms the connection after Workshop applies the selected folder", async () => {
    function HostHarness() {
      const [root, setRoot] = useState<string>();
      return <WorkshopToolView workspaceRoot={root} requestWorkspaceRoot={(next) => { setRoot(next); return { ok: true }; }} />;
    }
    render(<HostHarness />);
    fireEvent.change(screen.getByLabelText("Folder containing slate.config.json"), { target: { value: "/private/slate" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    const confirmation = await screen.findByTestId("workspace-confirmation");
    expect(confirmation.getAttribute("data-state")).toBe("success");
    expect(screen.getByRole("status").textContent).toContain("Slate folder connected");
    expect(confirmation.textContent).toContain("✓");
    expect(await screen.findByRole("button", { name: "Manage documents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss folder confirmation" }).closest('[role="status"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss folder confirmation" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the pending folder state neutral until loading and watching succeed", async () => {
    let finishMetadata: ((sources: Array<{ id: string; label: string; view: "markdown" }>) => void) | undefined;
    let finishWatch: (() => void) | undefined;
    host.pendingMetadataByRoot["/private/slate"] = new Promise((resolve) => { finishMetadata = resolve; });
    host.pendingWatchByRoot["/private/slate"] = new Promise((resolve) => { finishWatch = resolve; });
    function HostHarness() {
      const [root, setRoot] = useState<string>();
      return <WorkshopToolView workspaceRoot={root} requestWorkspaceRoot={(next) => { setRoot(next); return { ok: true }; }} />;
    }
    render(<HostHarness />);
    fireEvent.change(screen.getByLabelText("Folder containing slate.config.json"), { target: { value: "/private/slate" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    const pending = await screen.findByTestId("workspace-confirmation");
    expect(pending.getAttribute("data-state")).toBe("loading");
    expect(pending.textContent).not.toContain("✓");
    expect(screen.queryByRole("button", { name: "Dismiss folder confirmation" })).toBeNull();

    finishMetadata?.([{ id: "notes", label: "Notes", view: "markdown" }]);
    await screen.findByText("Notes");
    expect(screen.getByTestId("workspace-confirmation").getAttribute("data-state")).toBe("loading");
    finishWatch?.();
    await waitFor(() => expect(screen.getByTestId("workspace-confirmation").getAttribute("data-state")).toBe("success"));
    expect(screen.getByTestId("workspace-confirmation").textContent).toContain("✓");
  });

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

  it("lets Workshop refresh access to the already connected folder", async () => {
    const requestWorkspaceRoot = await renderConnected();

    fireEvent.click(screen.getByRole("button", { name: "Change Slate folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    expect(requestWorkspaceRoot).toHaveBeenCalledWith("/private/slate");
    expect((await screen.findByRole("status")).textContent).toContain("Slate folder connected");
    expect(await screen.findByRole("button", { name: "Manage documents" })).toBeTruthy();
    expect(invoke.mock.calls.filter(([command]) => command === "start_configured_markdown_watch")).toHaveLength(2);
  });

  it("reports a failed same-folder access refresh without restoring stale documents", async () => {
    const requestWorkspaceRoot = await renderConnected();
    host.metadataErrorRoots.add("/private/slate");

    fireEvent.click(screen.getByRole("button", { name: "Change Slate folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect folder" }));

    expect(requestWorkspaceRoot).toHaveBeenCalledWith("/private/slate");
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't open this folder");
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.queryByTestId("workspace-confirmation")).toBeNull();
  });

  it("hides every source and snapshot from the previous private folder while a replacement loads", async () => {
    host.metadataByRoot["/private/one"] = [{ id: "secret", label: "Private one", view: "markdown" }];
    host.snapshotsByRoot["/private/one"] = { secret: { contents: "# Private material\nOld-folder secret", updatedAt: 1 } };
    let finishReplacement: ((sources: Array<{ id: string; label: string; view: "markdown" }>) => void) | undefined;
    host.pendingMetadataByRoot["/private/two"] = new Promise((resolve) => { finishReplacement = resolve; });
    host.snapshotsByRoot["/private/two"] = { secret: { contents: "# Replacement\nNew-folder material", updatedAt: 2 } };
    const requestWorkspaceRoot = vi.fn();
    const view = render(<WorkshopToolView workspaceRoot="/private/one" requestWorkspaceRoot={requestWorkspaceRoot} />);

    fireEvent.click((await screen.findByText("Private one")).closest("button")!);
    expect(await screen.findByText("Old-folder secret")).toBeTruthy();

    view.rerender(<WorkshopToolView workspaceRoot="/private/two" requestWorkspaceRoot={requestWorkspaceRoot} />);
    expect(screen.queryByText("Old-folder secret")).toBeNull();
    expect(screen.queryByText("Private one")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading configured documents");

    finishReplacement?.([{ id: "secret", label: "Replacement", view: "markdown" }]);
    fireEvent.click((await screen.findByText("Replacement")).closest("button")!);
    expect(await screen.findByText("New-folder material")).toBeTruthy();
    expect(screen.queryByText("Old-folder secret")).toBeNull();
  });

  it("removes the previous folder's private configuration editor when the workspace changes", async () => {
    host.config = {
      version: 1,
      sources: [{ id: "private-notes", label: "Private notes", path: "/private/one/private-notes.md", view: "markdown" }],
    };
    host.metadataByRoot["/private/one"] = [{ id: "private-notes", label: "Private notes", view: "markdown" }];
    host.pendingMetadataByRoot["/private/two"] = new Promise(() => undefined);
    const requestWorkspaceRoot = vi.fn();
    const view = render(<WorkshopToolView workspaceRoot="/private/one" requestWorkspaceRoot={requestWorkspaceRoot} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage documents" }));
    expect(await screen.findByDisplayValue("/private/one/private-notes.md")).toBeTruthy();

    view.rerender(<WorkshopToolView workspaceRoot="/private/two" requestWorkspaceRoot={requestWorkspaceRoot} />);

    expect(screen.queryByDisplayValue("/private/one/private-notes.md")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Manage documents" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading configured documents");
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
