import { describe, expect, it } from 'vitest';
import { InputState } from '../../src/input/input-state';
import { keyToAction } from '../../src/input/keyboard';

describe('UT-input: held-direction stack', () => {
  it('last pressed direction wins and release falls back to a still-held one', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('left', 0);
    expect(s.direction).toBe('left');
    s.pressDirection('up', 0);
    expect(s.direction).toBe('up');
    s.releaseDirection('up');
    expect(s.direction).toBe('left');
    s.releaseDirection('left');
    expect(s.direction).toBeNull();
  });

  it('releasing an older key keeps the newest direction', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('left', 0);
    s.pressDirection('up', 0);
    s.releaseDirection('left');
    expect(s.direction).toBe('up');
  });

  it('pressing a held direction again moves it to the top', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('left', 0);
    s.pressDirection('up', 0);
    s.pressDirection('left', 0);
    expect(s.direction).toBe('left');
    s.releaseDirection('left');
    expect(s.direction).toBe('up');
  });

  it('clear() drops everything (blur / visibilitychange)', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('down', 0);
    s.pressFire(0);
    s.clear();
    expect(s.direction).toBeNull();
    expect(s.fireHeld).toBe(false);
    expect(s.consumeFire()).toBe(false);
  });
});

describe('UT-input: fire', () => {
  it('held fire stays active; a quick tap is latched until consumed once', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressFire(0);
    s.releaseFire();
    expect(s.fireHeld).toBe(false);
    expect(s.consumeFire()).toBe(true);
    expect(s.consumeFire()).toBe(false);
    s.pressFire(0);
    expect(s.consumeFire()).toBe(true);
    expect(s.consumeFire()).toBe(true);
  });
});

describe('UT-input: ignored outside playing (A-9)', () => {
  it('ignores presses while disabled', () => {
    const s = new InputState();
    s.pressDirection('up', 0);
    s.pressFire(0);
    expect(s.direction).toBeNull();
    expect(s.consumeFire()).toBe(false);
  });

  it('disabling clears held input', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('right', 0);
    s.pressFire(0);
    s.setEnabled(false);
    expect(s.direction).toBeNull();
    expect(s.fireHeld).toBe(false);
    s.setEnabled(true);
    expect(s.direction).toBeNull();
    expect(s.consumeFire()).toBe(false);
  });
});

describe('UT-input: response time', () => {
  it('records press-to-response milliseconds once per press', () => {
    const s = new InputState();
    s.setEnabled(true);
    s.pressDirection('up', 100);
    s.markResponded(130);
    expect(s.lastResponseMs).toBe(30);
    s.markResponded(200);
    expect(s.lastResponseMs).toBe(30);
  });
});

describe('UT-input: key mapping by event.code', () => {
  it('maps arrows, WASD and Space', () => {
    expect(keyToAction('ArrowUp')).toBe('up');
    expect(keyToAction('KeyW')).toBe('up');
    expect(keyToAction('ArrowDown')).toBe('down');
    expect(keyToAction('KeyS')).toBe('down');
    expect(keyToAction('ArrowLeft')).toBe('left');
    expect(keyToAction('KeyA')).toBe('left');
    expect(keyToAction('ArrowRight')).toBe('right');
    expect(keyToAction('KeyD')).toBe('right');
    expect(keyToAction('Space')).toBe('fire');
    expect(keyToAction('KeyQ')).toBeNull();
  });
});
