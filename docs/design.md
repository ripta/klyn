# Design notes

A loose style guide for the static pages in this repo. Goals first, conventions
second, rules nowhere.

## Goals

This repo is a sandbox for experimenting with different ways to present data
and interact with tools. Each app gets to pick the interaction model that fits
its content:

- **Text-heavy tools** (e.g. `log-viewer.html`) want dense layouts and
  keyboard-first ergonomics.
- **Visual tools** (e.g. `flows/`) want room to breathe and are mouse-first.
- **Document readers** (e.g. `markedup.html`) want comfortable line lengths
  and a theme toggle.
- **Workflow tools** (e.g. `bill-splitter/`, `scrollpot/`) want a content area
  plus a sticky rail for state.

What we *do* want is for the apps to feel like they came from the same place:
shared palette, shared type, recognizable component vocabulary. One-offs are
fine and expected — break any of the conventions below when the experiment
calls for it. The point is a family resemblance, not a uniform.

We also want all pages to support **both light and dark mode**. Light is the
default (it's what the author uses day-to-day), but a page that ships only one
theme is incomplete. See [Light and dark mode](#light-and-dark-mode) for the
detection / toggle pattern.

## What lives where

| Pattern | Reference apps | When it fits |
|---|---|---|
| App-with-rail shell | `bill-splitter/`, `flows/`, `scrollpot/` | A workspace with a main canvas and a side rail of state, controls, or steps. |
| Reader/runner shell | `markedup.html`, `tap-viewer.html`, `wasm.html` | A single column of content (rendered docs, test results, program output) with a sticky page header. |
| Dense single-tool shell | `log-viewer.html` | Information-dense viewers where vertical real estate matters more than chrome. |

The home page (`index.html`) is its own thing on purpose — a directory of
experiments, intentionally lighter than the apps it links to.

## Shared design tokens

The three "app-with-rail" apps already share a palette verbatim. Treat this as
the default token set for new pages; deviate when an experiment needs to.

```css
:root {
    /* Surfaces */
    --bg:          #fafaf9;  /* page background */
    --panel:       #ffffff;  /* cards, headers, rail */
    --panel-soft:  #f5f5f4;  /* nested surfaces, hover */

    /* Ink */
    --ink:         #1c1917;  /* body and headings */
    --ink-soft:    #44403c;  /* secondary text */
    --muted:       #78716c;  /* labels, captions, hints */

    /* Rules */
    --rule:        #e7e5e4;  /* default borders */
    --rule-strong: #d6d3d1;  /* input borders, chips */

    /* Accent (amber) */
    --accent:      #d97706;
    --accent-soft: #fef3c7;
    --accent-ring: rgba(217, 119, 6, 0.35);

    /* Status */
    --danger:      #b91c1c;  --danger-soft: #fee2e2;
    --good:        #15803d;
    --warn:        #ca8a04;

    --shadow:      0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 1px rgba(28, 25, 23, 0.03);
}
```

Dark-mode token overrides live in a separate block; see
[Light and dark mode](#light-and-dark-mode) below for the mechanics.

## Light and dark mode

Every page should support both. Light is the default, dark is reached by
either matching the system preference or via an explicit user toggle.

**Defaults and detection:**

- Light is the baseline — `:root` carries the light tokens.
- On first load, honor `prefers-color-scheme: dark` from the OS. The user
  shouldn't have to click anything if their system is already set the way
  they want.
- An explicit toggle (the 60×30 sliding pill described under
  [Component vocabulary](#component-vocabulary)) is always available. The
  user's explicit choice overrides system detection.
- Persist the explicit choice in `localStorage` under the key `theme` with
  values `"light"` or `"dark"`. Absence of the key means "follow the system."
- When `localStorage.theme` is unset, subscribe to
  `prefers-color-scheme` changes so the page switches live if the OS theme
  flips. Stop reacting to system changes once the user has expressed a
  preference.

**Markup:** apply `data-theme="dark"` to `<html>` (preferred) or `<body>` when
dark is active; remove the attribute for light. Style overrides target
`[data-theme="dark"]`:

```css
:root {
    --bg: #fafaf9;
    --ink: #1c1917;
    /* ...rest of the light palette... */
}

[data-theme="dark"] {
    --bg: #1a1a1a;
    --ink: #e9ecef;
    /* ...rest of the dark palette... */
}
```

The canonical implementations of the JS pattern live in `markedup.html` and
`wasm.html` — copy from there for new pages. Pages that currently skip dark
mode (the app-with-rail tools) should be retrofitted as they're next touched.

## Typography

- **Body:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, 14px, line-height 1.45.
- **App-shell page title (h1):** 18px / weight 600, same family as body.
- **Reader-shell page title:** Georgia serif, 1.5rem, bold. Use the serif when
  the content itself is prose; the app-shell tools stay all-sans.
- **Rail section titles (h2):** 11px, uppercase, `letter-spacing: 0.08em`,
  colored `var(--muted)`. This little label style is one of the most
  recognizable shared elements — keep it.
- **Mono:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`.

## Shell shapes

### App-with-rail (`bill-splitter/styles.css` is the canonical reference)

```
<body>                               flex column, overflow hidden, 100vh
  <header class="page-header">       white panel, bottom rule
    <div class="header-row">
      <div class="header-text">      h1 + .subtitle
      <div class="header-controls">  buttons, pickers
  <main class="layout">              CSS grid, 1fr + 280–380px
    <section> ...main content...
    <aside class="rail">             scrolls independently
      <section class="rail-section">
        <header class="rail-section-header"> h2 + meta
```

Collapse to a single column at `max-width: 900px`. The rail moves below the
main content; subtitle can hide on mobile.

### Reader/runner (`markedup.html` is the canonical reference)

```
<body>                               normal document flow
  <header class="header">            sticky, backdrop-filter blur
    <div class="header-content">     max-width 800–1200px, flex row
      <h1 class="page-title">        Georgia serif for reader pages
      <button class="theme-toggle">  60×30 pill with sliding handle
  <div class="container">            same max-width, centered, 2rem padding
    ...content...
```

Pick a `max-width` that matches the content: 800px for prose, 900px for test
output, 1200px for tools with form controls.

## Component vocabulary

These show up across multiple apps; reuse the class names and shapes so the
family resemblance carries. Definitions live in `bill-splitter/styles.css`,
`flows/styles.css`, and `scrollpot/styles.css`.

- **`.file-button`** — primary action, accent background, white text, 6px radius.
- **`.ghost-button`** — transparent until hover, muted text, for low-stakes actions.
- **`.link-button`** — inline text-button styled as a small underlined link.
- **Pill chips** — `border-radius: 999px`, `panel-soft` background, `rule-strong` border. Active state: `accent-soft` background + `accent` border. Used for participants, assign chips, tip options, unit toggles, flow categories.
- **`.error`** — `danger-soft` background, `danger` text, 6px radius, lives below the page header.
- **`.rail-section` / `.rail-section-header`** — see the typography note for the h2 treatment.
- **Theme toggle** — 60×30 pill with a sliding circular handle (see `wasm.html`); only needed if the page supports dark mode.

## When to break from the conventions

Do it on purpose, and prefer breaking *one* thing rather than starting from
scratch.

- **Dense tools** (`log-viewer.html`) can drop the page-header chrome and go
  straight to a fixed toolbar. Smaller fonts, tighter padding, monospace
  everywhere — all fine.
- **Visual / canvas tools** (`flows/`) can introduce grid backgrounds, larger
  spacing, and bespoke interaction states (hover-to-highlight, etc.).
- **Embedded third-party widgets** (`gallery.html`, `json-viewer.html`) may
  inherit most of their look from the library. That's okay; don't fight the
  widget for the sake of consistency.
- **Experimental UIs** are the whole point of the repo. If a new interaction
  model needs new components, add them — but if a shared token or component
  would do, prefer that.

## Existing pages

No requirement to refactor old pages onto this guide. When you next touch one
of them substantively, it's a nice opportunity to nudge it toward the shared
tokens — but a passing edit shouldn't trigger a redesign.
