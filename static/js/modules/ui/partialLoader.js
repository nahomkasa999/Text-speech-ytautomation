/**
 * Client-side layout loader for modular HTML partials.
 */

export async function loadPartials() {
  const elements = Array.from(document.querySelectorAll('[data-include]'));
  if (elements.length === 0) return;

  await Promise.all(
    elements.map(async (el) => {
      try {
        const src = el.getAttribute('data-include');
        const res = await fetch(src);
        if (res.ok) {
          const html = await res.text();
          el.outerHTML = html;
        }
      } catch (err) {
        console.warn('Could not load partial:', err);
      }
    })
  );
}
