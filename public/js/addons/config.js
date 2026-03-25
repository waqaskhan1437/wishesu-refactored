/*
 * Configuration helpers for the addon builder.  These functions
 * assemble the JSON configuration from the form controls, manage
 * synchronisation with the hidden input and seed the builder with
 * demonstration data.  They rely on utilities and constants defined
 * in utils.js and data.js.
 */

;(function(){
  const slug = window.addonSlug;
  const num = window.addonNum;
  const intVal = window.addonIntVal;
  const DEMO = window.ADDON_DEMO || [];
  function buildConfig(form) {
    const out = [];
    const builder = form.querySelector('#addons-builder');
    if (!builder) return out;
    const fields = builder.querySelectorAll('.addon-field');
    fields.forEach((field, idx) => {
      const type = field.querySelector('.addon-type')?.value || '';
      const label = (field.querySelector('.addon-label')?.value || '').trim();
      if (!type) return;
      if (!label && type !== 'heading') return;
      const id = slug(label, idx + 1);
      const f = { id, type, label };
      if (type === 'heading') {
        const txt = (field.querySelector('.addon-heading-text')?.value || label).trim();
        f.text = txt;
      } else if (type === 'text' || type === 'textarea' || type === 'email') {
        f.placeholder = (field.querySelector('.addon-placeholder')?.value || '').trim();
        f.price = num(field.querySelector('.addon-price')?.value);
        f.required = !!field.querySelector('.addon-required')?.checked;
      } else if (type === 'file') {
        f.file = {
          pricePerUnit: num(field.querySelector('.addon-file-price')?.value),
          multiple: !!field.querySelector('.addon-file-multi')?.checked,
          askQuantity: !!field.querySelector('.addon-file-qty')?.checked
        };
        f.required = !!field.querySelector('.addon-required')?.checked;
      } else if (type === 'radio' || type === 'select' || type === 'checkbox_group') {
        const opts = [];
        field.querySelectorAll('.addon-option-row').forEach(row => {
          const lab = (row.querySelector('.addon-opt-label')?.value || '').trim();
          if (!lab) return;
          const o = {
            label: lab,
            price: num(row.querySelector('.addon-opt-price')?.value),
            file: !!row.querySelector('.addon-opt-file')?.checked,
            textField: !!row.querySelector('.addon-opt-text')?.checked,
            default: !!row.querySelector('.addon-opt-default')?.checked
          };

          if (o.file) o.fileQuantity = intVal(row.querySelector('.addon-opt-fileqty')?.value) || 1;

          if (o.textField) {
            o.textLabel = (row.querySelector('.addon-opt-textlabel')?.value || '').trim();
            o.textPlaceholder = (row.querySelector('.addon-opt-textph')?.value || '').trim();
          }

          const hasDelivery = !!row.querySelector('.addon-opt-delivery')?.checked;
          if (hasDelivery) {
            o.delivery = {
              instant: !!row.querySelector('.addon-opt-delivery-instant')?.checked,
              days: parseInt(row.querySelector('.addon-opt-delivery-days')?.value) || 1
            };
          }

          opts.push(o);
        });
        if (!opts.length) return;
        f.options = opts;
      }
      out.push(f);
    });
    return out;
  }
  function syncHidden(form) {
    const hidden = form.querySelector('#addons-json');
    if (!hidden) return;
    const cfg = buildConfig(form);
    hidden.value = cfg.length ? JSON.stringify(cfg) : '';
  }
  function seedFromConfig(list, counter, config) {
    const cfg = Array.isArray(config) ? config : [];

    cfg.forEach((f, idx) => {
      const field = window.createFieldRow(counter + idx);
      list.appendChild(field);

      const typeSel = field.querySelector('.addon-type');
      const labelInput = field.querySelector('.addon-label');

      if (typeSel) {
        typeSel.value = f.type || '';
        if (labelInput) labelInput.value = f.label || '';
        window.renderTypeConfig(field);
      }

      if (f.type === 'heading') {
        if (f.text) field.querySelector('.addon-heading-text').value = f.text;
      }

      if (f.type === 'text' || f.type === 'textarea' || f.type === 'email') {
        if (f.placeholder) field.querySelector('.addon-placeholder').value = f.placeholder;
        if (typeof f.price === 'number') field.querySelector('.addon-price').value = String(f.price);
        if (f.required) field.querySelector('.addon-required').checked = true;
      }

      if (f.type === 'file') {
        if (f.file && typeof f.file === 'object') {
          if (typeof f.file.pricePerUnit === 'number') field.querySelector('.addon-file-price').value = String(f.file.pricePerUnit);
          if (f.file.multiple) field.querySelector('.addon-file-multi').checked = true;
          if (f.file.askQuantity) field.querySelector('.addon-file-qty').checked = true;
        }
        if (f.required) field.querySelector('.addon-required').checked = true;
      }

      if (f.type === 'radio' || f.type === 'select' || f.type === 'checkbox_group') {
        const wrap = field.querySelector('.addon-options');
        wrap.innerHTML = '';

        (f.options || []).forEach(opt => {
          const row = window.createOptionRow();
          wrap.appendChild(row);

          row.querySelector('.addon-opt-label').value = opt.label || '';
          row.querySelector('.addon-opt-price').value = opt.price || 0;

          if (opt.file) row.querySelector('.addon-opt-file').checked = true;
          if (opt.textField) row.querySelector('.addon-opt-text').checked = true;
          if (opt.default) row.querySelector('.addon-opt-default').checked = true;

          const delivery = opt.delivery || ((opt.deliveryInstant !== undefined || opt.deliveryDays !== undefined || opt.deliveryText !== undefined) ? { instant: opt.deliveryInstant, days: opt.deliveryDays || opt.deliveryText } : null);
          if (delivery) {
            row.querySelector('.addon-opt-delivery').checked = true;
            if (delivery.instant) row.querySelector('.addon-opt-delivery-instant').checked = true;
            if (delivery.days) row.querySelector('.addon-opt-delivery-days').value = delivery.days;
          }

          window.updateOptionVisibility(row);

          if (opt.file && opt.fileQuantity) {
            row.querySelector('.addon-opt-fileqty').value = opt.fileQuantity;
          }

          if (opt.textField) {
            if (opt.textLabel) row.querySelector('.addon-opt-textlabel').value = opt.textLabel;
            if (opt.textPlaceholder) row.querySelector('.addon-opt-textph').value = opt.textPlaceholder;
          }
        });
      }
    });

    return counter + cfg.length;
  }

  function seedDemo(list, counter) {
    return seedFromConfig(list, counter, DEMO);
  }

  // Expose config helpers
  window.buildAddonsConfig = buildConfig;
  window.syncAddonsHidden = syncHidden;
  window.seedAddonsDemo = seedDemo;
  window.seedAddonsFromConfig = seedFromConfig;
  window.readAddonsConfig = function(form) { return buildConfig(form); };
})();