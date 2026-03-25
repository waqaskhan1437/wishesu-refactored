/*
 * UI helpers for rendering product addon controls.
 * Updated: Forces file inputs to accept ONLY IMAGES.
 * Updated: Added character limits with counters for all text fields.
 */

// Character limits configuration
const CHAR_LIMITS = {
  text: 200,      // Short text fields (name, etc)
  email: 100,     // Email field
  textarea: 2000, // Long text areas (message, instructions)
  option_text: 500 // Extra text fields for options
};

;(function(){
  function renderAddonField(field) {
    const container = document.createElement('div');
    container.className = 'addon-group';
    container.setAttribute('role', 'group');
    if (field.label) container.setAttribute('aria-label', field.label);

    // 1. Create Main Label
    if (field.label) {
      const lbl = document.createElement('label');
      lbl.className = 'addon-group-label';
      lbl.id = field.id + '-label';
      lbl.innerHTML = field.label + (field.required ? ' <span style="color:red" aria-hidden="true">*</span><span class="sr-only"> (required)</span>' : '');
      if (!['radio', 'checkbox_group'].includes(field.type)) lbl.htmlFor = field.id;
      container.appendChild(lbl);
    }

    const extras = document.createElement('div');
    extras.className = 'addon-extras';
    let input;

    // Helper to set dataset
    const setDataset = (el, opt) => {
      el.dataset.price = opt.price || 0;
      if (opt.file) {
        el.dataset.needsFile = 'true';
        el.dataset.fileQty = opt.fileQuantity || 1; 
      }
      if (opt.textField) el.dataset.needsText = 'true';
      // Store delivery info
      if (opt.delivery && typeof opt.delivery === 'object') {
        el.dataset.deliveryInstant = opt.delivery.instant ? 'true' : 'false';
        el.dataset.deliveryDays = opt.delivery.days || 1;
      }
    };
    
    // Helper to get delivery text from option
    const getDeliveryTextFromOpt = (opt) => {
      if (opt.delivery && typeof opt.delivery === 'object') {
        const isInstant = !!opt.delivery.instant;
        const days = parseInt(opt.delivery.days) || 1;
        if (isInstant) return 'Instant Delivery In 60 Minutes';
        if (days === 1) return '24 Hour Express Delivery';
        return `${days} Days Delivery`;
      }
      // Fallback to option label
      return opt.label || '';
    };

    // Helper to create character counter
    const createCharCounter = (inputEl, maxLen) => {
      const counter = document.createElement('div');
      counter.style.cssText = 'text-align:right;font-size:0.75rem;color:#6b7280;margin-top:2px;';
      counter.innerHTML = `<span class="char-count">0</span>/${maxLen}`;
      
      const updateCount = () => {
        const len = inputEl.value.length;
        const countSpan = counter.querySelector('.char-count');
        countSpan.textContent = len;
        countSpan.style.color = len > maxLen * 0.9 ? '#ef4444' : '#6b7280';
      };
      
      inputEl.addEventListener('input', updateCount);
      updateCount();
      
      return counter;
    };

    if (field.type === 'select') {
      input = document.createElement('select');
      input.className = 'form-select';
      input.name = input.id = field.id;
      
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.label;
        o.text = opt.label + (opt.price > 0 ? ` (+$${opt.price})` : '');
        if (opt.default) o.selected = true;
        setDataset(o, opt);
        input.add(o);
      });

      input.onchange = () => {
        if (window.updateTotal) window.updateTotal();

        if (field.id === 'delivery-time' && typeof window.updateDeliveryBadge === 'function') {
          const selectedOpt = input.selectedOptions[0];
          if (selectedOpt) {
            // Check if delivery info is in dataset
            const ds = selectedOpt.dataset;
            let deliveryText = '';
            if (ds.deliveryInstant !== undefined) {
              const isInstant = ds.deliveryInstant === 'true';
              const days = parseInt(ds.deliveryDays) || 1;
              if (isInstant) {
                deliveryText = 'Instant Delivery In 60 Minutes';
              } else if (days === 1) {
                deliveryText = '24 Hour Express Delivery';
              } else {
                deliveryText = `${days} Days Delivery`;
              }
            } else {
              // Fallback to option label
              deliveryText = selectedOpt.text.replace(/\s*\(\+\$[\d.]+\)\s*$/, '').trim();
            }
            window.updateDeliveryBadge(deliveryText);
          }
        }

        renderExtras(extras, input.selectedOptions[0]?.dataset || {}, field.id);
      };
      if (input.selectedOptions[0]) renderExtras(extras, input.selectedOptions[0].dataset, field.id);

    } else if (['radio', 'checkbox_group'].includes(field.type)) {
      input = document.createElement('div');
      const isRadio = field.type === 'radio';
      
      field.options.forEach((opt, idx) => {
        const wrapper = isRadio ? null : document.createElement('div');
        const l = document.createElement('label');
        l.className = 'addon-option-card';
        if (opt.default) l.classList.add('selected');

        const inp = document.createElement('input');
        inp.type = isRadio ? 'radio' : 'checkbox';
        inp.name = field.id;
        inp.value = opt.label;
        inp.className = isRadio ? 'addon-radio' : 'addon-checkbox';
        if (opt.default) inp.checked = true;
        setDataset(inp, opt);

        const subExtras = isRadio ? extras : document.createElement('div');
        if (!isRadio) subExtras.style.marginLeft = '1.5rem';

        inp.onchange = () => {
          if (window.updateTotal) window.updateTotal();
          if (isRadio) {
            input.querySelectorAll('.addon-option-card').forEach(c => c.classList.remove('selected'));
            if (inp.checked) l.classList.add('selected');
            renderExtras(extras, inp.dataset, field.id);

            if (field.id === 'delivery-time' && inp.checked && typeof window.updateDeliveryBadge === 'function') {
              // Check if delivery info is in dataset
              const ds = inp.dataset;
              let deliveryText = '';
              if (ds.deliveryInstant !== undefined) {
                const isInstant = ds.deliveryInstant === 'true';
                const days = parseInt(ds.deliveryDays) || 1;
                if (isInstant) {
                  deliveryText = 'Instant Delivery In 60 Minutes';
                } else if (days === 1) {
                  deliveryText = '24 Hour Express Delivery';
                } else {
                  deliveryText = `${days} Days Delivery`;
                }
              } else {
                // Fallback to option label
                deliveryText = opt.label;
              }
              window.updateDeliveryBadge(deliveryText);
            }
          } else {
            l.classList.toggle('selected', inp.checked);
            renderExtras(subExtras, inp.checked ? inp.dataset : {}, field.id + '_' + idx);
          }
        };

        l.append(inp, document.createTextNode(' ' + opt.label));
        if (opt.price > 0) {
          const p = document.createElement('span');
          p.className = 'opt-price';
          p.textContent = ' +$' + opt.price;
          l.appendChild(p);
        }

        if (isRadio) {
          input.appendChild(l);
          if (inp.checked) setTimeout(() => renderExtras(extras, inp.dataset, field.id), 0);
        } else {
          wrapper.append(l, subExtras);
          input.appendChild(wrapper);
          if (inp.checked) renderExtras(subExtras, inp.dataset, field.id + '_' + idx);
        }
      });
    } else {
      // Standalone fields
      const isArea = field.type === 'textarea';
      input = document.createElement(isArea ? 'textarea' : 'input');
      input.className = isArea ? 'form-textarea' : 'form-input';
      if (!isArea) input.type = field.type;
      input.name = input.id = field.id;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.required) input.required = true;

      // Determine max length based on field type
      let maxLen = CHAR_LIMITS.text;
      if (field.type === 'email') {
        maxLen = CHAR_LIMITS.email;
      } else if (isArea) {
        maxLen = CHAR_LIMITS.textarea;
      }
      
      input.maxLength = maxLen;

      // Restrict standalone file inputs to images and 5MB size
      if (field.type === 'file') {
        input.accept = 'image/*';
        // File size validation will be done during upload
      }

      // Add character counter for text fields
      if (field.type === 'text' || field.type === 'email' || isArea) {
        container.appendChild(input);
        container.appendChild(createCharCounter(input, maxLen));
        if (field.type !== 'checkbox_group') container.appendChild(extras);
        return container;
      }
    }

    container.appendChild(input);
    if (field.type !== 'checkbox_group') container.appendChild(extras);
    return container;
  }

  function renderExtras(container, ds, idSuffix) {
    container.innerHTML = '';
    
    const createField = (label, type, name) => {
      const d = document.createElement('div');
      d.style.marginTop = '0.5rem';
      
      const maxLen = type === 'text' ? CHAR_LIMITS.option_text : CHAR_LIMITS.text;
      const labelHtml = type === 'text' 
        ? `<label for="${name}" style="font-size:0.9rem;display:block;margin-bottom:0.2rem">${label} <small style="color:#6b7280">(max ${maxLen})</small></label>`
        : `<label for="${name}" style="font-size:0.9rem;display:block;margin-bottom:0.2rem">${label}</label>`;
      
      d.innerHTML = labelHtml;
      const i = document.createElement('input');
      i.type = type; i.name = i.id = name;
      
      // --- RESTRICTION: Only Allow Images ---
      if (type === 'file') {
        i.accept = 'image/*';
      }
      
      if (type === 'text') { 
        i.className = 'form-input'; 
        i.placeholder = 'Enter details...';
        i.maxLength = maxLen;
        
        // Add character counter
        const counter = document.createElement('div');
        counter.style.cssText = 'text-align:right;font-size:0.75rem;color:#6b7280;margin-top:2px;';
        counter.innerHTML = `<span class="char-count-${name}">0</span>/${maxLen}`;
        
        i.addEventListener('input', () => {
          const countSpan = counter.querySelector(`.char-count-${name}`);
          if (countSpan) {
            countSpan.textContent = i.value.length;
            countSpan.style.color = i.value.length > maxLen * 0.9 ? '#ef4444' : '#6b7280';
          }
        });
        
        d.appendChild(i);
        d.appendChild(counter);
      } else {
        d.appendChild(i);
      }
      
      container.appendChild(d);
    };

    if (ds.needsFile === 'true') {
        const qty = parseInt(ds.fileQty || '1', 10);
        if (qty > 1) {
            for(let i = 1; i <= qty; i++) {
                createField(`Upload Photo ${i}:`, 'file', `file_${idSuffix}_${i}`);
            }
        } else {
            createField('Upload Photo:', 'file', 'file_' + idSuffix);
        }
    }
    
    if (ds.needsText === 'true') createField('Details:', 'text', 'text_' + idSuffix);
  }

  window.renderAddonField = renderAddonField;
  window.renderExtras = renderExtras;
  window.ADDON_CHAR_LIMITS = CHAR_LIMITS;
})();
