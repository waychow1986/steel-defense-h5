import type { GameState } from '../game/types';

export interface HudElements {
  level: HTMLElement;
  score: HTMLElement;
  lives: HTMLElement;
  enemies: HTMLElement;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function updateHud(hud: HudElements, state: GameState | null): void {
  if (!state) return;
  setText(hud.level, String(state.level));
  setText(hud.score, String(state.score));
  setText(hud.lives, String(state.lives));
  setText(hud.enemies, String(state.enemiesRemaining));
}
