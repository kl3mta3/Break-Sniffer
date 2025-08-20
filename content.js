const LOG = (...a) => console.debug('[BreakSniffer]', ...a);
const send = (msg) => chrome.runtime.sendMessage(msg);

// ---------- 1) Hook window.Break (even if assigned later) ----------
(function hookBreak() {
  if (typeof window.Break === 'function') {
    LOG('Wrapping existing Break()');
    window.Break = wrap(window.Break);
  }
  let _val = window.Break;
  Object.defineProperty(window, 'Break', {
    configurable: true,
    enumerable: true,
    get() { return _val; },
    set(v) {
      LOG('Break assigned; wrapping');
      _val = (typeof v === 'function') ? wrap(v) : v;
    }
  });
})();
function wrap(fn) {
  return function (...args) {
    try { send({ type: 'break-start', when: Date.now(), via: 'hook' }); } catch {}
    return fn.apply(this, args);
  };
}

// ---------- 2) Observe #break tag  ----------
const isVisible = (el) => {
  const cs = getComputedStyle(el);
  const inline = (el.getAttribute('style') || '').toLowerCase();
  const hiddenClass = /\bhidden\b/.test(el.className);
  return !hiddenClass && cs.visibility !== 'hidden' && cs.display !== 'none' &&
         !(inline.includes('visibility: hidden') || inline.includes('display: none')) &&
         el.offsetParent !== null;
};
(function watchBreakTag() {
  let node = document.getElementById('break');
  if (!node) {
    const ro = new MutationObserver(() => {
      node = document.getElementById('break');
      if (node) { attach(node); ro.disconnect(); }
    });
    ro.observe(document.documentElement, { childList: true, subtree: true });
  } else {
    attach(node);
  }
  function attach(el) {
    let last = isVisible(el);
    LOG('#break initial:', last);
    if (last) send({ type: 'break-visible', when: Date.now(), via: 'initial' });
    const mo = new MutationObserver(() => {
      const vis = isVisible(el);
      if (vis !== last) {
        last = vis;
        send({ type: vis ? 'break-visible' : 'break-hidden', when: Date.now(), via: 'mutation' });
        LOG('tag →', vis ? 'visible' : 'hidden');
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['style','class'], childList: true, subtree: true });
  }
})();

// ---------- 3) Network hooks (ToggleBreak + GetAdvisorBreakStatus) ----------
const STATUS_PATH = '/Telemonitor/GetAdvisorBreakStatus';
const TOGGLE_PATH = '/Telemonitor/ToggleBreak';

function inferBreakState(obj) {
  try {
    if (!obj || typeof obj !== 'object') return null;
    for (const [k, v] of Object.entries(obj)) {
      if (!/break/i.test(k)) continue;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.toLowerCase();
        if (/(on|true|active|started)/.test(s)) return true;
        if (/(off|false|inactive|ended)/.test(s)) return false;
      }
    }
    if (typeof obj.status === 'string' && /break/i.test(obj.status)) {
      return /on|active/i.test(obj.status);
    }
  } catch {}
  return null;
}

// fetch()
(function patchFetch(){
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const input = args[0];
    const init  = args[1] || {};
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const res = await orig(...args);
    try {
      if (url.includes(TOGGLE_PATH)) {
        send({ type: 'break-start', when: Date.now(), via: 'fetch-toggle' });
      }
      if (url.includes(STATUS_PATH)) {
        res.clone().json().then((data) => {
          const state = inferBreakState(data);
          if (state === true)  send({ type: 'break-visible', when: Date.now(), via: 'fetch-status' });
          if (state === false) send({ type: 'break-hidden',  when: Date.now(), via: 'fetch-status' });
        }).catch(()=>{});
      }
    } catch {}
    return res;
  };
  LOG('fetch patched');
})();

// XHR
(function patchXHR(){
  const open = XMLHttpRequest.prototype.open;
  const sendX = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__bs = { url: url || '' };
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...a) {
    this.addEventListener('loadend', function() {
      try {
        const url = (this.__bs && this.__bs.url) || '';
        if (!url) return;
        if (url.includes(TOGGLE_PATH)) {
          send({ type: 'break-start', when: Date.now(), via: 'xhr-toggle' });
        }
        if (url.includes(STATUS_PATH)) {
          let data = null;
          try {
            if (this.responseType === '' || this.responseType === 'text')
              data = JSON.parse(this.responseText);
            else
              data = this.response;
          } catch {}
          const state = inferBreakState(data);
          if (state === true)  send({ type: 'break-visible', when: Date.now(), via: 'xhr-status' });
          if (state === false) send({ type: 'break-hidden',  when: Date.now(), via: 'xhr-status' });
        }
      } catch {}
    });
    return sendX.apply(this, a);
  };
  LOG('XMLHttpRequest patched');
})();

// ---------- 4) Fallback: anchor with onclick="Break()" ----------
document.addEventListener('click', (ev) => {
  const a = ev.target?.closest('a');
  if (!a) return;
  const onclick = (a.getAttribute('onclick') || '').toLowerCase();
  if (onclick.includes('break(')) {
    send({ type: 'break-start', when: Date.now(), via: 'anchor' });
  }
}, true);

// ---------- 5) End on unload if tag still visible ----------
window.addEventListener('beforeunload', () => {
  const el = document.getElementById('break');
  if (el && isVisible(el)) {
    send({ type: 'break-hidden', when: Date.now(), via: 'unload' });
  }
});