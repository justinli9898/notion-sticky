# Notion Sticky — Installation Guide

Step-by-step instructions for setting up Notion Sticky on a new device.

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Node.js** | v18 or later | JavaScript runtime |
| **npm** | Included with Node.js | Package manager |
| **Git** | Any recent version | Clone the repo (or download zip instead) |
| **Windows 10/11** | Required | OS (the SendKeys URL-grabbing and tray behavior are Windows-specific) |

No other system-level dependencies. Electron (the app framework) is installed automatically by npm.

## Option A: Run from source

### 1. Install Node.js

If Node.js isn't installed, pick one of these methods:

**Using fnm (recommended):**
```powershell
winget install Schniz.fnm
fnm install --lts
fnm use lts-latest
```

**Using the official installer:**
Download from https://nodejs.org (LTS version). Run the installer with default settings.

Verify it worked:
```bash
node --version   # should print v18.x or later
npm --version    # should print 9.x or later
```

### 2. Get the code

```bash
git clone <your-repo-url> notion-sticky
cd notion-sticky
```

Or download the zip and extract it.

### 3. Install packages

```bash
npm install
```

This downloads Electron (~200MB) and all other dependencies. Takes 1-2 minutes on a fresh machine.

### 4. Run the app

```bash
npm start
```

A yellow sticky-note icon appears in the system tray. The app is now running.

### 5. First-time Notion login

The first time you open a sticky (Ctrl+Shift+O with a Notion URL in clipboard), you'll see the Notion login page. Sign in with your Google/Microsoft/Apple account. This is a one-time step — Electron stores the session cookies and you'll stay logged in.

## Option B: Build a portable .exe

If you don't want to install Node.js on the target device, build a standalone executable on your dev machine and copy it over.

### On your dev machine:

```bash
cd notion-sticky
npm install
npm run build
```

This creates `dist/NotionSticky.exe` — a single portable executable (~80MB).

### On the target device:

1. Copy `NotionSticky.exe` to any folder
2. Double-click to run — no installation needed
3. Sign into Notion on first launch (same as step 5 above)

## Usage

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+O** | Open a sticky from clipboard URL (or grab URL from active browser) |
| **Ctrl+Shift+W** | Close all open stickies |
| **Escape** | Close the focused sticky |
| **Ctrl+Scroll** | Zoom in/out |
| **Double-click titlebar** | Collapse/expand (window shade) |

### Opening a sticky

**From a browser:** Navigate to a Notion page, press Ctrl+Shift+O. The app grabs the URL from the address bar.

**From Notion desktop:** Click "..." on a database row > "Copy link", then press Ctrl+Shift+O.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails behind a corporate proxy | Set npm proxy: `npm config set proxy http://proxy:port` |
| Ctrl+Shift+O doesn't work | Another app may have claimed that shortcut. Edit `CONFIG.shortcutOpen` in `main.js` |
| Blank white window | You need to log into Notion first — the login page should appear automatically |
| "Cannot find module electron" | Run `npm install` again — Electron didn't download fully |
| Sticky shows login page every time | Corporate SSO may block cookies. Try the portable .exe build instead (it has its own cookie store) |
| Build fails with `electron-builder` errors | Make sure you're on Node 18+ and try `npm ci` for a clean install |
