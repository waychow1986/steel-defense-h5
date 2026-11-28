import { CONFIG } from './config';
import { tankCenter } from './tanks';
import type { GameEvent, GameState, PlayerTank, PowerUpType, Tank } from './types';

const S = CONFIG.tankSize;

/** TD-020: odd carrier numbers drop a shield, even ones firepower. */
export function powerUpTypeFor(carrierSeq: number): PowerUpType {
  return carrierSeq % 2 === 1 ? 'shield' : 'firepower';
}

/** Drops a power-up in the tile holding the destroyed carrier's centre. */
export function dropPowerUp(state: GameState, t: Tank): void {
  if (!t.carrier) return;
  state.powerUpsDropped += 1;
  const c = tankCenter(t);
  state.powerUps.push({
    id: state.nextId++,
    type: powerUpTypeFor(t.carrierSeq ?? state.powerUpsDropped),
    x: Math.min(CONFIG.cols - 1, Math.max(0, Math.floor(c.x))),
    y: Math.min(CONFIG.rows - 1, Math.max(0, Math.floor(c.y))),
  });
}

function applyPowerUp(p: PlayerTank, type: PowerUpType): void {
  if (type === 'shield') {
    p.shieldMs = CONFIG.shieldMs;
  } else {
    p.firepower = 1;
    p.maxBullets = CONFIG.playerMaxBulletsUpgraded;
  }
}

/** Only the player picks up power-ups: any overlap of its box with the power-up tile (A-3). */
export function collectPowerUps(state: GameState, events: GameEvent[]): void {
  const p = state.player;
  if (!p || state.powerUps.length === 0) return;
  state.powerUps = state.powerUps.filter((u) => {
    const over = p.x < u.x + 1 && u.x < p.x + S && p.y < u.y + 1 && u.y < p.y + S;
    if (!over) return true;
    applyPowerUp(p, u.type);
    events.push({ type: 'pickup', powerUp: u.type, x: u.x + 0.5, y: u.y + 0.5 });
    return false;
  });
}
