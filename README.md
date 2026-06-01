# Notion Sticky

A tiny always-on-top window that lets you pin any Notion page as a floating
sticky note on your desktop. No PowerToys needed — the window is natively
always-on-top, frameless, draggable, and resizable.

![concept](https://img.shields.io/badge/status-v1.0-ffcc00?style=flat-square)

## How it works

1. Copy a Notion page URL to your clipboard (Ctrl+L in Notion)
2. Press **Ctrl+Shift+O** anywhere on your system
3. A small floating window appears with that Notion page loaded inside it
4. The window stays on top of everything — drag it anywhere, resize it, 
   adjust its opacity
5. Press **Escape** or click the X to close it
6. Press **Ctrl+Shift+W** to close ALL open stickies at once

The app lives in your system tray. Right-click the tray icon for options.

## Requirements

- **Node.js** (v18+) — install via fnm or nvm-windows
- **Windows 10/11** (also works on macOS/Linux but designed for Windows)

## Quick start

```bash
# Clone or download this folder, then:
cd notion-sticky
npm install
npm start
```

That's it. The app will appear in your system tray.

## Building a standalone .exe

If you want a portable executable you can run without Node:

```bash
npm run build
```

This creates a portable `NotionSticky.exe` in the `dist/` folder.
No installation needed — just run it.

## Keyboard shortcuts

| Shortcut         | Action                              |
|------------------|-------------------------------------|
| Ctrl+Shift+O     | Pin Notion URL from clipboard       |
| Ctrl+Shift+W     | Close all sticky windows            |
| Escape            | Close the focused sticky            |

## Features

- **Always on top** — native OS-level, no PowerToys needed
- **Frameless** — clean, minimal look with a tiny custom titlebar
- **Draggable** — grab the titlebar to move it around
- **Resizable** — drag any edge or corner
- **Opacity slider** — hover the titlebar to reveal it, slide to make 
  the window semi-transparent
- **Multiple stickies** — open several pages at once, they auto-stack
- **System tray** — lives quietly in your tray, right-click for options
- **Helper dialog** — if no URL is in clipboard, shows instructions and 
  a manual paste field
- **Loading indicator** — shows a spinner while the page loads
- **Escape to close** — quick dismiss

## Customization

Edit the `CONFIG` object at the top of `main.js`:

```js
const CONFIG = {
  width: 480,           // Default window width
  height: 620,          // Default window height
  margin: 20,           // Margin from screen edge
  shortcutOpen: 'CommandOrControl+Shift+O',
  shortcutCloseAll: 'CommandOrControl+Shift+W',
  opacity: 0.97,        // Default opacity (0.0 - 1.0)
};
```

## Limitations

- Notion pages load inside an iframe. Some Notion pages may block iframe 
  embedding depending on your workspace settings. If you see a blank page, 
  try using the page's public/shared URL instead of the private workspace URL.
- You need to be logged into Notion in your default browser for authenticated 
  pages to work (the Electron window shares cookies with your system).
- Global shortcuts may conflict with other apps. Change them in CONFIG if needed.

## Project structure

```
notion-sticky/
├── main.js          # Electron main process (tray, shortcuts, windows)
├── preload.js       # Secure bridge between main and renderer
├── shell.html       # Sticky window UI (titlebar + iframe)
├── helper.html      # "No URL found" dialog
├── package.json     # Dependencies and build config
└── README.md        # You are here
```
