/*
 * Utility helpers for the addon builder.  These functions include
 * slug generation and safe numeric parsing.  They are shared by
 * multiple addon modules.
 */

;(function(){
  function slug(str, i) {
    const b = (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return b || 'field_' + i;
  }
  function num(v) {
    if (!v) return 0;
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  function intVal(v) {
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;');
  }
  window.addonSlug = slug;
  window.addonNum = num;
  window.addonIntVal = intVal;
  window.addonEscapeAttr = escapeAttr;
})();