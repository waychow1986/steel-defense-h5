import type { Renderer } from '../render/renderer';

/** Keeps the square canvas fitted to the stage (TD-005). */
export function watchStage(win: Window, stage: HTMLElement, renderer: Renderer): () => void {
  const fit = (): void => {
    const style = win.getComputedStyle(stage);
    const w = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    renderer.resize(Math.max(0, Math.min(w, h)), win.devicePixelRatio);
  };
  fit();
  if (typeof ResizeObserver === 'undefined') {
    win.addEventListener('resize', fit);
    return () => win.removeEventListener('resize', fit);
  }
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  win.addEventListener('resize', fit);
  return () => {
    ro.disconnect();
    win.removeEventListener('resize', fit);
  };
}

/**
 * Keeps exactly one “怎么玩” region: inside the start dialog on the start screen and on
 * narrow screens, in the side panel on wide screens during play.
 */
export class HowToPlacement {
  private readonly wide: MediaQueryList;

  constructor(
    win: Window,
    private readonly app: HTMLElement,
    private readonly howTo: HTMLElement,
    private readonly startHome: HTMLElement,
    private readonly startAnchor: HTMLElement,
    private readonly side: HTMLElement,
  ) {
    this.wide = win.matchMedia('(min-width: 1024px)');
  }

  update(onStartScreen: boolean): void {
    const toSide = !onStartScreen && this.wide.matches;
    this.app.classList.toggle('has-side', toSide);
    if (toSide && this.howTo.parentElement !== this.side) {
      this.side.appendChild(this.howTo);
    } else if (!toSide && this.howTo.parentElement !== this.startHome) {
      this.startHome.insertBefore(this.howTo, this.startAnchor);
    }
  }
}
