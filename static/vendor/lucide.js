/**
 * Lucide Icons ES Module Adapter (Offline)
 * Uses vendored lucide.min.js with zero network requests.
 */

import './lucide.min.js';

export const lucide = window.lucide;

export function getIcon(name, options = {}) {
  if (!window.lucide || !window.lucide.icons) return null;
  const camel = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  const def = window.lucide.icons[pascal] || window.lucide.icons[camel] || window.lucide.icons[name];
  if (!def) return null;
  return window.lucide.createElement(def, options);
}

export function iconSvg(name, { size = 16, strokeWidth = 2, className = '' } = {}) {
  const el = getIcon(name, {
    width: size,
    height: size,
    'stroke-width': strokeWidth,
    class: className
  });
  return el ? el.outerHTML : '';
}

export function refreshIcons(root = document) {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons({ root });
  }
}
