// injected.js 
(function() {
  const fire = (detail) => {
    try {
      window.dispatchEvent(new CustomEvent('break-hook', { detail }));
    } catch {}
  };

  // If Break exists now, wrap it
  if (typeof window.Break === 'function') {
    const orig = window.Break;
    window.Break = function(...args) {
      fire({ when: Date.now(), source: 'Break()' });
      return orig.apply(this, args);
    };
  }

  // Ensure future assignments are wrapped, too
  let _val = window.Break;
  Object.defineProperty(window, 'Break', {
    configurable: true,
    enumerable: true,
    get() { return _val; },
    set(v) {
      _val = (typeof v === 'function') ? function(...args) {
        fire({ when: Date.now(), source: 'Break() (late)' });
        return v.apply(this, args);
      } : v;
    }
  });
})();