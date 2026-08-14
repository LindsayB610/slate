# Slate

Slate is a local-first Markdown viewer plugin for Workshop.
It turns explicitly configured local Markdown files into clean reference views
without copying their content to a server, repository, or cloud service.

## Relationship to Workshop

Slate is the tool's source-of-truth repository. Workshop is the desktop host:
it provides the desktop frame, promotion state, and constrained local-source
capabilities. Slate exports `workshopPluginDeclaration` and
`WorkshopToolView`; it reads only declared sources through the generic host
capabilities `read_configured_markdown_sources`,
`read_configured_markdown_source`, `start_configured_markdown_watch`, and the
optional, narrow configuration-management pair
`read_configured_markdown_config` / `write_configured_markdown_config`.
It has peer dependencies on React and `@tauri-apps/api`.

### Progressive theme inheritance

When Slate is embedded in Workshop, it inherits Workshop's active semantic CSS
custom properties for canvas and surfaces, borders, text, accents, focus, status
colors, and gradients. A palette change therefore reaches Slate through the CSS
cascade immediately; it does not require a Slate rebuild, a source refresh, or
a change to `slate.config.json`.

The integration is progressive. Every host value is consumed with a Slate-owned
fallback, for example `var(--workshop-canvas, #070708)`. When all host tokens are
absent—as they are in the local browser preview—those standalone fallbacks
preserve Slate's existing dark pink-and-yellow treatment. Slate does not import
Workshop source, depend on a Workshop palette id, or require a theme capability
to load.

Slate scopes its aliases and component rules beneath `.slate-plugin`, so it does
not restyle Workshop chrome or sibling plugins. Host applications may provide
any or all of these semantic variables:

```text
--workshop-canvas
--workshop-surface
--workshop-surface-raised
--workshop-border
--workshop-text
--workshop-text-muted
--workshop-accent
--workshop-accent-strong
--workshop-accent-warm
--workshop-focus-ring
--workshop-success
--workshop-warning
--workshop-danger
--workshop-gradient-start
--workshop-gradient-middle
--workshop-gradient-end
```

### External links

Slate accepts safe `http`, `https`, and `mailto` links in configured Markdown.
In a browser preview, those links behave as ordinary browser links. In Workshop,
Slate uses the optional generic `open_external_url` host capability to hand the
link to the operating system's default handler. Slate does not bundle a Tauri
opener plugin. If an older Workshop install does not provide that capability,
Slate shows an update message instead of opening a dead webview tab.

## Configuration

Each person keeps their filled-in configuration outside this repository and
outside Workshop's public repository. The configuration can list any number of
unique local Markdown files.

### Connecting a Slate folder

In Slate, select **Connect a Slate folder**, then enter the absolute path to an
existing private folder containing `slate.config.json`. Once connected, use
**Change Slate folder** from the source chooser to replace it. Workshop keeps
the selected folder path as local UI state, so reopening the app or renewing
OS folder access does not require re-entering it. Use **Disconnect** to forget
that local selection; the folder, configuration, Markdown files, and source
data remain untouched. Slate never scans the folder or creates configuration
for you: it reads only the Markdown files explicitly declared in that
configuration.

### Adding and changing displayed documents

Slate reads the `sources` array in your private `slate.config.json`. Use
**Manage documents** in Slate to add, edit, remove, validate, and reorder that
list without editing JSON. Save validates every id, label, view, duplicate
path, and absolute Markdown path; Workshop then writes only the existing
`slate.config.json` in the selected private folder. It will not create a
configuration file, discover documents, or edit any Markdown file. A failed
save leaves the draft visible with an error so it can be corrected or canceled.

The manager permits an empty document list. That leaves Slate connected and
shows its "No documents configured" state until a source is added again.
The manager's arrows change the order stored in the private configuration;
the Slate home shelves remain alphabetized by visible label.
Each source needs a unique lowercase, hyphenated `id`, a human-readable
`label`, an absolute Markdown `path`, and a supported `view`.

```json
{
  "version": 1,
  "sources": [
    {
      "id": "tasks",
      "label": "Tasks",
      "path": "/absolute/path/to/tasks.md",
      "view": "markdown-tabs"
    },
    {
      "id": "notes",
      "label": "Notes",
      "path": "/absolute/path/to/notes.md",
      "view": "markdown"
    },
    {
      "id": "inventory",
      "label": "Inventory",
      "path": "/absolute/path/to/inventory.md",
      "view": "table"
    },
    {
      "id": "archive",
      "label": "Archive",
      "path": "/absolute/path/to/archive.md",
      "view": "table-tabs"
    }
  ]
}
```

Supported views:

- `markdown-tabs` groups top-level Markdown headings into tabs.
- `markdown` preserves a single, scrollable Markdown view.
- `table` renders the largest valid Markdown table in the file, keeping its
  source columns and row order. This lets a file include a small legend or key
  before its primary data table. “Largest” means the most body rows; if tables
  tie, Slate uses the first one. A valid table needs a header row and Markdown
  separator row.
- `table-tabs` keeps a divider-delimited document title and intro above a row
  of tabs, then renders the largest valid Markdown table inside the selected
  top-level-heading tab. Tables are never selected from another tab. A tab with
  no valid table shows an in-place message instead of failing the document.

### Favorites and source order

Slate alphabetizes source cards by their visible labels. The manager’s order is
preserved in the private configuration for intentional source ordering, while
the picker continues to alphabetize the visible cards. A user can toggle the
star in the upper-right corner of any source card to place it in a Favorites
section above the remaining documents; both sections remain alphabetized.
When no source is starred, Slate shows only the normal source grid—there is no
empty Favorites section. Favorites are a Slate-local preference scoped to the
selected private workspace. They do not modify `slate.config.json`, Markdown
files, or Workshop, and they do not sync across computers.
Filled favorite stars deliberately remain yellow across host themes so the
learned favorite signal does not change when the surrounding palette does.

## Privacy model

Slate stores no source content. The host may read only the absolute paths that
the user placed in their private configuration; it must not search directories,
discover fallback files, upload content, or persist a second copy. Do not commit
filled-in configuration files, real source files, screenshots, local paths, or
personal data.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
npm run public:check
npm run package:check
```

Run `npm run preview:local` for Slate's standalone fallbacks. Add
`?host-theme=preview` to that local URL to exercise the generic inherited-token
path with a representative non-Workshop test palette.
