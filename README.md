# Break Sniffer (Chrome Extension)

Track your break start/end times with a compact, dark-themed popup. Sessions are stored **locally** (no servers) and totals are shown for **today** and **this week**.

---

## Features

- Auto-detects break **start/stop**
- **Today** and **Weekly** totals + session list
- One-click **Reset** (with confirmation)
- Manual break: **Shift+Click** the toggle to start/stop a break
- Persists across reloads/restarts via `chrome.storage.local`

---

## Install (unpacked)

1. `git clone` this repo
2. Open `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the repo folder
4. Pin the extension (click the puzzle icon → pin)

---

## Usage

- **Toggle tracking:** click **Toggle Tracking** in the popup  
- **Manual break:** **Shift+Click** the toggle to start/stop immediately  
- **Reset data:** click **Reset** → confirm; all sessions + current break are cleared  
- **Auto totals:** popup recalculates Today + Weekly on the fly

---

## Configuration

Weekly total starts **Sunday → Saturday** (see `getWeekBounds()` in `popup.js`). Change it if you prefer ISO Monday.

---

## Privacy

All data is stored **locally** in `chrome.storage.local`. No data leaves your device. See `docs/privacy.html` (or the repo’s Privacy Policy page) for the full text.

---
