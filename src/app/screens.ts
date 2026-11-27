import { CONFIG } from '../game/config';

type Phase = 'entering' | 'leaving';

interface Pending {
  el: HTMLElement;
  phase: Phase;
  untilMs: number;
  armed: boolean;
}

/**
 * Shows and hides overlay dialogs with an enter/leave transition timed by the game
 * loop clock (no setTimeout, so a fake clock fully controls it).
 */
export class OverlayManager {
  private pending = new Map<HTMLElement, Pending>();
  private nowMs = 0;

  show(el: HTMLElement): void {
    const cur = this.pending.get(el);
    if (!el.hidden && cur?.phase !== 'leaving') return;
    el.hidden = false;
    el.dataset.transition = 'entering';
    this.pending.set(el, { el, phase: 'entering', untilMs: this.nowMs + CONFIG.overlayEnterMs, armed: false });
  }

  hide(el: HTMLElement): void {
    const cur = this.pending.get(el);
    if (el.hidden || cur?.phase === 'leaving') return;
    el.dataset.transition = 'leaving';
    el.classList.remove('is-visible');
    this.pending.set(el, { el, phase: 'leaving', untilMs: this.nowMs + CONFIG.overlayLeaveMs, armed: true });
  }

  /** Shows immediately without a transition (initial page state). */
  showNow(el: HTMLElement): void {
    this.pending.delete(el);
    el.hidden = false;
    el.classList.add('is-visible');
    delete el.dataset.transition;
  }

  get transitioning(): boolean {
    return this.pending.size > 0;
  }

  update(nowMs: number): void {
    this.nowMs = nowMs;
    for (const p of [...this.pending.values()]) {
      if (p.phase === 'entering' && !p.armed) {
        // Add the visible class one tick after un-hiding so the CSS transition runs. Showing and arming can
        // happen in the same frame (e.g. the failure screen is shown from a simulation step), so first force a
        // style/layout flush: the browser must commit the un-hidden, transparent state, otherwise the dialog
        // goes from display:none straight to fully visible and no transition starts.
        void p.el.offsetWidth;
        p.el.classList.add('is-visible');
        p.armed = true;
        p.untilMs = nowMs + CONFIG.overlayEnterMs;
        continue;
      }
      if (nowMs < p.untilMs) continue;
      if (p.phase === 'leaving') p.el.hidden = true;
      delete p.el.dataset.transition;
      this.pending.delete(p.el);
    }
  }
}

/**
 * Level-intro map curtain (TD-015): fraction of the map covered by the top and bottom
 * curtains `ms` after the intro starts — closes over the first half, opens over the second.
 */
export function curtainCover(ms: number): number {
  const total = CONFIG.curtainMs;
  if (ms <= 0 || ms >= total) return 0;
  const half = total / 2;
  return ms <= half ? ms / half : (total - ms) / half;
}
