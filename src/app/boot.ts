import { AudioEngine } from '../audio/audio-engine';
import { cueForEvent } from '../audio/cues';
import { CONFIG } from '../game/config';
import { LEVELS, levelCounts, levelDef } from '../game/levels';
import { advanceLevel, createWorld, stepWorld } from '../game/sim';
import type { GameState, Screen } from '../game/types';
import { InputState } from '../input/input-state';
import { bindKeyboard } from '../input/keyboard';
import { bindTouch } from '../input/touch';
import { Effects } from '../render/effects';
import { applyCssPalette } from '../render/palette';
import { Renderer } from '../render/renderer';
import { readHighScore, safeLocalStorage, saveHighScore } from '../storage/high-score';
import { buildSnapshot, type SteelDefenseSnapshot } from './diagnostics';
import { updateHud } from './hud';
import { HowToPlacement, watchStage } from './layout';
import { FixedLoop } from './loop';
import { curtainCover, OverlayManager } from './screens';

export interface BootOptions {
  seed: number;
  /** Test-only: first level of a new game (only the integration harness passes this). */
  startLevel?: number;
  /** Test-only: hands the live world to the integration harness. The production entry never passes it. */
  onTestAccess?: (access: { world(): GameState | null }) => void;
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
  const victoryScore = req<HTMLElement>(root, '#victory-score');
  const clearText = req<HTMLElement>(root, '#clear-text');
  const powerUpHint = req<HTMLElement>(root, '#powerup-hint');
  const hud = {
    level: req<HTMLElement>(root, '#hud-level'),
    score: req<HTMLElement>(root, '#hud-score'),
    lives: req<HTMLElement>(root, '#hud-lives'),
    enemies: req<HTMLElement>(root, '#hud-enemies'),
  };

  const startLevel = Math.min(5, Math.max(1, Math.floor(opts.startLevel ?? 1)));
  const storage = safeLocalStorage();
  let highScore = readHighScore(storage);
  let screen: Screen = 'start';
  let state: GameState | null = null;
  let screenMs = 0;
  /** Time left before the failure screen after the base fell or the last life was lost; null when not pending. */
  let gameOverInMs: number | null = null;
  /** Time left before the clear screen after the last enemy fell; null when not pending. */
  let clearInMs: number | null = null;
  let hintMs = 0;
  let muted = false;

  const input = new InputState();
  const overlays = new OverlayManager();
  const renderer = new Renderer(canvas);
  const effects = new Effects(opts.seed || 1);
  const audio = new AudioEngine(() => win.performance.now());
  const howToPlacement = new HowToPlacement(win, app, howTo, howTo.parentElement as HTMLElement, startBtn, req<HTMLElement>(root, '#side-panel'));

  const setHighScoreText = (): void => {
    for (const el of root.querySelectorAll<HTMLElement>('#start-high, #gameover-high, #victory-high')) el.textContent = String(highScore);
  };
  setHighScoreText();

  /** FR-030: a score above the record is saved at once, also mid-game. */
  const recordScore = (): void => {
    if (!state || state.score <= highScore) return;
    highScore = saveHighScore(storage, state.score);
    setHighScoreText();
  };

  const setHint = (text: string, ms: number): void => {
    powerUpHint.textContent = text;
    hintMs = ms;
  };

  const showIntro = (level: number): void => {
    const counts = levelCounts(levelDef(level));
    req<HTMLElement>(root, '#intro-level').textContent = `第 ${level} 关`;
    req<HTMLElement>(root, '#intro-enemies').textContent = `敌人 ${counts.total} 辆`;
    overlays.show(overlayIntro);
    setScreen('levelIntro');
  };

  const setScreen = (next: Screen): void => {
    screen = next;
    screenMs = 0;
    if (state) state.screen = next;
    app.dataset.screen = next;
    input.setEnabled(next === 'playing');
    audio.setMusic(next === 'levelIntro' || next === 'playing' || next === 'levelClear');
    howToPlacement.update(next === 'start');
  };

  const startGame = (): void => {
    if (screen !== 'start') return;
    // FR-043: the start tap/click is the gesture that enables sound on phones.
    audio.unlock();
    effects.reset();
    state = createWorld({ seed: opts.seed, level: startLevel, screen: 'levelIntro' });
    gameOverInMs = null;
    clearInMs = null;
    setHint('', 0);
    renderer.terrainChanged();
    if (doc.activeElement instanceof HTMLElement) doc.activeElement.blur();
    overlays.hide(overlayStart);
    showIntro(startLevel);
  };

  const toStart = (): void => {
    if (screen !== 'gameOver' && screen !== 'victory') return;
    state = null;
    effects.reset();
    for (const el of [overlayIntro, overlayClear, overlayGameOver, overlayVictory]) overlays.hide(el);
    overlays.show(overlayStart);
    setScreen('start');
  };

  startBtn.addEventListener('click', startGame);
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-action="to-start"]')) b.addEventListener('click', toStart);
  muteBtn.addEventListener('click', () => {
    // TD-007: the mute button is also a gesture that creates/resumes audio.
    audio.unlock();
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    audio.setMuted(muted);
  });
  // TD-007: any key press creates/resumes audio; any touch or click resumes a context the system
  // suspended or interrupted mid-game. Captured on the window so it also runs for the pad and fire button.
  win.addEventListener('keydown', () => audio.unlock(), true);
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click'] as const) win.addEventListener(type, () => audio.resumeOnGesture(), true);
  bindKeyboard(win, input);
  bindTouch(win, req<HTMLElement>(root, '.dpad'), req<HTMLElement>(root, '#fire-btn'), input);

  const step = (dtMs: number): void => {
    screenMs += dtMs;
    effects.update(dtMs);
    if (hintMs > 0) {
      hintMs -= dtMs;
      if (hintMs <= 0) setHint('', 0);
    }
    if (screen === 'levelIntro' && screenMs >= CONFIG.screenMs.levelIntro) {
      overlays.hide(overlayIntro);
      setScreen('playing');
      return;
    }
    if (screen === 'levelClear' && screenMs >= CONFIG.screenMs.levelClear) {
      afterClear();
      return;
    }
    if (screen !== 'playing' || !state) return;
    if (gameOverInMs !== null) {
      gameOverInMs -= dtMs;
      if (gameOverInMs <= 0) showGameOver();
      return;
    }
    if (clearInMs !== null) {
      clearInMs -= dtMs;
      if (clearInMs <= 0) showClear();
      return;
    }
    const events = stepWorld(state, { direction: input.direction, fire: input.consumeFire() }, dtMs);
    if (events.responded) input.markResponded(win.performance.now());
    recordScore();
    if (events.some((e) => e.type === 'brickHit')) renderer.terrainChanged();
    effects.handle(events);
    for (const e of events) {
      const cue = cueForEvent(e);
      if (cue) audio.play(cue);
    }
    for (const e of events) {
      if (e.type === 'pickup') setHint(e.powerUp === 'shield' ? '护盾' : '火力升级', CONFIG.powerUpHintMs);
    }
    if (events.some((e) => e.type === 'gameOver')) {
      // A-9: no more input once the game is lost; the explosion plays before the failure screen.
      input.setEnabled(false);
      gameOverInMs = CONFIG.screenMs.gameOverDelay;
    } else if (events.some((e) => e.type === 'levelClear')) {
      // The last explosion plays before the clear screen.
      input.setEnabled(false);
      clearInMs = CONFIG.screenMs.clearDelay;
    }
  };

  const showClear = (): void => {
    clearInMs = null;
    clearText.textContent = `第 ${state?.level ?? 1} 关 过关`;
    overlays.show(overlayClear);
    setScreen('levelClear');
  };

  /** After the clear screen: the next level's intro, or the victory screen after the last level (FR-023). */
  const afterClear = (): void => {
    overlays.hide(overlayClear);
    if (!state) return;
    recordScore();
    if (state.level >= LEVELS.length) {
      victoryScore.textContent = String(state.score);
      setHighScoreText();
      overlays.show(overlayVictory);
      setScreen('victory');
      return;
    }
    state = advanceLevel(state);
    effects.reset();
    renderer.terrainChanged();
    showIntro(state.level);
  };

  const showGameOver = (): void => {
    gameOverInMs = null;
    gameOverScore.textContent = String(state?.score ?? 0);
    recordScore();
    setHighScoreText();
    overlays.show(overlayGameOver);
    setScreen('gameOver');
  };

  const curtain = (): number => (screen === 'levelIntro' ? curtainCover(screenMs) : 0);

  const loop = new FixedLoop(step);
  const frame = (now: number): void => {
    loop.frame(now);
    overlays.update(now);
    updateHud(hud, state);
    renderer.render(state, curtain(), effects);
    win.requestAnimationFrame(frame);
  };

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') loop.resetClock();
    audio.resumeIfVisible(doc.visibilityState === 'visible');
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
        transitioning: overlays.transitioning || (screen === 'levelIntro' && screenMs < CONFIG.curtainMs),
        seed: opts.seed,
        level: state?.level ?? startLevel,
        state,
        highScore,
        effects: effects.counts(),
        audio: audio.status(),
        perf: loop.stats(),
        input: { direction: input.direction, fire: input.fireHeld, lastResponseMs: input.lastResponseMs },
      }),
  });
  win.steelDefense = api;
  opts.onTestAccess?.({ world: () => state });
  return api;
}
