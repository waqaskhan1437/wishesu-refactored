/**
 * HTML Injection Utilities
 * Consolidated HTML injection patterns
 */

export function injectIntoHead(html, injection) {
  if (!html || !injection) return html;
  return String(html).replace('</head>', `${injection}\n</head>`);
}

export function injectIntoBody(html, injection, position = 'before') {
  if (!html || !injection) return html;
  const bodyMatch = /<body([^>]*)>/i;
  if (!bodyMatch.test(html)) return html;
  
  if (position === 'before') {
    return String(html).replace(bodyMatch, `<body$1>\n${injection}`);
  }
  
  return String(html).replace(bodyMatch, `<body$1>\n${injection}\n`);
}

export function injectBeforeCloseBody(html, injection) {
  if (!html || !injection) return html;
  const source = String(html);
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${injection}\n</body>`);
  }
  return `${source}\n${injection}`;
}

export function hasTag(html, tagPattern) {
  return new RegExp(tagPattern, 'i').test(String(html || ''));
}

export function injectAfterHead(html, injection) {
  return injectIntoBody(html, injection, 'before');
}
