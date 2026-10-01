# claude-code-session-viewer.html

Klyn `claude-code-session-viewer.html` is a viewer for Claude Code session
transcripts. Claude Code writes one JSONL file per session under
`~/.claude/projects/<project>/<session>.jsonl`.

The file is read in the browser. Nothing is uploaded.

## How It Works

Open a file with the button, or drop it anywhere on the page. Each row of the
file becomes one entry in the timeline:

- The row number, starting at #1.
- A timestamp. The first timestamped row shows the full local date and time.
  So does any row more than an hour after the previous timestamp. Other rows
  show the time of day. Hover for the exact time and the gap.
- A chip with the row's `type`. System rows add their `subtype`. Attachment
  rows add their attachment kind.
- The row's contents.

Some row types, like `mode` and `ai-title`, have no timestamp. They show a
blank time and do not reset the gap.

## View Modes

The buttons above the timeline switch every row between three modes:

- **Friendly** renders each row type on its own terms. Markdown is formatted.
  Tags in prompt text, like `<command-name>` and `<task-notification>`, are
  shown as commands and cards. Tool results link back to the tool call that
  made them. If a row fails to render, it falls back to text.
- **Text** shows the row's text as written. Tags are left in place.
- **JSON** shows the row's JSON, pretty-printed.

Rows render as they scroll into view, so large files stay responsive.

## Schema Check

Anthropic does not publish a schema for these files. The viewer keeps its own
record of the shapes it has seen, in `claude-code-session-registry.js`. It
lists every row type, every field path on each type, and every tag seen in
prompt text.

After a file loads, the schema check panel lists anything the registry lacks:

- New row types, including new system subtypes and attachment kinds.
- New fields on known types.
- New tags in prompt text.

Each entry links to the first rows where it appears. New shapes usually mean
the friendly view could show something it doesn't yet.

Tool inputs, tool results, and MCP metadata are not tracked field by field.
Their shape depends on the tool, so every new tool would count as a change.

To accept a file's shapes, use **Copy updated registry** and paste the result
over `public/claude-code-session-registry.js`. The same check runs from the
command line:

```
node tools/session-schema.mjs check <file.jsonl>...
node tools/session-schema.mjs update <file.jsonl>...
```

`check` exits 1 if it finds anything new. `update` merges the files into the
registry.
