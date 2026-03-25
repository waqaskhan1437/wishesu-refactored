/*
 * SEO helper functions extracted from the original product.js.
 * Updates page title, meta tags, and Open Graph metadata.
 * Schema markup is now injected server-side for better performance and to prevent duplicates.
 *
 * IMPORTANT: This is supplementary — only fills in gaps where server-side injection
 * left placeholder values or missing tags. Never overwrites real server-injected data.
 */

;(function(){
  // Placeholder values that indicate the server did NOT inject real data
  const PLACEHOLDER_TITLES = ['Loading Product... | WishVideo', 'Loading...'];
  const PLACEHOLDER_CONTENTS = ['', 'Loading...', 'Custom personalized video greetings from Africa.'];

  function isPlaceholder(value, placeholders) {
    if (!value) return true;
    return placeholders.some(p => value === p);
  }

  function updateSEO(product) {
    // 1. Basic SEO — only update if current value is a placeholder
    const desiredTitle = (product.seo_title || product.title) + ' | WishVideo';
    if (isPlaceholder(document.title, PLACEHOLDER_TITLES)) {
      document.title = desiredTitle;
    }

    let desc = product.seo_description || product.description || '';
    if (desc.length > 160) desc = desc.substring(0, 160);

    setMetaIfPlaceholder('description', desc, PLACEHOLDER_CONTENTS);
    setMeta('keywords', product.seo_keywords || 'video, greeting, personalized, custom');

    // 2. Social Media (Open Graph) — only fill if missing or placeholder
    setMetaPropertyIfPlaceholder('og:title', product.title, PLACEHOLDER_CONTENTS);
    setMetaPropertyIfPlaceholder('og:description', desc, PLACEHOLDER_CONTENTS);
    setMetaPropertyIfPlaceholder('og:image', product.thumbnail_url, PLACEHOLDER_CONTENTS);
    setMetaProperty('og:type', 'product');
    setMetaPropertyIfPlaceholder('og:url', window.location.href, PLACEHOLDER_CONTENTS);
    setMetaProperty('og:site_name', 'WishVideo');
    setMetaProperty('og:price:amount', product.sale_price || product.normal_price);
    setMetaProperty('og:price:currency', 'USD');

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image');
    setMetaIfPlaceholder('twitter:title', product.title, PLACEHOLDER_CONTENTS);
    setMetaIfPlaceholder('twitter:description', desc, PLACEHOLDER_CONTENTS);
    setMetaIfPlaceholder('twitter:image', product.thumbnail_url, PLACEHOLDER_CONTENTS);

    // Note: JSON-LD Schema is now injected server-side in worker.js
    // This prevents duplicate schemas and improves initial page load SEO
  }

  function setMeta(name, content) {
    let e = document.querySelector('meta[name="' + name + '"]');
    if (!e) {
      e = document.createElement('meta');
      e.name = name;
      document.head.appendChild(e);
    }
    e.content = content || '';
  }

  function setMetaIfPlaceholder(name, content, placeholders) {
    let e = document.querySelector('meta[name="' + name + '"]');
    if (e && !isPlaceholder(e.content, placeholders)) return; // server already set a real value
    if (!e) {
      e = document.createElement('meta');
      e.name = name;
      document.head.appendChild(e);
    }
    e.content = content || '';
  }

  function setMetaProperty(prop, content) {
    let e = document.querySelector('meta[property="' + prop + '"]');
    if (!e) {
      e = document.createElement('meta');
      e.setAttribute('property', prop);
      document.head.appendChild(e);
    }
    e.content = content || '';
  }

  function setMetaPropertyIfPlaceholder(prop, content, placeholders) {
    let e = document.querySelector('meta[property="' + prop + '"]');
    if (e && !isPlaceholder(e.content, placeholders)) return; // server already set a real value
    if (!e) {
      e = document.createElement('meta');
      e.setAttribute('property', prop);
      document.head.appendChild(e);
    }
    e.content = content || '';
  }

  window.updateSEO = updateSEO;
})();
