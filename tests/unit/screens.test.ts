import { describe, expect, it } from 'vitest';
import { curtainCover } from '../../src/app/screens';
import { CONFIG } from '../../src/game/config';
import { InputState } from '../../src/input/input-state';
import { TouchPad } from '../../src/input/touch';

describe('UT-touch virtual pad (AC-5)', () => {
  const setup = () => {
    const input = new InputState();
    input.setEnabled(true);
    return { input, pad: new TouchPad(input) };
  };

  it('holding a direction moves that way and lifting the finger stops', () => {
    const { input, pad } = setup();
    pad.directionDown(1, 'left', 0);
    expect(input.direction).toBe('left');
    pad.up(1);
    expect(input.direction).toBeNull();
  });

  it('a second finger wins and lifting it falls back to the first (A-4)', () => {
    const { input, pad } = setup();
    pad.directionDown(1, 'left', 0);
    pad.directionDown(2, 'up', 10);
    expect(input.direction).toBe('up');
    pad.up(2);
    expect(input.direction).toBe('left');
  });

  it('sliding to a neighbouring button switches direction; sliding off the buttons keeps it', () => {
    const { input, pad } = setup();
    pad.directionDown(1, 'left', 0);
    pad.directionMove(1, 'up', 5);
    expect(input.direction).toBe('up');
    pad.directionMove(1, null, 6);
    expect(input.direction).toBe('up');
    pad.up(1);
    expect(input.direction).toBeNull();
  });

  it('moves from pointers that never pressed the pad are ignored', () => {
    const { input, pad } = setup();
    pad.directionMove(7, 'down', 0);
    expect(input.direction).toBeNull();
  });

  it('fire button fires on press, holds while any finger is on it', () => {
    const { input, pad } = setup();
    pad.fireDown(3, 0);
    pad.fireDown(4, 1);
    expect(input.fireHeld).toBe(true);
    pad.up(3);
    expect(input.fireHeld).toBe(true);
    pad.up(4);
    expect(input.fireHeld).toBe(false);
    expect(input.consumeFire()).toBe(true);
  });

  it('clear releases every finger', () => {
    const { input, pad } = setup();
    pad.directionDown(1, 'right', 0);
    pad.fireDown(2, 0);
    pad.clear();
    expect(input.direction).toBeNull();
    expect(input.fireHeld).toBe(false);
  });
});

describe('UT-curtain level intro transition (AC-18)', () => {
  it('closes then opens over curtainMs and is open afterwards', () => {
    const half = CONFIG.curtainMs / 2;
    expect(curtainCover(0)).toBe(0);
    expect(curtainCover(half / 2)).toBeCloseTo(0.5, 5);
    expect(curtainCover(half)).toBeCloseTo(1, 5);
    expect(curtainCover(half * 1.5)).toBeCloseTo(0.5, 5);
    expect(curtainCover(CONFIG.curtainMs)).toBe(0);
    expect(curtainCover(CONFIG.curtainMs + 1000)).toBe(0);
  });
});
