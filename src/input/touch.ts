import type { Dir } from '../game/types';
import type { InputState } from './input-state';

/**
 * Tracks touch pointers on the virtual direction pad and fire button (TD-009).
 * Each pointer holds at most one direction; sliding onto a neighbouring direction switches it,
 * lifting the finger releases it. Feeds the shared held-direction stack, so "last pressed wins"
 * also applies across two fingers (A-4).
 */
export class TouchPad {
  private readonly dirPointers = new Map<number, Dir>();
  private readonly firePointers = new Set<number>();

  constructor(private readonly input: InputState) {}

  directionDown(pointerId: number, dir: Dir, timeStamp: number): void {
    const prev = this.dirPointers.get(pointerId);
    if (prev === dir) return;
    this.dirPointers.set(pointerId, dir);
    if (prev) this.releaseIfUnheld(prev);
    this.input.pressDirection(dir, timeStamp);
  }

  /** Finger moved; `dir` is the pad button now under it, or null when it is off the buttons (keeps the last one). */
  directionMove(pointerId: number, dir: Dir | null, timeStamp: number): void {
    if (dir === null || !this.dirPointers.has(pointerId)) return;
    this.directionDown(pointerId, dir, timeStamp);
  }

  fireDown(pointerId: number, timeStamp: number): void {
    if (this.firePointers.has(pointerId)) return;
    this.firePointers.add(pointerId);
    this.input.pressFire(timeStamp);
  }

  up(pointerId: number): void {
    const dir = this.dirPointers.get(pointerId);
    if (dir) {
      this.dirPointers.delete(pointerId);
      this.releaseIfUnheld(dir);
    }
    if (this.firePointers.delete(pointerId) && this.firePointers.size === 0) this.input.releaseFire();
  }

  clear(): void {
    for (const id of [...this.dirPointers.keys(), ...this.firePointers]) this.up(id);
  }

  private releaseIfUnheld(dir: Dir): void {
    for (const d of this.dirPointers.values()) if (d === dir) return;
    this.input.releaseDirection(dir);
  }
}

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

function dirOf(el: Element | null, pad: HTMLElement): Dir | null {
  const btn = el?.closest<HTMLElement>('[data-dir]');
  if (!btn || !pad.contains(btn)) return null;
  const d = btn.dataset.dir as Dir | undefined;
  return d && DIRS.includes(d) ? d : null;
}

function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Synthetic or already-ended pointers cannot be captured; release still arrives via window.
  }
}

/** Binds Pointer Events of the virtual pad and fire button to the input state. Returns an unbind function. */
export function bindTouch(win: Window, pad: HTMLElement, fireBtn: HTMLElement, input: InputState): () => void {
  const touch = new TouchPad(input);
  const doc = win.document;

  const onPadDown = (e: PointerEvent): void => {
    const dir = dirOf(e.target as Element | null, pad);
    if (!dir) return;
    e.preventDefault();
    capture(pad, e.pointerId);
    touch.directionDown(e.pointerId, dir, e.timeStamp);
  };
  const onPadMove = (e: PointerEvent): void => {
    touch.directionMove(e.pointerId, dirOf(doc.elementFromPoint(e.clientX, e.clientY), pad), e.timeStamp);
  };
  const onFireDown = (e: PointerEvent): void => {
    e.preventDefault();
    capture(fireBtn, e.pointerId);
    touch.fireDown(e.pointerId, e.timeStamp);
  };
  const onUp = (e: PointerEvent): void => touch.up(e.pointerId);
  const onClear = (): void => touch.clear();
  const onVisibility = (): void => {
    if (doc.visibilityState !== 'visible') touch.clear();
  };
  const noMenu = (e: Event): void => e.preventDefault();

  pad.addEventListener('pointerdown', onPadDown);
  pad.addEventListener('pointermove', onPadMove);
  fireBtn.addEventListener('pointerdown', onFireDown);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onUp);
  win.addEventListener('blur', onClear);
  doc.addEventListener('visibilitychange', onVisibility);
  pad.addEventListener('contextmenu', noMenu);
  fireBtn.addEventListener('contextmenu', noMenu);
  return () => {
    pad.removeEventListener('pointerdown', onPadDown);
    pad.removeEventListener('pointermove', onPadMove);
    fireBtn.removeEventListener('pointerdown', onFireDown);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onUp);
    win.removeEventListener('blur', onClear);
    doc.removeEventListener('visibilitychange', onVisibility);
    pad.removeEventListener('contextmenu', noMenu);
    fireBtn.removeEventListener('contextmenu', noMenu);
  };
}
