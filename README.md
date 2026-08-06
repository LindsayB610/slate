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

## Configuration

Each person keeps their filled-in configuration outside this repository and
outside Workshop's public repository. The configuration can list any number of
unique local Markdown files.

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
