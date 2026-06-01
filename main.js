const { app, BrowserWindow, globalShortcut, Tray, Menu, clipboard, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// ─── Debug mode (--dbg --url=<url> --auto-quit) ─────────────
const DEBUG = process.argv.includes('--dbg');
const AUTO_QUIT = process.argv.includes('--auto-quit');
const URL_ARG = (() => {
  const arg = process.argv.find(a => a.startsWith('--url='));
  return arg ? arg.split('=').slice(1).join('=') : null;
})();
const SCREENSHOT_PATH = path.join(__dirname, 'debug-screenshot.png');
const SCREENSHOT_DELAY = parseInt(
  (process.argv.find(a => a.startsWith('--screenshot-delay=')) || '').split('=')[1] || '5000',
  10
);

// ─── Configuration ───────────────────────────────────────────
const CONFIG = {
  // Window dimensions
  width: 860,
  height: 780,
  // Margin from screen edge when auto-positioning
  margin: 20,
  // Global shortcut to create a sticky
  shortcutOpen: 'CommandOrControl+Shift+O',
  // Global shortcut to close all stickies
  shortcutCloseAll: 'CommandOrControl+Shift+W',
  // Opacity (0.0 to 1.0)
  opacity: 1.0,
};

let tray = null;
let stickyWindows = [];
let lastUsedUrl = null;

// ─── Injected titlebar CSS ──────────────────────────────────
const TITLEBAR_CSS = `
body {
  padding-top: 32px !important;
}

#notion-sticky-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: #0d0d0d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 0 12px;
  user-select: none;
  cursor: grab;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-sizing: border-box;
}

#notion-sticky-titlebar * {
  box-sizing: border-box;
}

#notion-sticky-titlebar .ns-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

#notion-sticky-titlebar .ns-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffcc00;
  opacity: 0.9;
  flex-shrink: 0;
}

#notion-sticky-titlebar .ns-label {
  font-size: 11px;
  font-weight: 600;
  color: #999;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

#notion-sticky-titlebar .ns-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

#notion-sticky-titlebar .ns-btn {
  width: 28px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.15s ease;
  padding: 0;
}

#notion-sticky-titlebar .ns-btn:hover {
  background: #2a2a2a;
  color: #ccc;
}

#notion-sticky-titlebar .ns-btn.ns-close:hover {
  background: #e84040;
  color: #fff;
}

#notion-sticky-titlebar .ns-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
}

/* ── Hide scrollbar (overlaps 19px on right side otherwise) ── */
.notion-scroller::-webkit-scrollbar {
  width: 0 !important;
  display: none !important;
}
.notion-scroller {
  scrollbar-width: none !important;
}

/* ── Hide Notion top bar ── */
.notion-topbar,
.notion-topbar-mobile {
  display: none !important;
}

/* ── Hide sidebar (and its left-edge hover peek trigger) ── */
.notion-sidebar-container,
.notion-sidebar {
  display: none !important;
}

/* ── Hide bottom-right Notion AI bubble ── */
.notion-assistant-corner-origin-container,
.notion-ai-button {
  display: none !important;
}

/* ── Hide floating text selection toolbar ── */
.notion-text-action-menu {
  display: none !important;
}

/* ── Content top padding ── */
.notion-page-content {
  padding-top: 12px !important;
}

/* ── Zoom indicator toast ── */
#notion-sticky-zoom-toast {
  position: fixed;
  top: 44px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(13, 13, 13, 0.92);
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 5px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
  user-select: none;
  z-index: 2147483647;
  opacity: 0;
  transition: opacity 0.25s ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

`;

// ─── Injected titlebar JS ───────────────────────────────────
const TITLEBAR_JS = `
(function() {
  if (document.getElementById('notion-sticky-titlebar')) return;

  var bar = document.createElement('div');
  bar.id = 'notion-sticky-titlebar';

  // Left: dot + label
  var left = document.createElement('div');
  left.className = 'ns-left';
  var dot = document.createElement('span');
  dot.className = 'ns-dot';
  var label = document.createElement('span');
  label.className = 'ns-label';
  var pageTitle = document.title.replace(/\\s*[|–—]\\s*Notion$/, '').trim();
  label.textContent = pageTitle || 'Sticky';
  label.style.maxWidth = '200px';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.whiteSpace = 'nowrap';
  left.appendChild(dot);
  left.appendChild(label);

  // Right: controls
  var controls = document.createElement('div');
  controls.className = 'ns-controls';

  var pinBtn = document.createElement('button');
  pinBtn.className = 'ns-btn';
  pinBtn.title = 'Always on top';
  pinBtn.style.cursor = 'default';
  pinBtn.style.opacity = '0.4';
  pinBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2L12 16M12 2L8 6M12 2L16 6M5 22L19 22"/></svg>';

  var closeBtn = document.createElement('button');
  closeBtn.className = 'ns-btn ns-close';
  closeBtn.title = 'Close sticky';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6L18 18"/></svg>';

  controls.appendChild(pinBtn);
  controls.appendChild(closeBtn);

  bar.appendChild(left);
  bar.appendChild(controls);

  document.body.appendChild(bar);

  // Hide everything above .notion-page-content (title, properties, comments)
  var hiddenElements = [];
  var headerVisible = false;
  var hideAttempts = 0;
  var hideTimer = setInterval(function() {
    hideAttempts++;
    var content = document.querySelector('.notion-page-content');
    if (content) {
      var sibling = content.previousElementSibling;
      while (sibling) {
        sibling.style.display = 'none';
        hiddenElements.push(sibling);
        sibling = sibling.previousElementSibling;
      }
      var parent = content.parentElement;
      if (parent) {
        var pSibling = parent.previousElementSibling;
        while (pSibling) {
          if (!pSibling.id || pSibling.id !== 'notion-sticky-titlebar') {
            pSibling.style.display = 'none';
            hiddenElements.push(pSibling);
          }
          pSibling = pSibling.previousElementSibling;
        }
      }
      clearInterval(hideTimer);
    }
    if (hideAttempts > 50) clearInterval(hideTimer);
  }, 100);

  // Show a transient zoom-percent toast (called from main process on zoom IPC)
  window.__showZoomToast = function(pct) {
    var t = document.getElementById('notion-sticky-zoom-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'notion-sticky-zoom-toast';
      document.body.appendChild(t);
    }
    t.textContent = pct + '%';
    t.style.opacity = '1';
    if (window.__zoomToastTimer) clearTimeout(window.__zoomToastTimer);
    window.__zoomToastTimer = setTimeout(function() {
      t.style.opacity = '0';
    }, 700);
  };

  // Expose toggle so main process can call it via executeJavaScript
  window.__toggleNotionHeader = function() {
    headerVisible = !headerVisible;
    for (var i = 0; i < hiddenElements.length; i++) {
      hiddenElements[i].style.display = headerVisible ? '' : 'none';
    }
  };

  // Apply page-level "Small text" + "Full width" toggles via the "..." menu.
  // The topbar is display:none but the button still exists in the DOM and
  // React's delegated click handlers fire fine. The dropdown portals into
  // .notion-overlay-container at body level so it renders regardless.
  window.__applyStickyFormat = function() {
    var moreBtn = document.querySelector('.notion-topbar-more-button')
              || document.querySelector('[aria-label="More actions"]')
              || document.querySelector('.notion-topbar [role="button"]:last-child');
    if (!moreBtn) {
      console.log('[fmt] more button not found');
      return;
    }
    console.log('[fmt] clicking more button');
    moreBtn.click();

    setTimeout(function() {
      var overlay = document.querySelector('.notion-overlay-container');
      if (!overlay) { console.log('[fmt] overlay container not found'); return; }

      // Find a clickable menu row whose text starts with the target label.
      // Try several strategies in order of robustness.
      function findRow(label) {
        // Strategy A: walk up from each [role="switch"] looking for an
        // ancestor whose text starts with the label. Most reliable since
        // it anchors on the actual interactive control.
        var switches = overlay.querySelectorAll('[role="switch"]');
        for (var s = 0; s < switches.length; s++) {
          var p = switches[s];
          for (var d1 = 0; d1 < 10 && p && p !== overlay; d1++) {
            var t = (p.textContent || '').trim();
            if (t.indexOf(label) === 0 && t.length < 120) {
              console.log('[fmt] findRow(' + label + ') via switch ancestor depth=' + d1);
              return p;
            }
            p = p.parentElement;
          }
        }
        // Strategy B: role="menuitem"
        var items = overlay.querySelectorAll('[role="menuitem"]');
        for (var i = 0; i < items.length; i++) {
          var ti = (items[i].textContent || '').trim();
          if (ti.indexOf(label) === 0) {
            console.log('[fmt] findRow(' + label + ') via role=menuitem');
            return items[i];
          }
        }
        // Strategy C: original div walk (fallback)
        var divs = overlay.querySelectorAll('div');
        for (var j = 0; j < divs.length; j++) {
          var dv = divs[j];
          var txt = (dv.textContent || '').trim();
          if (txt.length === 0 || txt.length > 120) continue;
          if (txt.indexOf(label) !== 0) continue;
          var row = dv;
          for (var d2 = 0; d2 < 8 && row && row !== overlay; d2++) {
            if (row.getAttribute('role') === 'menuitem'
                || row.querySelector('[role="switch"]')
                || row.querySelector('input[type="checkbox"]')) {
              console.log('[fmt] findRow(' + label + ') via div walk depth=' + d2);
              return row;
            }
            row = row.parentElement;
          }
        }
        return null;
      }

      function isOn(row) {
        if (!row) return null;
        var sw = row.querySelector('[role="switch"], [aria-checked]');
        if (sw) {
          var v = sw.getAttribute('aria-checked');
          if (v === 'true') return true;
          if (v === 'false') return false;
        }
        var cb = row.querySelector('input[type="checkbox"]');
        if (cb) return cb.checked;
        return null;
      }

      ['Full width'].forEach(function(label) {
        var row = findRow(label);
        if (!row) { console.log('[fmt] ' + label + ' row not found'); return; }
        var state = isOn(row);
        console.log('[fmt] ' + label + ' currently on=' + state);
        if (state === true) {
          console.log('[fmt] ' + label + ' already on, skipping');
          return;
        }
        row.click();
        console.log('[fmt] clicked ' + label);
      });

      // Close the menu
      setTimeout(function() {
        document.body.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
        }));
      }, 120);
    }, 220);
  };

  // Event listeners
  closeBtn.addEventListener('click', function() {
    window.notionSticky.closeWindow();
  });

  // Manual drag (replaces -webkit-app-region: drag so dblclick works)
  var isDragging = false;
  bar.addEventListener('pointerdown', function(e) {
    if (e.target.closest('.ns-controls')) return;
    isDragging = true;
    bar.setPointerCapture(e.pointerId);
    bar.style.cursor = 'grabbing';
    window.notionSticky.startDrag(e.screenX, e.screenY);
  });

  bar.addEventListener('pointermove', function(e) {
    if (!isDragging) return;
    window.notionSticky.dragMove(e.screenX, e.screenY);
  });

  bar.addEventListener('pointerup', function(e) {
    if (!isDragging) return;
    isDragging = false;
    bar.releasePointerCapture(e.pointerId);
    bar.style.cursor = 'grab';
  });

  // Double-click titlebar to collapse/expand (window shade)
  bar.addEventListener('dblclick', function(e) {
    if (e.target.closest('.ns-controls')) return;
    window.notionSticky.toggleCollapse();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // Let Notion handle Escape natively (exit block editing, deselect, etc.)
      // Don't close the window — use the X button or Ctrl+Shift+W instead
      return;
    }
    // Ctrl+backtick toggle is handled in main process via before-input-event
  });

  // Ctrl+scroll to zoom in/out
  document.addEventListener('wheel', function(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    window.notionSticky.zoom(e.deltaY > 0 ? -0.05 : 0.05);
  }, { passive: false });

})();
`;

// ─── Layout override CSS (injected at user-origin to beat React inline styles) ─
const LAYOUT_CSS = `
.layout,
.layout.layout-wide,
.layout.layout-reskin-wider {
  --margin-width: 8px !important;
  grid-template-columns: [full-start] 8px [content-start] 1fr [content-end] 8px [full-end] !important;
}

.notion-frame {
  width: 100% !important;
  max-width: 100% !important;
}

.notion-scroller.vertical {
  width: 100% !important;
}

.layout-content {
  max-width: none !important;
}

.notion-page-content {
  max-width: none !important;
  width: 100% !important;
}

/* Every content block gets an inline max-width: 744px from React — override it */
.notion-page-content > .notion-selectable {
  max-width: 100% !important;
}

/* Tighten vertical spacing between blocks. The visible gap comes almost
   entirely from React-set inline padding on inner block divs (12px on the
   first child, 4px on the editable leaf), not from the .notion-selectable
   wrapper. Strip the vertical part; keep horizontal (it's the side breathing
   room inside each block). */
.notion-page-content > .notion-selectable {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

.notion-selectable > div {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
`;

// ─── Child-width diagnostic (debug only) ────────────────────
const CHILD_DIAGNOSTIC_JS = `
(function() {
  var attempts = 0;
  var timer = setInterval(function() {
    attempts++;
    var content = document.querySelector('.notion-page-content');
    if (!content || attempts > 30) {
      if (attempts > 30) console.log('[child] TIMEOUT');
      if (!content) return;
    }
    clearInterval(timer);

    var contentRect = content.getBoundingClientRect();
    console.log('[child] .notion-page-content width=' + contentRect.width.toFixed(1) + ' left=' + contentRect.left.toFixed(1) + ' right=' + contentRect.right.toFixed(1));

    // Check first 5 direct children
    var children = content.children;
    console.log('[child] Direct children count: ' + children.length);
    for (var i = 0; i < Math.min(children.length, 8); i++) {
      var c = children[i];
      var r = c.getBoundingClientRect();
      var cs = window.getComputedStyle(c);
      var cls = c.className && typeof c.className === 'string' ? c.className.substring(0, 60) : '';
      console.log('[child] child[' + i + '] class="' + cls + '" width=' + r.width.toFixed(1) + ' left=' + r.left.toFixed(1) + ' right=' + r.right.toFixed(1));
      console.log('[child]   display=' + cs.display + ' max-width=' + cs.maxWidth + ' width=' + cs.width + ' padding-right=' + cs.paddingRight);
      console.log('[child]   inline: ' + (c.getAttribute('style') || '(none)').substring(0, 200));

      // Go one level deeper - find the widest and narrowest grandchild
      if (c.children.length > 0) {
        for (var j = 0; j < Math.min(c.children.length, 3); j++) {
          var gc = c.children[j];
          var gr = gc.getBoundingClientRect();
          var gcs = window.getComputedStyle(gc);
          var gcls = gc.className && typeof gc.className === 'string' ? gc.className.substring(0, 60) : '';
          console.log('[child]   grandchild[' + j + '] class="' + gcls + '" width=' + gr.width.toFixed(1) + ' max-width=' + gcs.maxWidth + ' display=' + gcs.display);
          console.log('[child]     inline: ' + (gc.getAttribute('style') || '(none)').substring(0, 200));
        }
      }
    }

    // Also look for any element inside .notion-page-content with explicit max-width
    var allInContent = content.querySelectorAll('*');
    var constrainers = [];
    for (var k = 0; k < allInContent.length && constrainers.length < 10; k++) {
      var el = allInContent[k];
      var ecs = window.getComputedStyle(el);
      var mw = ecs.maxWidth;
      if (mw && mw !== 'none' && mw !== '100%') {
        var ecls = el.className && typeof el.className === 'string' ? el.className.substring(0, 40) : el.tagName;
        constrainers.push(ecls + ' max-width=' + mw);
      }
    }
    if (constrainers.length > 0) {
      console.log('[child] Elements with max-width constraints inside .notion-page-content:');
      for (var m = 0; m < constrainers.length; m++) {
        console.log('[child]   ' + constrainers[m]);
      }
    } else {
      console.log('[child] No max-width constraints found inside .notion-page-content');
    }
  }, 500);
})();
`;

// ─── Bounding-rect diagnostic (debug only) ──────────────────
const RECT_DIAGNOSTIC_JS = `
(function() {
  var attempts = 0;
  var timer = setInterval(function() {
    attempts++;
    var content = document.querySelector('.notion-page-content');
    if (!content || attempts > 30) {
      if (attempts > 30) console.log('[rect] TIMEOUT waiting for .notion-page-content');
      if (!content) return;
    }
    clearInterval(timer);

    var selectors = [
      '.notion-page-content',
      '.layout-content',
      '.layout',
      '.whenContentEditable',
      '.notion-scroller.vertical',
      '.notion-selectable-container',
      'main.notion-frame',
      '.notion-cursor-listener',
      'body'
    ];

    console.log('[rect] window.innerWidth=' + window.innerWidth + ' window.innerHeight=' + window.innerHeight);
    console.log('[rect] document.documentElement.clientWidth=' + document.documentElement.clientWidth);
    console.log('[rect] document.body.clientWidth=' + document.body.clientWidth);
    console.log('[rect] document.body.scrollWidth=' + document.body.scrollWidth);

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) { console.log('[rect] ' + selectors[i] + ' NOT FOUND'); continue; }
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      var overflow = cs.getPropertyValue('overflow') + '/' + cs.getPropertyValue('overflow-x') + '/' + cs.getPropertyValue('overflow-y');
      console.log('[rect] ' + selectors[i] + ' left=' + r.left.toFixed(1) + ' right=' + r.right.toFixed(1) + ' width=' + r.width.toFixed(1) + ' overflow=' + overflow);
    }

    // Check scrollbar width on .notion-scroller
    var scroller = document.querySelector('.notion-scroller.vertical');
    if (scroller) {
      console.log('[rect] scroller offsetWidth=' + scroller.offsetWidth + ' clientWidth=' + scroller.clientWidth + ' scrollbarWidth=' + (scroller.offsetWidth - scroller.clientWidth));
    }
  }, 500);
})();
`;

// ─── Theme variable dump (debug only) ──────────────────────
// Walks all stylesheets and collects every CSS custom property starting with
// --c- (Notion's color namespace). Logs the unique set with their currently
// resolved values, so we know what's available to override.
const THEME_VARS_DUMP_JS = `
(function() {
  setTimeout(function() {
    var found = {};
    // 1) Pull declared names from all accessible stylesheets
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        var rules;
        try { rules = sheet.cssRules || sheet.rules; } catch (e) { continue; }
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (!rule.style) continue;
          for (var p = 0; p < rule.style.length; p++) {
            var prop = rule.style[p];
            if (prop && prop.indexOf('--c-') === 0) {
              found[prop] = true;
            }
          }
        }
      }
    } catch (e) {
      console.log('[theme] stylesheet scan error: ' + e.message);
    }
    // 2) Resolve current value of each on documentElement
    var rootStyle = window.getComputedStyle(document.documentElement);
    var bodyStyle = window.getComputedStyle(document.body);
    var names = Object.keys(found).sort();
    console.log('[theme] ============== NOTION COLOR VARS (' + names.length + ') ==============');
    console.log('[theme] color-scheme: ' + rootStyle.colorScheme + ' / body: ' + bodyStyle.colorScheme);
    console.log('[theme] body bg: ' + bodyStyle.backgroundColor + ' color: ' + bodyStyle.color);
    for (var i = 0; i < names.length; i++) {
      var v = rootStyle.getPropertyValue(names[i]).trim();
      console.log('[theme] ' + names[i] + ' = ' + v);
    }
    console.log('[theme] ============== END ==============');
  }, 1500);
})();
`;

// ─── Block-spacing diagnostic (debug only) ──────────────────
const BLOCK_SPACING_DIAGNOSTIC_JS = `
(function() {
  var attempts = 0;
  var timer = setInterval(function() {
    attempts++;
    var content = document.querySelector('.notion-page-content');
    if (!content) {
      if (attempts > 30) { console.log('[blkspc] TIMEOUT'); clearInterval(timer); }
      return;
    }
    clearInterval(timer);
    console.log('[blkspc] ============== BLOCK SPACING DIAGNOSTIC ==============');
    var children = content.children;
    console.log('[blkspc] .notion-page-content has ' + children.length + ' direct children');

    function describe(el, depth) {
      var indent = new Array(depth * 2 + 1).join(' ');
      var cs = window.getComputedStyle(el);
      var cls = (el.className && typeof el.className === 'string') ? el.className.substring(0, 70) : '';
      var rect = el.getBoundingClientRect();
      console.log('[blkspc] ' + indent + '<' + el.tagName.toLowerCase() + '> class="' + cls + '"');
      console.log('[blkspc] ' + indent + '  rect.h=' + rect.height.toFixed(1) +
        ' margin=' + cs.marginTop + '/' + cs.marginBottom +
        ' padding=' + cs.paddingTop + '/' + cs.paddingBottom);
      console.log('[blkspc] ' + indent + '  min-height=' + cs.minHeight +
        ' line-height=' + cs.lineHeight +
        ' display=' + cs.display);
      var inl = el.getAttribute('style');
      if (inl) console.log('[blkspc] ' + indent + '  inline: ' + inl.substring(0, 200));
    }

    for (var i = 0; i < Math.min(children.length, 4); i++) {
      var block = children[i];
      console.log('[blkspc] --- block[' + i + '] ---');
      describe(block, 0);
      var d = block;
      var depth = 1;
      while (depth <= 5 && d.children && d.children.length > 0) {
        d = d.children[0];
        describe(d, depth);
        depth++;
      }
    }
    console.log('[blkspc] ============== END ==============');
  }, 500);
})();
`;

// ─── Diagnostic JS (injected only when DEBUG=true) ─────────
const DIAGNOSTIC_JS = `
(function() {
  var attempts = 0;
  var maxAttempts = 20;
  var timer = setInterval(function() {
    attempts++;
    var content = document.querySelector('.notion-page-content');
    if (!content) {
      if (attempts >= maxAttempts) {
        console.log('[diag] FAILED: .notion-page-content not found after ' + maxAttempts + ' attempts');
        clearInterval(timer);
      }
      return;
    }
    clearInterval(timer);
    console.log('[diag] ================================================');
    console.log('[diag] DOM ANCESTOR CHAIN from .notion-page-content');
    console.log('[diag] ================================================');

    var props = [
      'display', 'grid-template-columns', 'grid-template-rows',
      'width', 'max-width', 'min-width',
      'padding-left', 'padding-right',
      'margin-left', 'margin-right'
    ];
    var customProps = ['--margin-width', '--content-width', '--full-width'];

    var el = content;
    var depth = 0;
    while (el && el !== document.documentElement) {
      var cs = window.getComputedStyle(el);
      var tag = el.tagName.toLowerCase();
      var id = el.id ? ('#' + el.id) : '';
      var cls = el.className && typeof el.className === 'string'
        ? ('.' + el.className.trim().replace(/\\s+/g, '.'))
        : '';
      var inlineStyle = el.getAttribute('style') || '(none)';

      console.log('[diag] --- depth ' + depth + ': <' + tag + id + cls + '> ---');
      console.log('[diag]   inline style: ' + inlineStyle);

      for (var i = 0; i < props.length; i++) {
        console.log('[diag]   ' + props[i] + ': ' + cs.getPropertyValue(props[i]));
      }

      for (var j = 0; j < customProps.length; j++) {
        var val = cs.getPropertyValue(customProps[j]);
        if (val && val.trim()) {
          console.log('[diag]   ' + customProps[j] + ': ' + val.trim());
        } else {
          console.log('[diag]   ' + customProps[j] + ': (not set)');
        }
      }

      if (cs.getPropertyValue('display').indexOf('grid') !== -1) {
        console.log('[diag]   ** THIS IS A GRID CONTAINER **');
        console.log('[diag]   grid-template-columns (full): ' + cs.getPropertyValue('grid-template-columns'));
        console.log('[diag]   grid-template-rows (full): ' + cs.getPropertyValue('grid-template-rows'));
        console.log('[diag]   grid-column-gap: ' + cs.getPropertyValue('grid-column-gap'));
        console.log('[diag]   grid-row-gap: ' + cs.getPropertyValue('grid-row-gap'));
        console.log('[diag]   justify-content: ' + cs.getPropertyValue('justify-content'));
        console.log('[diag]   align-items: ' + cs.getPropertyValue('align-items'));
      }

      el = el.parentElement;
      depth++;
    }

    // Also look for .layout element and dump its custom properties
    console.log('[diag] ================================================');
    console.log('[diag] CHECKING .layout ELEMENT');
    console.log('[diag] ================================================');
    var layout = document.querySelector('.layout');
    if (layout) {
      var lcs = window.getComputedStyle(layout);
      console.log('[diag] .layout found: <' + layout.tagName.toLowerCase() +
        (layout.id ? '#' + layout.id : '') +
        (layout.className && typeof layout.className === 'string'
          ? '.' + layout.className.trim().replace(/\\s+/g, '.')
          : '') + '>');
      console.log('[diag]   display: ' + lcs.getPropertyValue('display'));
      console.log('[diag]   width: ' + lcs.getPropertyValue('width'));
      console.log('[diag]   max-width: ' + lcs.getPropertyValue('max-width'));
      console.log('[diag]   padding-left: ' + lcs.getPropertyValue('padding-left'));
      console.log('[diag]   padding-right: ' + lcs.getPropertyValue('padding-right'));
      for (var k = 0; k < customProps.length; k++) {
        var v = lcs.getPropertyValue(customProps[k]);
        console.log('[diag]   ' + customProps[k] + ': ' + (v && v.trim() ? v.trim() : '(not set)'));
      }
      // Try to read all CSS custom properties from inline style
      var inl = layout.getAttribute('style') || '(none)';
      console.log('[diag]   inline style: ' + inl);
      // Check for grid-template-columns on layout
      if (lcs.getPropertyValue('display').indexOf('grid') !== -1) {
        console.log('[diag]   ** .layout IS A GRID CONTAINER **');
        console.log('[diag]   grid-template-columns: ' + lcs.getPropertyValue('grid-template-columns'));
      }
    } else {
      console.log('[diag] .layout element NOT FOUND');
    }

    // Also scan for any element with class containing "layout" or "page-full-width"
    console.log('[diag] ================================================');
    console.log('[diag] GRID ELEMENTS SCAN');
    console.log('[diag] ================================================');
    var allEls = document.querySelectorAll('*');
    var gridCount = 0;
    for (var g = 0; g < allEls.length && gridCount < 20; g++) {
      var gcs = window.getComputedStyle(allEls[g]);
      if (gcs.getPropertyValue('display').indexOf('grid') !== -1) {
        var gtag = allEls[g].tagName.toLowerCase();
        var gcls = allEls[g].className && typeof allEls[g].className === 'string'
          ? allEls[g].className.trim().substring(0, 80)
          : '';
        console.log('[diag] grid#' + gridCount + ': <' + gtag + '> class="' + gcls + '"');
        console.log('[diag]   grid-template-columns: ' + gcs.getPropertyValue('grid-template-columns'));
        gridCount++;
      }
    }
    console.log('[diag] Total grid elements found (capped at 20): ' + gridCount);
    console.log('[diag] ================================================');
    console.log('[diag] DIAGNOSTIC COMPLETE');
    console.log('[diag] ================================================');
  }, 500);
})();
`;

// ─── Create a sticky window ─────────────────────────────────
function createStickyWindow(url) {
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;

  // Stack multiple stickies with offset
  const offset = stickyWindows.length * 30;
  const x = screenW - CONFIG.width - CONFIG.margin - offset;
  const y = CONFIG.margin + offset;

  const win = new BrowserWindow({
    width: CONFIG.width,
    height: CONFIG.height,
    x: x,
    y: y,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    opacity: CONFIG.opacity,
    backgroundColor: '#1e1e1e',
    title: 'Notion Sticky',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the Notion URL directly (bypasses X-Frame-Options)
  win.loadURL(url);

  // Intercept shortcuts before Notion's JS sees them
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === '`') {
      event.preventDefault();
      win.webContents.executeJavaScript('window.__toggleNotionHeader && window.__toggleNotionHeader()');
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'f') {
      event.preventDefault();
      win.webContents.executeJavaScript('window.__applyStickyFormat && window.__applyStickyFormat()');
    }
    if (input.key === 'F12') {
      event.preventDefault();
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // ─── Debug: forward renderer console to stdout ───────────
  if (DEBUG) {
    const levelNames = ['verbose', 'info', 'warning', 'error'];
    win.webContents.on('console-message', (_e, level, msg, line, sourceId) => {
      const tag = levelNames[level] || level;
      console.log(`[renderer:${tag}] ${msg}  (${sourceId}:${line})`);
    });

    // Capture screenshot after page settles
    win.webContents.on('did-finish-load', () => {
      console.log(`[debug] did-finish-load, waiting ${SCREENSHOT_DELAY}ms for Notion to render...`);
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(SCREENSHOT_PATH, image.toPNG());
          console.log(`[debug] screenshot saved to ${SCREENSHOT_PATH}`);
        } catch (err) {
          console.error(`[debug] screenshot failed: ${err.message}`);
        }
        if (AUTO_QUIT) {
          console.log('[debug] auto-quit: exiting');
          app.quit();
        }
      }, SCREENSHOT_DELAY);
    });
  }

  // Inject custom titlebar overlay once the DOM is ready
  win.webContents.on('dom-ready', () => {
    win.webContents.setZoomFactor(0.9);
    win.webContents.insertCSS(TITLEBAR_CSS);
    // Layout overrides at user-origin: beats React inline styles in CSS cascade
    win.webContents.insertCSS(LAYOUT_CSS, { cssOrigin: 'user' });
    win.webContents.executeJavaScript(TITLEBAR_JS);
    if (DEBUG) {
      win.webContents.executeJavaScript(DIAGNOSTIC_JS);
      win.webContents.executeJavaScript(RECT_DIAGNOSTIC_JS);
      win.webContents.executeJavaScript(CHILD_DIAGNOSTIC_JS);
      win.webContents.executeJavaScript(BLOCK_SPACING_DIAGNOSTIC_JS);
      win.webContents.executeJavaScript(THEME_VARS_DUMP_JS);
    }
  });

  // Open external links in the default browser
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl.includes('notion.so') || navigationUrl.includes('notion.site')) {
      return;
    }
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    // Allow auth popups (Google, Apple, Microsoft, etc.)
    if (openUrl.includes('accounts.google.com') ||
        openUrl.includes('appleid.apple.com') ||
        openUrl.includes('login.microsoftonline.com') ||
        openUrl.includes('notion.so')) {
      return { action: 'allow' };
    }
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  // Track window
  stickyWindows.push(win);

  win.on('closed', () => {
    stickyWindows = stickyWindows.filter(w => w !== win);
  });

  return win;
}

// ─── Extract Notion URL from clipboard ───────────────────────
function getNotionUrlFromClipboard() {
  const text = clipboard.readText().trim();

  // Accept notion.so URLs
  if (text.includes('notion.so/') || text.includes('notion.site/')) {
    return text;
  }

  return null;
}

// ─── Create tray icon and menu ───────────────────────────────
function createTray() {
  // Create a simple 16x16 icon programmatically (yellow sticky note)
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const i = (y * iconSize + x) * 4;
      // Simple sticky note shape: yellow square with folded corner
      if (x < 14 && y < 14 && !(x > 10 && y < 3)) {
        canvas[i] = 255;     // R
        canvas[i + 1] = 204; // G
        canvas[i + 2] = 0;   // B
        canvas[i + 3] = 255; // A
      } else if (x >= 10 && y < 4 && x < 14 && y >= 0) {
        canvas[i] = 230;     // R
        canvas[i + 1] = 180; // G
        canvas[i + 2] = 0;   // B
        canvas[i + 3] = 200; // A
      } else {
        canvas[i] = 0;
        canvas[i + 1] = 0;
        canvas[i + 2] = 0;
        canvas[i + 3] = 0;
      }
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📌  New Sticky from Clipboard',
      click: () => handleOpenSticky(),
    },
    { type: 'separator' },
    {
      label: `Open:  ${CONFIG.shortcutOpen}`,
      enabled: false,
    },
    {
      label: `Close All:  ${CONFIG.shortcutCloseAll}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '🗑  Close All Stickies',
      click: () => closeAllStickies(),
    },
    { type: 'separator' },
    {
      label: 'Quit Notion Sticky',
      click: () => {
        closeAllStickies();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Notion Sticky — Ctrl+Shift+O to pin a page');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => handleOpenSticky());
}

// ─── Handle opening a sticky ─────────────────────────────────
function handleOpenSticky() {
  // Check if clipboard has a NEW Notion URL (e.g. from "Copy link" in database view)
  const clipUrl = getNotionUrlFromClipboard();
  if (clipUrl && clipUrl !== lastUsedUrl) {
    lastUsedUrl = clipUrl;
    createStickyWindow(clipUrl);
    return;
  }

  // Otherwise, grab the fresh URL from the foreground app's address bar
  const psCommand = 'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^l\'); Start-Sleep -Milliseconds 200; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"';

  exec(psCommand, () => {
    setTimeout(() => {
      const url = getNotionUrlFromClipboard();
      if (url) {
        lastUsedUrl = url;
        createStickyWindow(url);
      } else {
        showHelperWindow();
      }
    }, 200);
  });
}

// ─── Show helper / paste window ──────────────────────────────
function showHelperWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 400,
    height: 220,
    x: Math.round(screenW / 2 - 200),
    y: Math.round(screenH / 2 - 110),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('helper.html');

  // Close on blur
  win.on('blur', () => {
    if (!win.isDestroyed()) win.close();
  });
}

// ─── Close all sticky windows ────────────────────────────────
function closeAllStickies() {
  stickyWindows.forEach(win => {
    if (!win.isDestroyed()) win.close();
  });
  stickyWindows = [];
}

// ─── IPC handlers ────────────────────────────────────────────
ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.on('open-url', (event, url) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
  if (url && (url.includes('notion.so') || url.includes('notion.site'))) {
    createStickyWindow(url);
  }
});

ipcMain.on('set-opacity', (event, opacity) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setOpacity(Math.max(0.3, Math.min(1.0, opacity)));
  }
});

ipcMain.on('toggle-collapse', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getSize();
  if (!win._expandedHeight) {
    // Collapse: shrink to ~titlebar height, but keep resizable so the user
    // can still drag width. Lock height via a will-resize handler instead of
    // setResizable(false), which would also block width drags.
    win._expandedHeight = height;
    win.setSize(width, 32);
    const [, collapsedH] = win.getSize();
    const handler = (e, newBounds) => {
      if (newBounds.height !== collapsedH) {
        e.preventDefault();
        win.setBounds({
          x: newBounds.x,
          y: newBounds.y,
          width: newBounds.width,
          height: collapsedH,
        });
      }
    };
    win._collapsedResizeHandler = handler;
    win.on('will-resize', handler);
  } else {
    // Expand: drop the resize lock and restore saved height
    if (win._collapsedResizeHandler) {
      win.removeListener('will-resize', win._collapsedResizeHandler);
      win._collapsedResizeHandler = null;
    }
    win.setSize(width, win._expandedHeight);
    win._expandedHeight = null;
  }
});

ipcMain.on('zoom', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const current = win.webContents.getZoomFactor();
    const next = Math.max(0.3, Math.min(2.0, current + delta));
    win.webContents.setZoomFactor(next);
    const pct = Math.round(next * 100);
    win.webContents.executeJavaScript(`window.__showZoomToast && window.__showZoomToast(${pct})`);
  }
});

ipcMain.on('start-drag', (event, screenX, screenY) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const [winX, winY] = win.getPosition();
    win._dragOffset = { x: screenX - winX, y: screenY - winY };
  }
});

ipcMain.on('drag-move', (event, screenX, screenY) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win._dragOffset) {
    win.setPosition(screenX - win._dragOffset.x, screenY - win._dragOffset.y);
  }
});

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
  createTray();

  // Register global shortcuts
  globalShortcut.register(CONFIG.shortcutOpen, () => handleOpenSticky());
  globalShortcut.register(CONFIG.shortcutCloseAll, () => closeAllStickies());

  // ─── Debug: auto-open URL from CLI arg ──────────────────
  if (URL_ARG) {
    console.log(`[debug] auto-opening URL: ${URL_ARG}`);
    createStickyWindow(URL_ARG);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep app running when all windows are closed (tray app)
app.on('window-all-closed', (e) => {
  // Don't quit — we live in the tray
});
