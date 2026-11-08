/**
 * Tiny popover / dropdown menu helper.
 *
 * <button data-popover="my-pop">…</button>
 * <div id="my-pop" class="popover [popover-up] [popover-right]">…</div>
 *
 * Popovers use fixed positioning (computed from the trigger) so they are never
 * clipped by panels with overflow:hidden, and they flip when there is no room.
 * Clicking outside, pressing Escape, or choosing a .menu-item closes them.
 */

let current = null;

function close() {
  if (!current) return;
  current.pop.classList.remove('open');
  current.trigger.setAttribute('aria-expanded', 'false');
  current = null;
}

function place(trigger, pop) {
  const r = trigger.getBoundingClientRect();
  if (pop.classList.contains('match-width')) pop.style.minWidth = `${Math.round(r.width)}px`;
  pop.classList.add('open');
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 6;
  const preferUp = pop.classList.contains('popover-up');

  let top = preferUp ? r.top - ph - gap : r.bottom + gap;
  if (preferUp && top < 8) top = r.bottom + gap;
  if (!preferUp && top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - gap);

  let left = pop.classList.contains('popover-right') ? r.right - pw : r.left;
  left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);

  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

export function initPopovers() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-popover]');
    if (trigger) {
      const pop = document.getElementById(trigger.dataset.popover);
      if (!pop) return;
      e.preventDefault();
      const wasOpen = current && current.pop === pop;
      close();
      if (!wasOpen) {
        place(trigger, pop);
        trigger.setAttribute('aria-expanded', 'true');
        current = { trigger, pop };
      }
      return;
    }
    if (!current) return;
    if (current.pop.contains(e.target)) {
      if (e.target.closest('.menu-item')) close();
      return;
    }
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('resize', close);
}
