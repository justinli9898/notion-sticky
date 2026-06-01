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

It is most likely quarantined by EDR/antivirus for **two specific *benign*
behaviors** — spawning `powershell.exe` and synthesizing keystrokes (`SendKeys`)
— not because it does anything malicious. Both are explainable below, and both
can be removed if required (see [Enterprise-safe variant](#enterprise-safe-variant)).

---

## Why EDR / antivirus likely flagged it

These traits are textbook behavioral-detection triggers, regardless of intent:

| Trigger | Where | Why detection engines flag it |
|---|---|---|
| **Spawns `powershell.exe`** via `child_process.exec` | `main.js` (`handleOpenSticky`) | An app shelling out to PowerShell is a common generic malware heuristic. |
| **Synthesizes keystrokes** (`SendKeys ^l`, `^c`) into the foreground window | `main.js` (`handleOpenSticky`) | Input injection resembles keylogger / automation malware to behavioral AV. |
| **Unsigned executable** (no code-signing certificate) | `package.json` build config | Windows SmartScreen and most EDRs distrust unsigned binaries by default. |

None of these are malicious here, but they match the patterns that get an app
auto-quarantined — often silently.

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

### The two flagged behaviors, explained

The **PowerShell + SendKeys** call (`main.js`, `handleOpenSticky`) exists for one
narrow convenience: when the user presses `Ctrl+Shift+O`, it sends `Ctrl+L` then
`Ctrl+C` to the *active window* to copy the current browser's address-bar URL
into the clipboard, then reads it back to open that Notion page.

- The PowerShell command is **static and hardcoded** — no user input is
  interpolated into it, so there is no command-injection risk.
- It is benign, but it **looks** like automation/keylogger malware to behavioral
  detection, which is the most likely reason for quarantine.

---

## Residual risks (honest accounting)

A credible review names the real trade-offs:

1. **Unsigned binary** — legitimately reduces trust; worth code-signing if
   distributed broadly.
2. **PowerShell spawn + keystroke synthesis** — benign but will keep tripping
   EDR. This is the primary thing to remove for an enterprise-clean build (it is
   optional; the clipboard-only workflow already works without it).
3. **Loads live remote web content** (Notion) in a desktop shell. Mitigated by
   `contextIsolation`, the minimal preload, and navigation whitelisting — but by
   nature it is a dedicated browser for Notion.
4. **Global keyboard shortcut + clipboard read** — low risk, but part of why
   behavioral AV pays attention.

There is **no** code that exfiltrates data, reads files broadly, escalates
privileges, modifies the registry, establishes persistence, hides itself, or
contacts any non-Notion server.

---

## Enterprise-safe variant

To produce a build that removes the two biggest EDR triggers with minimal UX
loss:

- **Remove the PowerShell / `SendKeys` URL-grab** and rely only on the clipboard
  workflow (copy the Notion link first, then press `Ctrl+Shift+O`). This
  eliminates both the `child_process` PowerShell spawn and the keystroke
  synthesis — the two largest red flags.
- **Optionally add code-signing** so the distributed `.exe` is not unsigned.

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
