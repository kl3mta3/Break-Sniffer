const KEY = 'breakSessions';
const STATE_KEY = 'trackingEnabled';
const CURRENT_KEY = 'currentBreak';

let tickHandle = null;
let currentStart = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const toggleBtn  = document.getElementById('toggleBtn');
  const statusLbl  = document.getElementById('statusLabel');
  const timerEl    = document.getElementById('liveTimer');
  const rowsEl     = document.getElementById('rows');
  const totalEl    = document.getElementById('total');
  const kTotalEl   = document.getElementById('kTotal');
  const kCountEl   = document.getElementById('kCount');
  const refreshBtn = document.getElementById('refreshBtn');
  const reportBtn  = document.getElementById('reportBtn');
  const kWeeklyEl = document.getElementById('kWeekly');
  // Load tracking state
  let { [STATE_KEY]: enabled = true } = await chrome.storage.local.get(STATE_KEY);
  updateStatus(statusLbl, enabled);

  // Toggle button:
  //  - click = enable/disable tracking
  //  - SHIFT/ALT/CTRL + click = manual start/stop break (updates timer instantly)
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async (e) => {
      if (e.shiftKey || e.altKey || e.ctrlKey) {
        // Manual start/stop
        const cur = await chrome.storage.local.get(CURRENT_KEY);
        if (cur[CURRENT_KEY]?.start) {
          // End manual break
          const start = cur[CURRENT_KEY].start;
          const end = Date.now();
          const data = await chrome.storage.local.get(KEY);
          const all = Array.isArray(data[KEY]) ? data[KEY] : [];
          all.push({ start, end });
          await chrome.storage.local.set({ [KEY]: all });
          await chrome.storage.local.remove(CURRENT_KEY);
          stopTimer(timerEl);
          chrome.runtime.sendMessage({ type: 'toast', text: 'Manual break ended ✅' });
        } else {
          // Start manual break
          const now = Date.now();
          await chrome.storage.local.set({ [CURRENT_KEY]: { start: now } });
          startTimer(timerEl, now);
          chrome.runtime.sendMessage({ type: 'toast', text: 'Manual break started ⏱️' });
        }
        // Re-render totals after a tiny delay (in case session list changed)
        setTimeout(() => loadAndRenderToday(rowsEl, totalEl, kTotalEl, kCountEl), 50);
        return;
      }

      // Normal: enable/disable tracking listeners
      enabled = !enabled;
      await chrome.storage.local.set({ [STATE_KEY]: enabled });
      updateStatus(statusLbl, enabled);
      chrome.runtime.sendMessage({ type: 'toast', text: enabled ? 'Tracking Enabled ✅' : 'Tracking Disabled ⛔' });
    });
  }

  // Bootstrap timer if a break is already in progress
  const st = await chrome.storage.local.get(CURRENT_KEY);
  if (st[CURRENT_KEY]?.start) {
    currentStart = st[CURRENT_KEY].start;
    startTimer(timerEl, currentStart);
  } else {
    stopTimer(timerEl);
  }

  // Render today's rows
  await loadAndRenderToday(rowsEl, totalEl, kTotalEl, kCountEl);

  // Live updates
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (CURRENT_KEY in changes) {
      const nv = changes[CURRENT_KEY].newValue;
      if (nv?.start) startTimer(timerEl, nv.start); else stopTimer(timerEl);
    }
    if (KEY in changes) loadAndRenderToday(rowsEl, totalEl, kTotalEl, kCountEl);
  });

  // Buttons
  if (reportBtn)  reportBtn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'toast', text: 'Report generation coming soon…' }));
const resetBtn = document.getElementById('resetBtn');

if (resetBtn) {
  resetBtn.addEventListener('click', onResetClick);
}

async function onResetClick() {
  if (!confirm('Reset break history?\nThis will delete all saved sessions and stop the live timer.')) {
    return;
  }

  await chrome.storage.local.remove([KEY, CURRENT_KEY]);

  const timerEl = document.getElementById('liveTimer');
  stopTimer(timerEl);

  const rowsEl   = document.getElementById('rows');
  const totalEl  = document.getElementById('total');
  const kTotalEl = document.getElementById('kTotal');
  const kCountEl = document.getElementById('kCount');
  await loadAndRenderToday(rowsEl, totalEl, kTotalEl, kCountEl);

  chrome.runtime.sendMessage({ type: 'toast', text: 'Break history cleared ✅' });
}


}

// UI helpers
function updateStatus(lblEl, on) {
  if (!lblEl) return;
  lblEl.textContent = on ? 'Enabled' : 'Disabled';
  lblEl.classList.toggle('enabled', on);
  lblEl.classList.toggle('disabled', !on);
}
function startTimer(el, startMs) {
  if (!el) return;
  el.classList.remove('hidden');
  renderTimer(el, startMs);
  clearInterval(tickHandle);
  tickHandle = setInterval(() => renderTimer(el, startMs), 1000);
}
function stopTimer(el) {
  clearInterval(tickHandle);
  tickHandle = null;
  if (el) el.classList.add('hidden');
}
function renderTimer(el, startMs) {
  if (!el) return;
  const ms = Math.max(0, Date.now() - startMs);
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  el.textContent = `${mm}m ${String(ss).padStart(2,'0')}s`;
}

// Data 
async function loadAndRenderToday(rowsEl, totalEl, kTotalEl, kCountEl) {
  const data = await chrome.storage.local.get('breakSessions');
  const all = data['breakSessions'] || [];
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const { start: weekStart, end: weekEnd } = getWeekBounds();

  if (rowsEl) rowsEl.innerHTML = '';

  let todayMs = 0;
  const todays = all.filter(s => s.start >= startOfDay.getTime());

  todays.forEach(s => {
    const lenMs = Math.max(0, (s.end ?? Date.now()) - s.start);
    todayMs += lenMs;

    if (rowsEl) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmt(new Date(s.start))}</td>
        <td>${s.end ? fmt(new Date(s.end)) : '—'}</td>
        <td>${dur(lenMs)}</td>
      `;
      rowsEl.appendChild(tr);
    }
  });

  let weekMs = 0;
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  all.forEach(s => {
    if (s.start >= weekStartMs && s.start < weekEndMs) {
      weekMs += Math.max(0, (s.end ?? Date.now()) - s.start);
    }
  });

  const todayText = dur(todayMs);
  if (totalEl)  totalEl.textContent  = todayText;
  if (kTotalEl) kTotalEl.textContent = todayText;

  const kWeeklyEl = document.getElementById('kWeekly');
  if (kWeeklyEl) kWeeklyEl.textContent = dur(weekMs);

  if (kCountEl) kCountEl.textContent = String(todays.length);
}

// Utils
function fmt(d) {
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}
function dur(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}

function getWeekBounds() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();        
  start.setDate(start.getDate() - day); 
  const end = new Date(start);
  end.setDate(start.getDate() + 7);  
  return { start, end };
}