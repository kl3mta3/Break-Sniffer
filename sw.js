const KEY = 'breakSessions';
const STATE_KEY = 'trackingEnabled';
const CURRENT_KEY = 'currentBreak'; 
const MIN_SESSION_MS = 30 * 1000; 

let current = null;

chrome.runtime.onInstalled.addListener(restoreCurrent);
chrome.runtime.onStartup.addListener(restoreCurrent);
async function restoreCurrent() {
  const st = await chrome.storage.local.get(CURRENT_KEY);
  const cur = st && st[CURRENT_KEY];
  if (cur && typeof cur.start === 'number') {
    current = { start: cur.start };
    console.log('[BreakSniffer SW] restored current break from storage');
  }
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'toast') {
    showToast(msg.text);
    return;
  }

  // Tracking toggle
  const st = await chrome.storage.local.get(STATE_KEY);
  const enabled = st[STATE_KEY] !== false; 
  if (!enabled) return;

  const now = msg.when || Date.now();

  // START
if (msg.type === 'break-start' || (msg.type === 'break-visible' && msg.via !== 'initial')) {
  if (!current) {
    current = { start: now };
    await chrome.storage.local.set({ [CURRENT_KEY]: { start: now } });
    console.log('[BreakSniffer SW] break started @', new Date(now).toISOString(), 'via', msg.via || 'unknown');
  }
  return;
}

  // END
if (msg.type === 'break-hidden') {
  const curData = await chrome.storage.local.get(CURRENT_KEY);
  const stored = curData && curData[CURRENT_KEY];
  const startTs = (current && current.start) ||
                  (stored && typeof stored.start === 'number' ? stored.start : null);

  if (startTs == null) {
    console.log('[BreakSniffer SW] break-hidden ignored (no active start).');
    return;
  }

  const session = { start: startTs, end: now };
  current = null;
  await chrome.storage.local.remove(CURRENT_KEY);

  const dur = session.end - session.start;
  if (dur < (typeof MIN_SESSION_MS === 'number' ? MIN_SESSION_MS : 0)) {
    console.log('[BreakSniffer SW] short session ignored:', Math.round(dur/1000), 's');
    return;
  }

  const data = await chrome.storage.local.get(KEY);
  const all = Array.isArray(data[KEY]) ? data[KEY] : [];
  all.push(session);
  await chrome.storage.local.set({ [KEY]: all });
  console.log('[BreakSniffer SW] saved session', session);
  return;
}
});
// Toast 
function showToast(text) {
  chrome.tabs.query({ lastFocusedWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) return;

    const isWeb = (u) => !!u && /^https?:\/\//i.test(u);
    const target =
      tabs.find(t => t.active && isWeb(t.url) && t.id != null) ||
      tabs.find(t => isWeb(t.url) && t.id != null);

    if (!target) {
   
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: target.id, allFrames: true },
      func: (m) => {
        
        const t = document.createElement('div');
        t.textContent = m;
        Object.assign(t.style, {
          position: 'fixed', bottom: '20px', right: '20px',
          background: 'rgba(0,0,0,.9)', color: '#fff',
          padding: '8px 14px', borderRadius: '8px', fontSize: '14px',
          zIndex: 2147483647, opacity: '0', transition: 'opacity .25s'
        });
        document.body.appendChild(t);
        requestAnimationFrame(() => (t.style.opacity = '1'));
        setTimeout(() => {
          t.style.opacity = '0';
          setTimeout(() => t.remove(), 350);
        }, 1800);
      },
      args: [text]
    }).catch((err) => {
      console.warn('[BreakSniffer SW] toast inject skipped:', err);
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#f97316" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
    });
  });
}