# Architecture & Flows viewer

A single-page, data-driven viewer that documents how packages and components in
Electron Microscope work together to complete a user-facing action. Pick a flow
on the right and the canvas highlights the participating components, the hops
between them, and the order they happen in.

## Viewing

The page fetches `flows.json` at runtime, so opening `index.html` directly with
`file://` will be blocked by browser CORS. Serve the directory over HTTP from
anywhere:

```sh
python3 -m http.server -d docs/flows 8765
# then open http://localhost:8765/
```

Any static server works (nginx, caddy, `npx serve`, `pnpm dlx serve`, etc.).

## Adding or editing a flow

All content lives in `flows.json`. There are three top-level keys:

- `categories` — color/label legend; each component points at one of these.
- `components` — every node on the canvas. Each entry has an `id`, a `label`,
  a `category`, and a `col` / `row` (zero-based) that places it on the grid.
- `flows` — the list shown in the right rail. Each flow has an `id`, `title`,
  `summary`, and an ordered list of `steps`. A step is a `{from, to, note}`
  triple where `from` and `to` reference component `id`s.

To add a flow, append an entry to `flows`. To add a component, append to
`components` and pick `col` / `row` coordinates that don't collide with an
existing node. No HTML, CSS, or JavaScript changes are required.

The viewer derives the canvas wiring from the union of every step's
`from`/`to` pair across all flows, so connections appear automatically once
they are referenced by at least one flow.

## Schema

`flows.schema.json` is a JSON Schema (Draft 2020-12) that describes every
field, the conventions for IDs and grid placement, and a checklist for how
to research and write a new flow from the codebase. Editors with JSON
Schema support pick it up automatically via the `$schema` reference at the
top of `flows.json`. Coding agents should read the top-level `description`
in the schema before editing the data file.
