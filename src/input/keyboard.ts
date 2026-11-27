import type { Dir } from '../game/types';
import type { InputState } from './input-state';

export type KeyAction = Dir | 'fire';

const KEY_MAP: Record<string, KeyAction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'fire',
};

export function keyToAction(code: string): KeyAction | null {
  return KEY_MAP[code] ?? null;
}

/** Binds keyboard events (by `event.code`) to the input state. Returns an unbind function. */
export function bindKeyboard(target: Window, input: InputState): () => void {
  const onDown = (e: KeyboardEvent): void => {
    const action = keyToAction(e.code);
    if (action === null || !input.isEnabled) return;
    e.preventDefault();
    if (e.repeat) return;
    if (action === 'fire') input.pressFire(e.timeStamp);
    else input.pressDirection(action, e.timeStamp);
  };
  const onUp = (e: KeyboardEvent): void => {
    const action = keyToAction(e.code);
    if (action === null) return;
    if (input.isEnabled) e.preventDefault();
    if (action === 'fire') input.releaseFire();
    else input.releaseDirection(action);
  };
  const onBlur = (): void => input.clear();
  const onVisibility = (): void => {
    if (target.document.visibilityState !== 'visible') input.clear();
  };
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  target.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', onBlur);
    target.document.removeEventListener('visibilitychange', onVisibility);
  };
}
