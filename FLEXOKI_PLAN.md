# Flexoki theming for Notion Sticky — handoff plan

This document is a self-contained handoff for the next session continuing the
Flexoki retheming work. The user wants to apply Steph Ango's Flexoki color
scheme (https://stephango.com/flexoki) to the sticky windows.

---

## Goal

Replace Notion's default colors inside sticky windows with the Flexoki palette,
matching whichever variant (light/dark) makes sense given Notion's current
theme. Stickies should look distinctly "Flexoki" — warm cream paper for light,
ink-black with cream text for dark — without breaking any Notion functionality.

---

## Why CSS variable override is the right approach

Notion themes itself entirely through CSS custom properties under a `--c-*`
namespace, set on `:root` / `document.documentElement`. Inspector evidence
already collected from a live sticky:

```
caret-color: var(--c-texPri)
box-shadow: var(--c-shaOutMd)
background: var(--c-assCorBubBac)
```

These are minified Notion variable names — `texPri` (text primary), `shaOutMd`
(shadow outset medium), etc. When Notion toggles light/dark mode, it swaps the
values of these variables wholesale; the rest of the UI is built on top.

**This means: if we override the variables themselves at user-origin, the
entire UI re-skins automatically, with no per-element CSS rules needed.**

The user-origin trick is already proven in this codebase — see
`feedback_cssorigin_user.md` in the user's auto-memory directory and the
`LAYOUT_CSS` injection in `main.js` that fixed the padding problem. The exact
pattern is:

```js
win.webContents.insertCSS(LAYOUT_CSS, { cssOrigin: 'user' });
```

User-origin `!important` rules outrank everything Notion can throw at them,
including React-set inline `!important` styles.

---

## Flexoki palette (full reference)

### Base tones

| Name      | Hex      | Light role | Dark role |
|-----------|----------|------------|-----------|
| paper     | #FFFCF0  | bg         | —         |
| base-50   | #F2F0E5  | bg-2       | —         |
| base-100  | #E6E4D9  | ui         | —         |
| base-150  | #DAD8CE  | ui-2       | —         |
| base-200  | #CECDC3  | ui-3       | tx-3      |
| base-300  | #B7B5AC  | tx-3       | tx-2      |
| base-500  | #878580  | —          | tx-2 (alt)|
| base-600  | #6F6E69  | tx-2       | —         |
| base-700  | #575653  | —          | ui-3      |
| base-800  | #403E3C  | —          | ui-2      |
| base-850  | #343331  | —          | ui        |
| base-900  | #282726  | —          | bg-2      |
| base-950  | #1C1B1A  | —          | bg        |
| black     | #100F0F  | tx         | —         |

### Accents

Light themes use the **600** column. Dark themes use the **400** column.

| Color   | 400      | 600      |
|---------|----------|----------|
| Red     | #D14D41  | #AF3029  |
| Orange  | #DA702C  | #BC5215  |
| Yellow  | #D0A215  | #AD8301  |
| Green   | #879A39  | #66800B  |
| Cyan    | #3AA99F  | #24837B  |
| Blue    | #4385BE  | #205EA6  |
| Purple  | #8B7EC8  | #5E409D  |
| Magenta | #CE5D97  | #A02F6F  |

### Role mapping (Flexoki convention)

- **bg / bg-2** — primary and secondary background
- **ui / ui-2 / ui-3** — interface chrome: borders, hover, active
- **tx / tx-2 / tx-3** — text: normal, muted, faint
- Accents are used for highlights, syntax, mentions, callouts

---

## What's already in place

`main.js` now contains a `THEME_VARS_DUMP_JS` constant that runs only in
`--dbg` mode (alongside the other diagnostic scripts) on every `dom-ready`.
It does the following:

1. Walks every accessible CSSStyleSheet and collects every CSS custom property
   name starting with `--c-`.
2. Resolves each name's current value via
   `getComputedStyle(documentElement).getPropertyValue(name)`.
3. Logs every `name = value` pair, plus body bg/color and color-scheme, all
   tagged `[theme]`.

**The diagnostic has not been run yet.** That is the next session's first task.

---

## Next session — concrete steps

### Step 1: Capture the Notion variable inventory

Run the diagnostic to find out what variables actually exist and what they
currently resolve to:

```bash
cd C:/Users/cxc43/Documents/python_projects/notion-sticky
npm run debug -- --url=<a Notion page URL> --screenshot-delay=8000
```

The 8-second delay is important — Notion's theme variables are set after the
initial bundle loads. Wait for auto-quit, then collect every line from stdout
that begins with `[theme]`.

You should see ~100-200 lines like:

```
[theme] --c-bgPri = rgb(25, 25, 25)
[theme] --c-bgSec = rgb(32, 32, 32)
[theme] --c-texPri = rgba(255, 255, 255, 0.9)
[theme] --c-texSec = rgba(255, 255, 255, 0.65)
...
```

If the user has dark mode on in Notion, the values will be dark. Run again
with light mode toggled in Notion to capture the light variant — both maps
help understand what the variable abbreviations mean (a variable whose value
goes from `#FFFFFF` → `#191919` between modes is clearly a primary background).

### Step 2: Map Notion variables → Flexoki tones

Build a mapping table. For each Notion variable, decide which Flexoki tone
serves the same role. Group them:

- **Primary backgrounds** (page bg, hover bg, sidebar bg) → `bg` / `bg-2`
- **Interface chrome** (borders, dividers, button bg) → `ui` / `ui-2` / `ui-3`
- **Text** → `tx` / `tx-2` / `tx-3`
- **Accents** (Notion has color-named variables for callouts: red, orange,
  yellow, green, blue, purple, pink, brown) → corresponding Flexoki accent

Notion variable name patterns observed so far:
- `--c-bg*` — backgrounds
- `--c-tex*` — text
- `--c-bdr*` — borders (probably)
- `--c-sha*` — shadows
- `--c-ass*` — assistant/AI bubble (we already hide this, can ignore)

The full inventory from Step 1 will reveal the rest.

### Step 3: Author the override stylesheet

Create a `FLEXOKI_CSS` constant in `main.js` (next to `LAYOUT_CSS`). Structure:

```js
const FLEXOKI_DARK_CSS = `
:root {
  /* Backgrounds */
  --c-bgPri: #1C1B1A !important;
  --c-bgSec: #282726 !important;
  /* ...many more... */

  /* Text */
  --c-texPri: #CECDC3 !important;
  --c-texSec: #B7B5AC !important;
  /* ... */

  /* Accents */
  --c-redBac: #AF3029 !important;
  /* ... */
}
`;

const FLEXOKI_LIGHT_CSS = `...`;
```

Inject in `dom-ready` after `LAYOUT_CSS`:

```js
win.webContents.insertCSS(FLEXOKI_DARK_CSS, { cssOrigin: 'user' });
```

**Critical:** must be `cssOrigin: 'user'`. Author-origin won't beat Notion's
runtime theme switching. See `feedback_cssorigin_user.md`.

### Step 4: Theme detection

Two options for picking light vs dark:

**Option A** — read Notion's current theme and mirror it:
```js
const scheme = await win.webContents.executeJavaScript(
  'getComputedStyle(document.documentElement).colorScheme'
);
const css = scheme.includes('dark') ? FLEXOKI_DARK_CSS : FLEXOKI_LIGHT_CSS;
```

**Option B** — let the user pick (config setting). Add `theme: 'dark' | 'light' | 'auto'` to `CONFIG`.

I'd start with Option A and add Option B if the user wants control.

### Step 5: Titlebar harmonization

The titlebar (`#notion-sticky-titlebar` in `TITLEBAR_CSS`) is currently
hardcoded `background: #0d0d0d` with text `#999`. Change to Flexoki:
- Dark: bg `#282726` (bg-2), text `#878580` (tx-2), border `#343331` (ui)
- Light: bg `#F2F0E5` (bg-2), text `#6F6E69` (tx-2), border `#E6E4D9` (ui)

Use the same theme detection to pick which.

### Step 6: Iterate

Some variables will be wrong. Some accent shades will need tweaking. Run the
sticky, screenshot key views (text page, database, kanban, callout, code
block), look for off-theme elements, inspect with F12 to find the variable
that controls them, fix.

---

## Open decisions for the user

Before authoring the override sheet, confirm with the user:

1. **Light or dark Flexoki, or auto?** Default suggestion: auto (mirror Notion's
   current theme). Means we ship both `FLEXOKI_DARK_CSS` and `FLEXOKI_LIGHT_CSS`.
2. **Scope** — body only, or also retheme the custom titlebar to match? The
   user already responded positively to this idea in the planning conversation;
   plan to do both unless they push back.
3. **Accent remapping** — do Notion's callout/highlight colors get remapped to
   Flexoki accents (green→Flexoki green etc.) or left alone? This affects how
   "themed" the result looks vs. how recognizable existing pages remain.

---

## Implementation patterns to follow

These are conventions already established in the codebase. Read them first
to avoid re-discovering them:

### CSS injection split

`main.js` already follows this convention (don't break it):

- `TITLEBAR_CSS` — UI chrome (titlebar, hidden Notion elements, scrollbar
  hiding, zoom toast). Injected via `insertCSS(TITLEBAR_CSS)` (author origin).
- `LAYOUT_CSS` — anything that needs to beat React inline styles (padding,
  block spacing). Injected via `insertCSS(LAYOUT_CSS, { cssOrigin: 'user' })`.

**The Flexoki rules go in a third user-origin sheet,** because mixing them
with `TITLEBAR_CSS` would break the user-origin guarantee for layout overrides
(see auto-memory `feedback_cssorigin_user.md` for the history of why).

Recommended:

```js
const FLEXOKI_CSS = `...`;  // built dynamically or theme-switched

win.webContents.on('dom-ready', () => {
  // ... existing ...
  win.webContents.insertCSS(LAYOUT_CSS, { cssOrigin: 'user' });
  win.webContents.insertCSS(FLEXOKI_CSS, { cssOrigin: 'user' });
  // ...
});
```

### Re-injection on navigation

`dom-ready` fires on every Notion in-app navigation. The current code already
re-injects everything each time. The Flexoki sheet should follow suit — no
need for a flag.

### Diagnostic workflow

Already-working pattern: write a `*_DIAGNOSTIC_JS` constant, gate it with
`if (DEBUG)` in `dom-ready`, run via `npm run debug`, parse `[tag]`-prefixed
lines from stdout. Existing examples:
- `DIAGNOSTIC_JS` — DOM ancestor chain dump
- `RECT_DIAGNOSTIC_JS` — bounding rect check
- `CHILD_DIAGNOSTIC_JS` — child width inspection
- `BLOCK_SPACING_DIAGNOSTIC_JS` — box-model walk for block spacing
- `THEME_VARS_DUMP_JS` — what we just added; use this in step 1

---

## Files / locations

| File / location | Purpose |
|---|---|
| `main.js` | Everything. The new code goes here. |
| `main.js` `TITLEBAR_CSS` | Constant for author-origin UI chrome — titlebar will need editing here |
| `main.js` `LAYOUT_CSS` | Existing user-origin sheet — do NOT add Flexoki here, use a separate constant |
| `main.js` `THEME_VARS_DUMP_JS` | Already written — runs in `--dbg`, dumps `[theme]` lines |
| `main.js` `dom-ready` handler | Where injections fire |
| `TECHNICAL.md` | Architecture overview — note: its "Padding problem (Unsolved)" section is stale, the problem is solved |
| `dist/NotionSticky.exe` | Build output. Rebuild with `npm run build` after changes. |

---

## Risks / things to watch

1. **Variable name brittleness.** Notion's `--c-*` names are minified and
   may change between Notion versions. If the theme suddenly stops working
   after a Notion update, re-run the diagnostic and re-map.

2. **Notion may set variables on multiple selectors.** Variables might also
   live on `body`, `.notion-app`, or `[data-theme="dark"]`. If `:root`-only
   overrides don't catch everything, broaden the selector:
   ```css
   :root, body, .notion-app, [data-theme] { --c-bgPri: ... !important; }
   ```

3. **Image / illustration colors.** Some Notion UI uses inline SVG fills or
   raster images. CSS variable overrides won't touch those. Acceptable —
   focus on text, backgrounds, borders, accents.

4. **Inline `style="background: rgb(...)"` from page content.** User-set block
   background colors in Notion are stored as literal RGB inline styles, not
   variable references. These will NOT be retheme-able without per-block
   replacement, which is out of scope. Leave alone.

5. **Light-mode Flexoki on a sticky over a dark desktop** may look jarring.
   Probably fine — that's a user preference issue, not a bug.

---

## Suggested first commit

Once Step 3 is complete and the diagnostic confirms variables are being
overridden:

```
Add Flexoki theme override

Inject Flexoki dark/light palette as a third user-origin stylesheet,
mirroring Notion's current color scheme. Retheme the custom titlebar to
match (bg-2 / tx-2 / ui).
```

---

End of handoff.
