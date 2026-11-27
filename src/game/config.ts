// All tunable game numbers live here (TD-017, design "画面时序").
export const CONFIG = {
  cols: 13,
  rows: 13,
  unitsPerTile: 4,
  /** Tank side length in tiles: one tile minus a half-unit margin. */
  tankSize: 0.875,
  /** Turning to a perpendicular direction snaps the cross axis centre to this grid (tiles). */
  snapGrid: 0.5,

  stepMs: 1000 / 60,
  maxStepsPerFrame: 4,
  maxFrameGapMs: 250,
  perfWindowMs: 5000,

  playerSpeed: 3.0,
  enemySpeed: { normal: 2.0, fast: 3.5, heavy: 1.6 },
  enemyHp: { normal: 1, fast: 1, heavy: 3 },
  enemyScore: { normal: 100, fast: 200, heavy: 300 },

  bulletSpeed: 9,
  bulletSpeedUpgraded: 13,
  bulletSubSteps: 2,
  /** Bullet hit box side, tiles. */
  bulletSize: 0.25,
  playerMaxBullets: 1,
  playerMaxBulletsUpgraded: 2,
  /** Brick strip cleared per hit: units across the flight × units along it. */
  brickClearAcross: 4,
  brickClearAlong: 2,

  enemyFireIntervalMs: [800, 2000] as const,
  enemyMaxOnField: 4,
  enemySpawnIntervalMs: 2500,
  enemySpawnCols: [0, 6, 12] as const,
  shieldMs: 10_000,
  powerUpHintMs: 1500,

  playerSpawn: { col: 4, row: 12 },
  baseTile: { col: 6, row: 12 },
  startLives: 3,

  recoilMs: 120,
  treadStep: 0.125,
  treadPhases: 4,

  screenMs: {
    levelIntro: 1800,
    clearDelay: 1200,
    levelClear: 2000,
    gameOverDelay: 1200,
  },
  overlayEnterMs: 350,
  overlayLeaveMs: 300,
  curtainMs: 450,

  maxDpr: 2,
  highScoreKey: 'steel-defense.highScore.v1',
} as const;
