import { describe, expect, it } from "vitest";
import { keepLatestSnapshot, shouldRefreshSource, validateSourceMetadata } from "../src/pluginModel.js";

describe("Slate plugin refresh boundary", () => {
  it("accepts only unique Slate-owned source metadata and supported views", () => {
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "markdown" }])).toEqual([{ id: "tasks", label: "Tasks", view: "markdown" }]);
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "unknown" }])).toBeNull();
    expect(validateSourceMetadata([{ id: "tasks", label: "Tasks", view: "markdown" }, { id: "tasks", label: "Again", view: "table" }])).toBeNull();
  });

  it("refreshes only events for its root and configuration file", () => {
    expect(shouldRefreshSource("/private/slate/", { root: "/private/slate", configFile: "slate.config.json", source: "tasks" }, "slate.config.json")).toBe(true);
    expect(shouldRefreshSource("/private/slate", { root: "/private/other", configFile: "slate.config.json", source: "tasks" }, "slate.config.json")).toBe(false);
    expect(shouldRefreshSource("/private/slate", { root: "/private/slate", configFile: "other.json", source: "tasks" }, "slate.config.json")).toBe(false);
  });

  it("keeps the last good source through a failed read and ignores stale atomic-save reads", () => {
    const current = { tasks: { contents: "old", updatedAt: 1 } };
    expect(keepLatestSnapshot(current, "tasks", 2, 2, null)).toEqual(current);
    expect(keepLatestSnapshot(current, "tasks", 2, 3, { contents: "stale", updatedAt: 2 })).toEqual(current);
    expect(keepLatestSnapshot(current, "tasks", 3, 3, { contents: "new", updatedAt: 3 })).toEqual({ tasks: { contents: "new", updatedAt: 3 } });
  });
});
