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
`read_configured_markdown_source`, and `start_configured_markdown_watch`.
It has peer dependencies on React and `@tauri-apps/api`.

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

Slate reads the `sources` array in your private `slate.config.json`. To add,
change, or remove a displayed document, edit that file in a text editor, save
it, and Slate will reload the configured source list. Each source needs a
unique lowercase, hyphenated `id`, a human-readable `label`, an absolute
Markdown `path`, and a supported `view`.

Slate does not yet provide a screen for editing this configuration. That is
deliberate: it never creates files or discovers nearby documents. A future
configuration editor would need a separately designed, narrowly permissioned
host write capability rather than quietly widening Slate's file access.

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

Slate alphabetizes source cards by their visible labels. A user can toggle the
star in the upper-right corner of any source card to place it in a Favorites
section above the remaining documents; both sections remain alphabetized.
When no source is starred, Slate shows only the normal source grid—there is no
empty Favorites section. Favorites are a Slate-local preference scoped to the
selected private workspace. They do not modify `slate.config.json`, Markdown
files, or Workshop, and they do not sync across computers.

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
```
