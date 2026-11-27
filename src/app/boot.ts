import { CONFIG } from '../game/config';
import { levelCounts, levelDef } from '../game/levels';
import { createWorld, stepWorld } from '../game/sim';
import type { GameState, Screen } from '../game/types';
import { InputState } from '../input/input-state';
import { bindKeyboard } from '../input/keyboard';
import { applyCssPalette } from '../render/palette';
import { Renderer } from '../render/renderer';
import { readHighScore, safeLocalStorage } from '../storage/high-score';
import { buildSnapshot, type SteelDefenseSnapshot } from './diagnostics';
import { updateHud } from './hud';
import { HowToPlacement, watchStage } from './layout';
import { FixedLoop } from './loop';
import { OverlayManager } from './screens';

export interface BootOptions {
  seed: number;
  /** Test-only: first level of a new game (only the integration harness passes this). */
  startLevel?: number;
}

export interface SteelDefenseApi {
  readonly version: string;
  snapshot(): SteelDefenseSnapshot;
}

declare global {
  interface Window {
    steelDefense?: SteelDefenseApi;
  }
}

export const VERSION = '0.1.0';

function req<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing element ${selector}`);
  return el;
}

export function boot(root: HTMLElement, opts: BootOptions): SteelDefenseApi {
  const win = root.ownerDocument.defaultView ?? window;
  const doc = root.ownerDocument;
  applyCssPalette(doc.documentElement);

  const app = req<HTMLElement>(root, '#app');
  const stage = req<HTMLElement>(root, '#stage');
  const canvas = req<HTMLCanvasElement>(root, '#battlefield');
  const overlayStart = req<HTMLElement>(root, '#overlay-start');
  const overlayIntro = req<HTMLElement>(root, '#overlay-intro');
  const overlayClear = req<HTMLElement>(root, '#overlay-clear');
  const overlayGameOver = req<HTMLElement>(root, '#overlay-gameover');
  const overlayVictory = req<HTMLElement>(root, '#overlay-victory');
  const startBtn = req<HTMLButtonElement>(root, '#start-btn');
  const muteBtn = req<HTMLButtonElement>(root, '#mute-btn');
  const howTo = req<HTMLElement>(root, '#how-to');
  const gameOverScore = req<HTMLElement>(root, '#gameover-score');
  const hud = {
    level: req<HTMLElement>(root, '#hud-level'),
    score: req<HTMLElement>(root, '#hud-score'),
    lives: req<HTMLElement>(root, '#hud-lives'),
    enemies: req<HTMLElement>(root, '#hud-enemies'),
  };

  const startLevel = Math.min(5, Math.max(1, Math.floor(opts.startLevel ?? 1)));
  const storage = safeLocalStorage();
  const highScore = readHighScore(storage);
  let screen: Screen = 'start';
  let state: GameState | null = null;
  let screenMs = 0;
  /** Time left before the failure screen after the base fell or the last life was lost; null when not pending. */
  let gameOverInMs: number | null = null;
  let muted = false;

  const input = new InputState();
  const overlays = new OverlayManager();
  const renderer = new Renderer(canvas);
  const howToPlacement = new HowToPlacement(win, app, howTo, howTo.parentElement as HTMLElement, startBtn, req<HTMLElement>(root, '#side-panel'));

  const setHighScoreText = (): void => {
    for (const el of root.querySelectorAll<HTMLElement>('#start-high, #gameover-high, #victory-high')) el.textContent = String(highScore);
  };
  setHighScoreText();

  const setScreen = (next: Screen): void => {
    screen = next;
    screenMs = 0;
    if (state) state.screen = next;
    app.dataset.screen = next;
    input.setEnabled(next === 'playing');
    howToPlacement.update(next === 'start');
  };

  const startGame = (): void => {
    if (screen !== 'start') return;
    state = createWorld({ seed: opts.seed, level: startLevel, screen: 'levelIntro' });
    gameOverInMs = null;
    renderer.terrainChanged();
    const counts = levelCounts(levelDef(startLevel));
    req<HTMLElement>(root, '#intro-level').textContent = `第 ${startLevel} 关`;
    req<HTMLElement>(root, '#intro-enemies').textContent = `敌人 ${counts.total} 辆`;
    if (doc.activeElement instanceof HTMLElement) doc.activeElement.blur();
    overlays.hide(overlayStart);
    overlays.show(overlayIntro);
    setScreen('levelIntro');
  };

  const toStart = (): void => {
    if (screen !== 'gameOver' && screen !== 'victory') return;
    state = null;
    for (const el of [overlayIntro, overlayClear, overlayGameOver, overlayVictory]) overlays.hide(el);
    overlays.show(overlayStart);
    setScreen('start');
  };

  startBtn.addEventListener('click', startGame);
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-action="to-start"]')) b.addEventListener('click', toStart);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
  });
  bindKeyboard(win, input);

  const step = (dtMs: number): void => {
    screenMs += dtMs;
    if (screen === 'levelIntro' && screenMs >= CONFIG.screenMs.levelIntro) {
      overlays.hide(overlayIntro);
      setScreen('playing');
      return;
    }
    if (screen !== 'playing' || !state) return;
    if (gameOverInMs !== null) {
      gameOverInMs -= dtMs;
      if (gameOverInMs <= 0) showGameOver();
      return;
    }
    const events = stepWorld(state, { direction: input.direction, fire: input.consumeFire() }, dtMs);
    if (events.responded) input.markResponded(win.performance.now());
    if (events.some((e) => e.type === 'brickHit')) renderer.terrainChanged();
    if (events.some((e) => e.type === 'gameOver')) {
      // A-9: no more input once the game is lost; the explosion plays before the failure screen.
      input.setEnabled(false);
      gameOverInMs = CONFIG.screenMs.gameOverDelay;
    }
  };

  const showGameOver = (): void => {
    gameOverInMs = null;
    gameOverScore.textContent = String(state?.score ?? 0);
    setHighScoreText();
    overlays.show(overlayGameOver);
    setScreen('gameOver');
  };

  const loop = new FixedLoop(step);
  const frame = (now: number): void => {
    loop.frame(now);
    overlays.update(now);
    updateHud(hud, state);
    renderer.render(state);
    win.requestAnimationFrame(frame);
  };

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') loop.resetClock();
  });
  watchStage(win, stage, renderer);
  overlays.showNow(overlayStart);
  setScreen('start');
  win.requestAnimationFrame(frame);

  const api: SteelDefenseApi = Object.freeze({
    version: VERSION,
    snapshot: (): SteelDefenseSnapshot =>
      buildSnapshot({
        screen,
        transitioning: overlays.transitioning,
        seed: opts.seed,
        level: state?.level ?? startLevel,
        state,
        highScore,
        muted,
        perf: loop.stats(),
        input: { direction: input.direction, fire: input.fireHeld, lastResponseMs: input.lastResponseMs },
      }),
  });
  win.steelDefense = api;
  return api;
}
