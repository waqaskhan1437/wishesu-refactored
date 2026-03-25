/**
 * Product SSR - Addon Renderer
 * Addon field and form rendering for SSR
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { formatPriceForSsr } from '../utils/price-formatter.js';
import { sanitizeAddonIdForSsr } from './product-ssr.js';

export function renderAddonDataAttrsForSsr(optionInput = {}) {
  const option = optionInput && typeof optionInput === 'object' ? optionInput : {};
  const attrs = [];
  const price = Number(option.price);
  attrs.push(`data-price="${escapeHtmlText(Number.isFinite(price) ? String(price) : '0')}"`);

  if (option.file) {
    attrs.push('data-needs-file="true"');
    attrs.push(`data-file-qty="${escapeHtmlText(String(parseInt(option.fileQuantity, 10) || 1))}"`);
  }
  if (option.textField) {
    attrs.push('data-needs-text="true"');
  }
  if (option.delivery && typeof option.delivery === 'object') {
    attrs.push(`data-delivery-instant="${option.delivery.instant ? 'true' : 'false'}"`);
    attrs.push(`data-delivery-days="${escapeHtmlText(String(parseInt(option.delivery.days, 10) || 1))}"`);
  }

  return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
}

export function renderSsrAddonField(fieldInput, index) {
  const field = fieldInput && typeof fieldInput === 'object' ? fieldInput : {};
  const type = String(field.type || 'text').trim().toLowerCase();
  const fallbackId = `addon-${index + 1}`;
  const baseId = sanitizeAddonIdForSsr(field.id || fallbackId, fallbackId);
  const labelText = escapeHtmlText(String(field.label || field.text || '').trim());
  const required = !!field.required;
  const requiredHtml = required
    ? ' <span style="color:red" aria-hidden="true">*</span><span class="sr-only"> (required)</span>'
    : '';

  if (type === 'heading') {
    const headingText = escapeHtmlText(String(field.text || field.label || '').trim());
    if (!headingText) return '';
    return `<h3 style="margin-top:1.5rem;font-size:1.1rem;">${headingText}</h3>`;
  }

  const options = Array.isArray(field.options) ? field.options : [];

  if (type === 'select') {
    const optionsHtml = options.map((optInput, idx) => {
      const opt = optInput && typeof optInput === 'object' ? optInput : {};
      const optLabel = escapeHtmlText(String(opt.label || `Option ${idx + 1}`));
      const optPrice = Number(opt.price);
      const priceSuffix = Number.isFinite(optPrice) && optPrice > 0 ? ` (+$${formatPriceForSsr(optPrice)})` : '';
      const selectedAttr = opt.default ? ' selected' : '';
      return `<option value="${optLabel}"${renderAddonDataAttrsForSsr(opt)}${selectedAttr}>${optLabel}${priceSuffix}</option>`;
    }).join('');

    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <select class="form-select" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${required ? ' required' : ''}>
${optionsHtml}
        </select>
        <div class="addon-extras"></div>
      </div>`;
  }

  if (type === 'radio' || type === 'checkbox_group') {
    const isRadio = type === 'radio';
    const optionCards = options.map((optInput, idx) => {
      const opt = optInput && typeof optInput === 'object' ? optInput : {};
      const optLabel = escapeHtmlText(String(opt.label || `Option ${idx + 1}`));
      const optPrice = Number(opt.price);
      const priceHtml = Number.isFinite(optPrice) && optPrice > 0
        ? `<span class="opt-price">+$${formatPriceForSsr(optPrice)}</span>`
        : '';
      const checkedAttr = opt.default ? ' checked' : '';
      const selectedClass = opt.default ? ' selected' : '';
      const requiredAttr = isRadio && required && idx === 0 ? ' required' : '';

      if (isRadio) {
        return `
          <label class="addon-option-card${selectedClass}">
            <input type="radio"
                   name="${escapeHtmlText(baseId)}"
                   value="${optLabel}"
                   class="addon-radio"${renderAddonDataAttrsForSsr(opt)}${checkedAttr}${requiredAttr}>
            ${optLabel}
            ${priceHtml}
          </label>`;
      }

      return `
          <div>
            <label class="addon-option-card${selectedClass}">
              <input type="checkbox"
                     name="${escapeHtmlText(baseId)}"
                     value="${optLabel}"
                     class="addon-checkbox"${renderAddonDataAttrsForSsr(opt)}${checkedAttr}>
              ${optLabel}
              ${priceHtml}
            </label>
            <div style="margin-left:1.5rem;"></div>
          </div>`;
    }).join('');

    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label">${labelText}${requiredHtml}</label>` : ''}
        <div>${optionCards}</div>
        ${isRadio ? '<div class="addon-extras"></div>' : ''}
      </div>`;
  }

  const isTextarea = type === 'textarea';
  const safeType = isTextarea ? '' : escapeHtmlText(type || 'text');
  const placeholder = String(field.placeholder || '').trim();
  const placeholderAttr = placeholder ? ` placeholder="${escapeHtmlText(placeholder)}"` : '';
  const requiredAttr = required ? ' required' : '';
  const maxLength = isTextarea ? 2000 : (safeType === 'email' ? 100 : (safeType === 'text' ? 200 : 0));
  const maxLengthAttr = maxLength > 0 ? ` maxlength="${maxLength}"` : '';
  const acceptAttr = safeType === 'file' ? ' accept="image/*"' : '';

  if (isTextarea) {
    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <textarea class="form-textarea" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${placeholderAttr}${requiredAttr}${maxLengthAttr}></textarea>
        <div class="addon-extras"></div>
      </div>`;
  }

  return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <input class="form-input" type="${safeType || 'text'}" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${placeholderAttr}${requiredAttr}${maxLengthAttr}${acceptAttr}>
        <div class="addon-extras"></div>
      </div>`;
}

export function renderSsrAddonsForm(addonGroupsInput, basePriceText) {
  const addonGroups = Array.isArray(addonGroupsInput) ? addonGroupsInput : [];
  const fieldsHtml = addonGroups.map((field, idx) => renderSsrAddonField(field, idx)).join('');
  const fallbackHtml = fieldsHtml
    ? fieldsHtml
    : '<div class="addon-group" style="color:#6b7280;">No add-ons configured for this product.</div>';

  return `
                <form id="addons-form" style="padding-top:1.5rem;border-top:1px solid #e5e7eb;margin-top:1.5rem;">
${fallbackHtml}
                </form>
                <div data-checkout-footer="1" style="margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e5e5;">
                  <button id="checkout-btn" type="button" class="btn-buy">Proceed to Checkout - $${basePriceText}</button>
                </div>`;
}
