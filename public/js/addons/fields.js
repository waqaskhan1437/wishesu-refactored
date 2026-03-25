/*
 * Field construction helpers for the addon builder.  These functions
 * create the DOM structures for each field and handle dynamic
 * configuration panels based on the selected type.  They depend on
 * constants and utilities defined in data.js and utils.js.
 */

;(function(){
  const TYPES = window.ADDON_TYPES || [];
  const DEMO = window.ADDON_DEMO || [];
  const slug = window.addonSlug;
  const num = window.addonNum;
  const intVal = window.addonIntVal;
  const escapeAttr = window.addonEscapeAttr;
  function createFieldRow(index) {
    const w = document.createElement('div');
    w.className = 'addon-field';
    w.dataset.index = String(index);
    const opts = TYPES.map(t => `<option value="${t.v}">${t.t}</option>`).join('');
    w.innerHTML = [
      '<div class="addon-row-header">',
      '  <div class="addon-row-main">',
      '    <label>Field Type',
      `      <select class="addon-type">${opts}</select>`,
      '    </label>',
      '    <label class="addon-label-wrap">Label',
      '      <input type="text" class="addon-label" placeholder="e.g. Choose song">',
      '    </label>',
      '  </div>',
      '  <button type="button" class="btn btn-secondary addon-remove-field">Remove</button>',
      '</div>',
      '<div class="addon-row-config"><p class="field-note">Select a field type to see its settings.</p></div>'
    ].join('\n');
    return w;
  }
  function renderTypeConfig(field) {
    if (!field) return;
    const type = field.querySelector('.addon-type')?.value || '';
    const cfg = field.querySelector('.addon-row-config');
    if (!cfg) return;
    if (!type) {
      cfg.innerHTML = '<p class="field-note">Select a field type to see its settings.</p>';
      return;
    }
    if (type === 'heading') {
      const lbl = field.querySelector('.addon-label')?.value || '';
      cfg.innerHTML = [
        '<div class="form-field">',
        '  <span class="field-note">Heading will only show text, no input field.</span>',
        `  <label>Heading text<input type="text" class="addon-heading-text" value="${escapeAttr(lbl)}" placeholder="Section heading"></label>`,
        '</div>'
      ].join('');
      return;
    }
    if (type === 'text' || type === 'textarea' || type === 'email') {
      cfg.innerHTML = [
        '<div class="form-grid-2">',
        '  <div class="form-field"><label>Placeholder<input type="text" class="addon-placeholder" placeholder="Optional placeholder"></label></div>',
        '  <div class="form-field"><label>Extra Price ($)<input type="number" step="0.01" class="addon-price" value="0"></label></div>',
        '</div>',
        '<div class="form-field"><label><input type="checkbox" class="addon-required"> Required</label></div>'
      ].join('');
      return;
    }
    if (type === 'file') {
      cfg.innerHTML = [
        '<div class="form-grid-3">',
        '  <div class="form-field"><label>Price per file ($)<input type="number" step="0.01" class="addon-file-price" value="0"></label></div>',
        '  <div class="form-field"><label><input type="checkbox" class="addon-file-multi"> Allow multiple files</label></div>',
        '  <div class="form-field"><label><input type="checkbox" class="addon-file-qty"> Ask quantity</label></div>',
        '</div>',
        '<div class="form-field"><label><input type="checkbox" class="addon-required"> Required</label></div>'
      ].join('');
      return;
    }
    if (type === 'radio' || type === 'select' || type === 'checkbox_group') {
      cfg.innerHTML = [
        '<div class="addon-options"></div>',
        '<button type="button" class="btn btn-secondary addon-add-option">Add Option</button>'
      ].join('');
      return;
    }
  }
  function createOptionRow() {
    const row = document.createElement('div');
    row.className = 'addon-option-row';
    row.innerHTML = [
      '<div class="form-grid-2 addon-option-main">',
      '  <div class="form-field"><label>Option Label<input type="text" class="addon-opt-label" placeholder="e.g. 1 photo"></label></div>',
      '  <div class="form-field"><label>Extra Price ($)<input type="number" step="0.01" class="addon-opt-price" value="0"></label></div>',
      '</div>',
      '<div class="addon-option-flags">',
      '  <label><input type="checkbox" class="addon-opt-file"> File Upload</label>',
      '  <label><input type="checkbox" class="addon-opt-text"> Text Field</label>',
      '  <label><input type="checkbox" class="addon-opt-delivery"> Delivery Time</label>',
      '  <label><input type="checkbox" class="addon-opt-default"> Default</label>',
      '  <button type="button" class="btn btn-secondary addon-remove-option">Remove</button>',
      '</div>',
      '<div class="addon-option-config" style="display:none">',
      '  <div class="form-grid-2 opt-file-config" style="display:none">',
      '    <div class="form-field"><label>File Quantity<input type="number" min="1" class="addon-opt-fileqty" value="1"></label></div>',
      '  </div>',
      '  <div class="form-grid-2 opt-text-config" style="display:none">',
      '    <div class="form-field"><label>Text Field Label<input type="text" class="addon-opt-textlabel" placeholder="Label for extra text"></label></div>',
      '    <div class="form-field"><label>Text Placeholder<input type="text" class="addon-opt-textph" placeholder="Placeholder"></label></div>',
      '  </div>',
      '  <div class="form-grid-2 opt-delivery-config" style="display:none">',
      '    <div class="form-field"><label><input type="checkbox" class="addon-opt-delivery-instant"> Instant Delivery</label></div>',
      '    <div class="form-field"><label>Delivery Days<input type="number" min="1" max="30" class="addon-opt-delivery-days" value="1" placeholder="e.g. 1, 2, 3"></label></div>',
      '  </div>',
      '</div>'
    ].join('');
    return row;
  }
  function updateOptionVisibility(row) {
    if (!row) return;
    const hasFile = row.querySelector('.addon-opt-file')?.checked;
    const hasText = row.querySelector('.addon-opt-text')?.checked;
    const hasDelivery = row.querySelector('.addon-opt-delivery')?.checked;
    const cfg = row.querySelector('.addon-option-config');
    const fileCfg = row.querySelector('.opt-file-config');
    const textCfg = row.querySelector('.opt-text-config');
    const deliveryCfg = row.querySelector('.opt-delivery-config');
    if (cfg) cfg.style.display = hasFile || hasText || hasDelivery ? 'block' : 'none';
    if (fileCfg) fileCfg.style.display = hasFile ? 'grid' : 'none';
    if (textCfg) textCfg.style.display = hasText ? 'grid' : 'none';
    if (deliveryCfg) deliveryCfg.style.display = hasDelivery ? 'grid' : 'none';
  }
  window.createFieldRow = createFieldRow;
  window.renderTypeConfig = renderTypeConfig;
  window.createOptionRow = createOptionRow;
  window.updateOptionVisibility = updateOptionVisibility;
})();