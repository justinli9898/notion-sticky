# Notion Sticky — Security Assessment

This document is an evidence-based security review of Notion Sticky, intended for
IT / security teams evaluating whether the app is safe to run. Every claim below
cites the exact source location so it can be independently verified.

---

## TL;DR

Notion Sticky is a small personal-productivity Electron app that displays Notion
pages in always-on-top "sticky" windows. It has:

- **No runtime dependencies** (only `electron` + `electron-builder`, both build-time only)
- **No telemetry, analytics, or auto-updater**
- **No network calls except loading `notion.so`** (and OAuth login domains you choose)
- **No persistence** — no registry writes, no service install, no autostart
- **No data exfiltration, credential harvesting, or broad filesystem access**
- **Secure Electron defaults** — `contextIsolation: true`, `nodeIntegration: false`

The two behaviors a security audit would most likely scrutinize — spawning
`powershell.exe` and synthesizing keystrokes (`SendKeys`) — are both benign and
fully explained below.

---

## What the app does — and does not — do

### Secure Electron configuration (most important)

- Every `BrowserWindow` is created with **`contextIsolation: true`** and
  **`nodeIntegration: false`** (`main.js`, `createStickyWindow` and
  `showHelperWindow`). This is the Electron-recommended secure configuration:
  the remote Notion page **cannot** access Node.js, the filesystem, or run
  native code.
- The preload bridge (`preload.js`) exposes a **minimal, harmless API** to web
  content: `closeWindow`, `openUrl`, `setOpacity`, `toggleCollapse`,
  `startDrag`, `dragMove`, `zoom`. No filesystem, shell, or `exec` is reachable
  from the rendered page.
- The only URL-opening IPC (`main.js`, `open-url` handler) is **whitelisted to
  `notion.so` / `notion.site`** — arbitrary URLs cannot be opened.
- Navigation and pop-ups are restricted (`main.js`, `will-navigate` and
  `setWindowOpenHandler`): external links open in the user's default browser;
  only Notion plus known OAuth providers (Google / Apple / Microsoft) load
  in-app.

### Network and data handling

- **Zero third-party runtime dependencies.** `package.json` lists only
  `electron` and `electron-builder`, both as `devDependencies` (build-time
  only). There is no analytics SDK, tracker, or auto-updater contacting any
  server.
- The **only** network destination is `notion.so` (and OAuth login domains the
  user signs in through). Notion session cookies live in the local Electron
  profile, exactly like a browser tab.
- **No telemetry, no remote logging, no credential harvesting.** The clipboard
  is read (`main.js`, `getNotionUrlFromClipboard`) only to detect a Notion URL;
  the text is checked for `notion.so` / `notion.site` and otherwise discarded.
- **No persistence.** The app does not write to the registry, install a
  service, or configure autostart. The only file it ever writes is a debug
  screenshot, and **only** when launched with the `--dbg` flag (`main.js`,
  debug block).

### The PowerShell + SendKeys behavior, explained

The **PowerShell + SendKeys** call (`main.js`, `handleOpenSticky`) exists for one
narrow convenience: when the user presses `Ctrl+Shift+O`, it sends `Ctrl+L` then
`Ctrl+C` to the *active window* to copy the current browser's address-bar URL
into the clipboard, then reads it back to open that Notion page.

- The PowerShell command is **static and hardcoded** — no user input is
  interpolated into it, so there is no command-injection risk.
- The synthesized keystrokes are limited to `Ctrl+L` (focus address bar) and
  `Ctrl+C` (copy) — it does not log, capture, or record keystrokes.

There is **no** code that exfiltrates data, reads files broadly, escalates
privileges, modifies the registry, establishes persistence, hides itself, or
contacts any non-Notion server.

---

## How to verify these claims

The codebase is small and readable. To independently confirm:

- Search for network/exfiltration: there are no `fetch`, `http`, `https`,
  `net`, or socket calls anywhere in the source.
- Search for `child_process` / `exec` — the only occurrence is the documented
  PowerShell URL-grab in `main.js`.
- Inspect `webPreferences` in `main.js` — `contextIsolation: true`,
  `nodeIntegration: false` on every window.
- Inspect `preload.js` — the complete list of capabilities exposed to web
  content (all UI-related, none privileged).
- Inspect `package.json` — no runtime dependencies.
