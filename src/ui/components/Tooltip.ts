import { h } from './Dom';

/** Lightweight hover/focus tooltip for toolbar buttons. */
let tooltipEl: HTMLElement | null = null;
let showTimer: number | null = null;

const ensure = (): HTMLElement => {
  if (!tooltipEl) {
    tooltipEl = h('div', { class: 'khe-aux khe-tooltip', role: 'tooltip' });
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
};

export const hideTooltip = (): void => {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
};

export const attachTooltip = (el: HTMLElement, getText: () => string): void => {
  const show = () => {
    const text = getText();
    if (!text) {
      return;
    }
    const tip = ensure();
    tip.textContent = text;
    tip.style.display = 'block';
    const rect = el.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    const w = tip.offsetWidth;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    let top = rect.bottom + 6;
    if (top + tip.offsetHeight > window.innerHeight) {
      top = rect.top - tip.offsetHeight - 6;
    }
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const schedule = () => {
    hideTooltip();
    showTimer = setTimeout(show, 450) as unknown as number;
  };
  el.addEventListener('mouseenter', schedule);
  el.addEventListener('focus', schedule);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('blur', hideTooltip);
  el.addEventListener('mousedown', hideTooltip);
};
