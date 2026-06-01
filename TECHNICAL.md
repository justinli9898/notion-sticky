# Notion Sticky — Technical Documentation

## What This Tool Does

Notion Sticky is an Electron desktop app for Windows that creates always-on-top "sticky" windows showing Notion pages. Think of it as a pop-out view for Notion pages — designed for keeping task details visible while working in other apps.

### User Workflow

1. Navigate to a Notion page (in browser or desktop app)
2. Press **Ctrl+Shift+O** — the app grabs the current page URL and opens it as a sticky
3. Multiple stickies can be open at once; **Ctrl+Shift+W** closes them all

There's also a smart clipboard workflow for database views:
- Select a row in a Notion database, click "..." > "Copy link"
- Press **Ctrl+Shift+O** — detects the fresh clipboard URL and opens it directly
- The app tracks the last-used URL to distinguish "fresh copy" from "stale clipboard"

### Key Features

- **Frameless, always-on-top windows** with a custom dark titlebar (yellow dot, page title, close button)
- **Double-click titlebar** to collapse/expand ("window shade")
- **Ctrl+scroll** to zoom in/out (default 90% zoom)
- **Hides Notion chrome**: top nav bar, page title, properties, comments — shows only the page body
- **Auth popups allowed**: Google, Apple, Microsoft OAuth flows work for initial login
- **External links** open in the default browser; internal Notion links navigate within the sticky
- **Tray icon** with context menu

---

## How It Works (Architecture)

### Files

| File | Purpose |
|------|---------|
| `main.js` | Main process: window management, tray, shortcuts, IPC handlers, CSS/JS injection constants |
| `preload.js` | Context bridge: exposes `window.notionSticky` API (closeWindow, toggleCollapse, startDrag, dragMove, zoom) |
| `shell.html` | Original iframe-based approach (unused — kept for reference) |
| `helper.html` | "No URL found" dialog when clipboard has no Notion URL |
| `package.json` | Electron app config, build scripts |

### Core Approach

The original design used an iframe (`shell.html`) to embed Notion pages, but **Notion blocks iframe embedding** via `X-Frame-Options` headers. The fix was to load Notion URLs directly via `win.loadURL(url)`, then inject a custom titlebar overlay using `webContents.insertCSS()` and `webContents.executeJavaScript()`.

### Injection Flow

On every `dom-ready` event:
1. `setZoomFactor(0.9)` — default 90% zoom
2. `insertCSS(TITLEBAR_CSS)` — titlebar styles, hides `.notion-topbar`, content top padding
3. `executeJavaScript(TITLEBAR_JS)` — creates titlebar DOM, hides title/properties/comments, attaches event listeners

### URL Acquisition (Smart Shortcut)

`handleOpenSticky()` uses a two-step approach:
1. **Check clipboard first**: If it has a Notion URL different from `lastUsedUrl`, use it (handles "Copy link" workflow)
2. **Fall back to address bar**: Simulates Ctrl+L → Ctrl+C via PowerShell `SendKeys` to grab the current page URL from the foreground browser

### Custom Drag Implementation

Standard `-webkit-app-region: drag` swallows mouse events on Windows, preventing double-click detection. The titlebar uses manual pointer-based dragging instead:
- `pointerdown` → `setPointerCapture()` + IPC `start-drag` (records offset)
- `pointermove` → IPC `drag-move` (main process calls `win.setPosition()`)
- `pointerup` → `releasePointerCapture()`
- `dblclick` → IPC `toggle-collapse`

---

**The layout mechanism:**
- `.layout` is a **CSS Grid** container
- Grid columns are defined by CSS custom properties: `--margin-width` and `--content-width`
- `.layout.layout-wide` sets `--margin-width: 96px` (the side padding)
- `.layout-reskin-wider` sets `--content-width: minmax(auto, 720px)` (caps body width)
- The 96px "padding" is actually **grid column width**, not CSS padding
- `.notion-frame` has an inline `width: 955px` set by React (wider than the 860px window)

**Title area vs body area:**
- Title/properties sections are `.layout-content` grid items in the grid's content column, but they seem to respond differently to `--margin-width` changes
- The body content (`.notion-page-content`) is constrained by `--content-width: minmax(auto, 720px)`, capping it at 720px regardless of margin changes

### What We Tried

| Approach | Result |
|----------|--------|
| CSS `padding-left/right !important` on `.notion-page-content`, `.notion-frame`, `.notion-scroller`, child divs | No effect — padding isn't CSS padding |
| CSS attribute selectors `[style*="padding-left"]` | No effect — no inline padding exists |
| `cssOrigin: 'user'` with `insertCSS()` (highest CSS cascade priority) | Broke other styles; grid overrides still didn't apply consistently |
| JS `getComputedStyle()` to find elements with padding > 20px | No effect — the "padding" is grid column space, not CSS padding |
| JS `MutationObserver` to re-apply overrides when React re-renders | Timing fight with React; overrides get reset |
| CSS `--margin-width: 8px !important` on `.layout` | **Partially worked** — fixed the title area (left side) margins. Body was unaffected (constrained by `--content-width`) |
| CSS `--content-width: 1fr !important` on `.layout` | No visible effect on body area |
| CSS `grid-template-columns: 4px 1fr 4px !important` directly on `.layout` | No visible effect (confirmed via DevTools that the inline style WAS applied, but layout didn't change) |
| JS setting inline `--margin-width`, `--content-width`, `grid-template-columns` on `.layout` elements | Styles were applied (visible in DevTools) but layout didn't respond |
| Forcing `.notion-frame` `width: 100%` via JS MutationObserver | Fixed the right side, but broke left side (conflicted with grid margin override). Also, the hiding JS (which removes title/properties) triggers React re-render that resets the frame width. |
| CSS `max-width: 100vw` on `.layout` | Initially worked but snapped back when page finished loading |
| Persistent `setInterval` (50ms) forcing frame width | Did not hold — React still wins |

### Key Observations

1. **`--margin-width` override partially works**: Setting it to 8px successfully reduces margins on the title/properties area. This confirms the CSS variable IS being read by the grid.

2. **`--content-width` override doesn't visibly affect body**: Even when set to `1fr`, the body content area stays at the same width. The body area may use a different layout mechanism or additional constraints.

3. **Left/right fixes are mutually exclusive**: Fixing the left side (grid margin override) and fixing the right side (frame width constraint) cannot coexist without one breaking the other. The root cause: the grid expands to fill its parent (`.notion-frame` at 955px), and constraining the frame triggers React re-renders that reset everything.

4. **DOM manipulation triggers React re-renders**: Our JS that hides title/properties/comments (by setting `display: none` on siblings) causes React to re-render, which resets inline styles on `.notion-frame` and potentially other elements. This creates a timing fight.

5. **`cssOrigin: 'user'` causes side effects**: While it should give highest CSS priority, it seemed to break the grid variable overrides when applied to the entire stylesheet (including titlebar styles).

6. **Grid template columns are applied but don't take effect**: DevTools confirmed that `grid-template-columns: 4px 1fr 4px !important` was written to the `.layout` element's inline style, but the visual layout didn't change. This is the deepest mystery.

### Open Questions

1. **Why does `grid-template-columns` not take effect even when applied inline?** The style is visibly present on the element in DevTools but the grid doesn't respond. Is there a higher-level constraint? A different grid container wrapping this one?

2. **Is the body content area using a separate layout system?** The title area responds to `--margin-width` but the body doesn't seem to respond to `--content-width`. Are the body content blocks positioned differently within the grid?

3. **Can we use Electron's `webContents.debugger` API** to intercept and modify Notion's CSS before it's applied, rather than trying to override after the fact?

4. **Would a `webRequest` interceptor work?** Electron can intercept HTTP responses. We could potentially modify Notion's CSS/JS files before they reach the renderer, changing the `--margin-width` and `--content-width` values at the source.

5. **Would a completely different approach work?** Instead of fighting Notion's layout, could we extract the page content via the Notion API and render it ourselves in a custom view?

### Recommended Next Steps

1. **Inspect with DevTools more carefully**: Open DevTools (`win.webContents.openDevTools({ mode: 'detach' })`), select a body text block, and trace up the DOM tree to find exactly which element constrains the body width. Look at computed styles, not just inline styles.

2. **Try `webRequest` interception**: Use Electron's `webRequest.onBeforeRequest` or `webRequest.onHeadersReceived` to modify Notion's CSS files in-flight, changing grid variable values before React ever sees them.

3. **Try `insertCSS` with separate stylesheet for layout**: Instead of bundling layout overrides with titlebar CSS, inject them as a separate `insertCSS` call with `cssOrigin: 'user'` — this isolates any side effects.

4. **Try disabling the element-hiding JS** and testing padding overrides in isolation. The hiding JS triggers React re-renders that may interfere with layout overrides.
