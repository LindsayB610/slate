# Slate

Slate is a local-first Markdown viewer for Workshop.
It turns explicitly configured local Markdown files into clean reference views
without copying their content to a server, repository, or cloud service.

## Relationship to Workshop

Slate is the tool's source-of-truth repository. Workshop is the desktop host:
it provides installation, navigation, local file access, native watching, and
updater delivery. A Workshop adapter should consume this package's source
configuration and presentation models; Slate does not bundle a desktop app or
read local files by itself.

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
- `table` renders the first Markdown table with its source columns and row order.

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
