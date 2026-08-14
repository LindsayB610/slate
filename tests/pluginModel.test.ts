import { describe, expect, it } from "vitest";
import { clearSlateFavoriteSourceIds, describeSlateView, externalLinkFailureMessage, isSlateTauriRuntime, keepLatestSnapshot, loadSlateFavoriteSourceIds, openSlateExternalUrl, parseInlineMarkdown, partitionSlateSources, releaseIfDisposed, retainSelectedSource, saveSlateFavoriteSourceIds, shouldRefreshSource, slateFavoriteStorageKey, slateHeadingTag, slateLinkTarget, sortTableRows, toggleSlateFavoriteSourceId, validateSourceMetadata } from "../src/pluginModel.js";

describe("Slate plugin refresh boundary", () => {
  it("describes each Slate-owned source view for the source picker", () => {
    expect(describeSlateView("markdown-tabs")).toEqual({ glyph: "☷", description: "Tabbed Markdown reference" });
    expect(describeSlateView("table-tabs")).toEqual({ glyph: "▤", description: "Tabbed sortable tables" });
    expect(describeSlateView("markdown")).toEqual({ glyph: "≡", description: "Markdown reference" });
    expect(describeSlateView("table")).toEqual({ glyph: "▦", description: "Sortable table" });
  });

  it("preserves Markdown heading hierarchy beneath Slate's page title", () => {
    expect(slateHeadingTag(1)).toBe("h2");
    expect(slateHeadingTag(2)).toBe("h3");
    expect(slateHeadingTag(3)).toBe("h4");
    expect(slateHeadingTag(6)).toBe("h4");
  });

  it("accepts only unique Slate-owned source metadata and supported views", () => {
    expect(validateSourceMetadata([])).toEqual([]);
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "table-tabs" }])).toEqual([{ id: "tasks", label: "Tasks", view: "table-tabs" }]);
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "unknown" }])).toBeNull();
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "markdown" }, { id: "tasks", label: "Again", view: "table" }])).toBeNull();
  });

  it("refreshes only events for its root and configuration file", () => {
    expect(shouldRefreshSource("/private/slate/", { root: "/private/slate", configFile: "slate.config.json", source: "tasks" }, "slate.config.json")).toBe(true);
    expect(shouldRefreshSource("/private/slate", { root: "/private/other", configFile: "slate.config.json", source: "tasks" }, "slate.config.json")).toBe(false);
    expect(shouldRefreshSource("/private/slate", { root: "/private/slate", configFile: "other.json", source: "tasks" }, "slate.config.json")).toBe(false);
  });

  it("returns to the source picker when a selected source is removed", () => {
    const sources = [{ id: "tasks", label: "Tasks", view: "markdown" as const }];
    expect(retainSelectedSource("tasks", sources)).toBe("tasks");
    expect(retainSelectedSource("gone", sources)).toBeUndefined();
    expect(retainSelectedSource(undefined, sources)).toBeUndefined();
  });

  it("keeps the last good source through a failed read and ignores stale atomic-save reads", () => {
    const current = { tasks: { contents: "old", updatedAt: 1 } };
    expect(keepLatestSnapshot(current, "tasks", 2, 2, null)).toEqual(current);
    expect(keepLatestSnapshot(current, "tasks", 2, 3, { contents: "stale", updatedAt: 2 })).toEqual(current);
    expect(keepLatestSnapshot(current, "tasks", 3, 3, { contents: "new", updatedAt: 3 })).toEqual({ tasks: { contents: "new", updatedAt: 3 } });
  });

  it("releases a watcher that resolves after the view has already disposed", () => {
    let released = 0;
    expect(releaseIfDisposed(true, () => { released += 1; })).toBe(true);
    expect(released).toBe(1);
    expect(releaseIfDisposed(false, () => { released += 1; })).toBe(false);
    expect(released).toBe(1);
  });
});

describe("Slate table sorting", () => {
  it("sorts values naturally in both directions without mutating the input", () => {
    const rows = [["Item 10"], ["item 2"], ["Item 1"]];
    expect(sortTableRows(rows, 0, "ascending")).toEqual([["Item 1"], ["item 2"], ["Item 10"]]);
    expect(sortTableRows(rows, 0, "descending")).toEqual([["Item 10"], ["item 2"], ["Item 1"]]);
    expect(rows).toEqual([["Item 10"], ["item 2"], ["Item 1"]]);
  });
});

describe("Slate source favorites", () => {
  const sources = [
    { id: "zeta", label: "Zeta", view: "markdown" as const },
    { id: "bravo", label: "Bravo 10", view: "table" as const },
    { id: "alpha", label: "Alpha 2", view: "markdown-tabs" as const },
    { id: "bravo-2", label: "Bravo 2", view: "table-tabs" as const },
  ];

  it("alphabetizes favorites and remaining documents without duplication", () => {
    expect(partitionSlateSources(sources, ["zeta", "bravo-2"])).toEqual({
      favorites: [sources[3], sources[0]],
      documents: [sources[2], sources[1]],
    });
  });

  it("drops stale favorites so an empty favorites shelf is never rendered", () => {
    expect(partitionSlateSources(sources, ["removed"])).toEqual({
      favorites: [],
      documents: [sources[2], sources[3], sources[1], sources[0]],
    });
  });

  it("toggles favorite ids without changing source configuration", () => {
    expect(toggleSlateFavoriteSourceId(["zeta"], "alpha")).toEqual(["zeta", "alpha"]);
    expect(toggleSlateFavoriteSourceId(["zeta", "alpha"], "alpha")).toEqual(["zeta"]);
  });

  it("persists only favorite ids per normalized workspace and survives corrupt storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const key = slateFavoriteStorageKey("/private/slate/");
    saveSlateFavoriteSourceIds(storage, "/private/slate/", ["alpha", "zeta"]);
    expect(key).toBe(slateFavoriteStorageKey("/private/slate"));
    expect(loadSlateFavoriteSourceIds(storage, "/private/slate")).toEqual(["alpha", "zeta"]);
    values.set(key, "not json");
    expect(loadSlateFavoriteSourceIds(storage, "/private/slate")).toEqual([]);
  });

  it("forgets folder-scoped favorites when that folder is explicitly disconnected", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    saveSlateFavoriteSourceIds(storage, "/private/slate", ["alpha"]);
    clearSlateFavoriteSourceIds(storage, "/private/slate");
    expect(loadSlateFavoriteSourceIds(storage, "/private/slate")).toEqual([]);
  });
});

describe("Slate inline Markdown", () => {
  it("renders bold text and safe links while leaving unsafe links as text", () => {
    expect(parseInlineMarkdown("Read **this** and [visit](https://example.com).")).toEqual([
      { type: "text", value: "Read " }, { type: "strong", value: "this" }, { type: "text", value: " and " }, { type: "link", label: "visit", href: "https://example.com" }, { type: "text", value: "." },
    ]);
    expect(parseInlineMarkdown("[bad](javascript:alert)")).toEqual([{ type: "text", value: "[bad](javascript:alert)" }]);
  });
});

describe("Slate external links", () => {
  it("uses the native host only inside Tauri", () => {
    expect(isSlateTauriRuntime({})).toBe(false);
    expect(isSlateTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(slateLinkTarget({})).toBe("_blank");
    expect(slateLinkTarget({ __TAURI_INTERNALS__: {} })).toBeUndefined();
  });

  it("invokes Workshop's generic opener and returns a visible failure message", async () => {
    const open = async () => undefined;
    expect(await openSlateExternalUrl("https://example.com", open)).toBeUndefined();
    expect(await openSlateExternalUrl("https://example.com", async () => { throw new Error("Older Workshop"); })).toBe(externalLinkFailureMessage);
  });
});
