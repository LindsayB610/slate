import { slateViewFormats, type SlateSourceDefinition } from "./index.js";

export type SlateSourceMetadata = Pick<SlateSourceDefinition, "id" | "label" | "view">;
export type SlateSnapshot = { contents: string; updatedAt: number };
export type SlateSourceChange = { root: string; configFile: string; source: string };
export type InlineMarkdownToken = { type: "text"; value: string } | { type: "strong"; value: string } | { type: "link"; label: string; href: string };

/** Parses the small, safe inline Markdown subset Slate renders in local documents. */
export function parseInlineMarkdown(value: string): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  const expression = /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^\s)]+)\))/g;
  let cursor = 0;
  for (const match of value.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: "text", value: value.slice(cursor, index) });
    if (match[2] !== undefined) tokens.push({ type: "strong", value: match[2] });
    else if (isSafeSlateLink(match[5])) tokens.push({ type: "link", label: match[4], href: match[5] });
    else tokens.push({ type: "text", value: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) tokens.push({ type: "text", value: value.slice(cursor) });
  return tokens.length ? tokens : [{ type: "text", value }];
}

function isSafeSlateLink(value: string): boolean { return /^(https?:|mailto:)/i.test(value); }

export function describeSlateView(view: SlateSourceMetadata["view"]): { glyph: string; description: string } {
  if (view === "markdown-tabs") return { glyph: "☷", description: "Tabbed Markdown reference" };
  if (view === "table") return { glyph: "▦", description: "Sortable table" };
  return { glyph: "≡", description: "Markdown reference" };
}

export const slateDemoSources: SlateSourceMetadata[] = [
  { id: "tasks", label: "Tasks", view: "markdown-tabs" },
  { id: "notes", label: "Notes", view: "markdown" },
  { id: "inventory", label: "Inventory", view: "table" },
];

export const slateDemoSnapshots: Record<string, SlateSnapshot> = {
  tasks: { updatedAt: Date.parse("2026-08-05T18:45:00-07:00"), contents: `# 💼 Studio
## Current state
- Client work is organized and ready for this week's **priority pass**
- The editorial calendar needs two confirmed publish dates
- Keep the visual reference folder tidy as new material arrives
## Next actions
- Send the [revised project outline](https://example.com/project-outline)
- Set aside a focused afternoon for image selection
- Confirm the production schedule with collaborators

# 🛠️ Writing
## Current state
- Drafting is underway, with the opening sequence and core turning points mapped
- Character notes and continuity questions live in the reference packet
## Next actions
- Finish the next scene pass
- Review the chapter handoff notes
- Capture any new decisions before closing the session

# 🏡 Home
## This week
- Restock the everyday kitchen staples
- Sort incoming mail and file completed paperwork
- Choose one small reset project for the weekend
## Later
- Review seasonal storage before the next weather change
- Make a short list of household repairs to schedule

# 👥 Family
## Active threads
- Confirm school and activity dates for the next two weeks
- Keep the shared calendar current as plans shift
## Next actions
- Prepare the weekend plan
- Check in on upcoming appointments

# ❤️ Wellbeing
## Steady practices
- Protect two quiet work blocks during the week
- Keep the walking and reading routines uncomplicated
## Gentle reminders
- Plan meals before the busiest day
- Leave margin around commitments

# 📚 Learning
## In progress
- Work through the current course module
- Save useful examples and references in one place
## Next actions
- Finish the practice exercise
- Write down questions for the next session

# 🤝 Community
## Current state
- Track the next volunteer shift and any needed supplies
- Keep follow-ups lightweight and timely
## Next actions
- Send the confirmation note
- Add the next event to the calendar

# 📦 Someday
## Ideas worth keeping
- Refresh the project archive and choose a few pieces to share
- Plan a low-key creative day with no deliverable
- Research one future trip option
## Not now
- Major reorganizing projects
- New commitments without a clear owner` },
  notes: { updatedAt: Date.parse("2026-08-05T18:45:00-07:00"), contents: `# Reference notes
Keep short reference notes close to the work.

## Working agreement
Use this space for decisions that should remain easy to find. Capture the **conclusion**, not the whole conversation.

## Open questions
- What needs a decision this week?
- Which item can wait until the next review?
- Is there a better home for this information?

## Useful links
Keep external links descriptive and limited to trusted destinations, like the [reference library](https://example.com/reference-library).` },
  inventory: { updatedAt: Date.parse("2026-08-05T18:45:00-07:00"), contents: `# Home inventory

| Category | Item | On hand | Location | Notes |
| --- | --- | --- | --- | --- |
| Pantry | **Jasmine rice** | 2 bags | Pantry shelf | [Meal plan](https://example.com/meal-plan) |
| Pantry | Pasta | 4 boxes | Pantry shelf | Mixed shapes |
| Pantry | Tomatoes | 6 cans | Pantry shelf | Replace after next meal plan |
| Pantry | Oats | 1 container | Pantry shelf | Buy soon |
| Pantry | Coffee | 1 bag | Pantry shelf | Opened this week |
| Baking | Flour | 1 bag | Baking bin | Backup not needed yet |
| Baking | Chocolate chips | 2 bags | Baking bin | One opened |
| Freezer | Vegetable broth | 3 cartons | Upper basket | |
| Freezer | Berry mix | 2 bags | Upper basket | Smoothies |
| Freezer | Prepared soup | 4 portions | Middle drawer | Label with dates |
| Freezer | Flatbread | 1 package | Middle drawer | Buy when used |
| Freezer | Green beans | 2 bags | Lower drawer | |
| Household | Dish soap | 2 bottles | Utility shelf | One open |
| Household | Paper towels | 6 rolls | Utility shelf | |
| Household | Laundry detergent | 1 bottle | Utility shelf | Half full |
| First aid | Bandages | 1 box | Hall cabinet | Check sizes |
| First aid | Cold pack | 2 | Hall cabinet | |
| Office | Printer paper | 1 ream | Desk cabinet | Buy one backup |` },
};

export function validateSourceMetadata(value: unknown): SlateSourceMetadata[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources: SlateSourceMetadata[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const source = item as Partial<SlateSourceMetadata>;
    if (typeof source.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(source.id) || ids.has(source.id)
      || typeof source.label !== "string" || !source.label.trim()
      || typeof source.view !== "string" || !(slateViewFormats as readonly string[]).includes(source.view)) return null;
    ids.add(source.id); sources.push({ id: source.id, label: source.label, view: source.view as SlateSourceMetadata["view"] });
  }
  return sources;
}

export function shouldRefreshSource(root: string, change: SlateSourceChange, configFile: string): boolean {
  return change.configFile === configFile && normalizeRoot(change.root) === normalizeRoot(root);
}

/** Keeps a selected source only while it remains in the latest configuration. */
export function retainSelectedSource(selected: string | undefined, sources: SlateSourceMetadata[]): string | undefined {
  return selected && sources.some((source) => source.id === selected) ? selected : undefined;
}

export function keepLatestSnapshot(
  current: Record<string, SlateSnapshot>, source: string, requestVersion: number, latestVersion: number, result: SlateSnapshot | null,
): Record<string, SlateSnapshot> {
  if (!result || requestVersion !== latestVersion) return current;
  return { ...current, [source]: result };
}

export type TableSortDirection = "ascending" | "descending";

/** Creates a stable, display-friendly column sort without changing source data. */
export function sortTableRows(rows: string[][], column: number, direction: TableSortDirection): string[][] {
  const multiplier = direction === "ascending" ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const comparison = left.row[column].localeCompare(right.row[column], undefined, { numeric: true, sensitivity: "base" });
    return comparison === 0 ? left.index - right.index : comparison * multiplier;
  }).map(({ row }) => row);
}

/** Returns whether a subscription must be immediately released after an async setup race. */
export function releaseIfDisposed(disposed: boolean, unlisten: () => void): boolean {
  if (!disposed) return false;
  unlisten();
  return true;
}

function normalizeRoot(value: string): string { return value.length > 1 ? value.replace(/\/+$/, "") : value; }
