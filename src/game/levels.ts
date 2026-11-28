import type { EnemyType, LevelDef } from './types';

const N: EnemyType = 'normal';
const F: EnemyType = 'fast';
const H: EnemyType = 'heavy';

// Original layouts. Fixed spawn points (not written in the strings): player at row 12 col 4,
// enemies at row 0 cols 0/6/12. 'H' is the command post at row 12 col 6.
export const LEVELS: readonly LevelDef[] = [
  {
    level: 1,
    layout: [
      '.............',
      '..BB.....BB..',
      '..BB.SSS.BB..',
      '.............',
      'B.WWW...WWW.B',
      'B...........B',
      '..B.BB.BB.B..',
      '..B.......B..',
      'S...B.S.B...S',
      '....B...B....',
      '.BB.......BB.',
      '.....BBB.....',
      '.....BHB.....',
    ],
    order: [N, N, N, F, N, N, H, N, F, N],
    carriers: [4, 8],
  },
  {
    level: 2,
    layout: [
      '.............',
      '.SS..B.B..SS.',
      '.....B.B.....',
      '..BBBB.BBBB..',
      '..W.......W..',
      '..W.SS.SS.W..',
      '..W.......W..',
      'B...BB.BB...B',
      'B...B...B...B',
      '....B.S.B....',
      '.SB.......BS.',
      '.....BBB.....',
      '.B...BHB...B.',
    ],
    order: [N, N, F, N, N, H, N, F, N, H, F, N],
    carriers: [4, 9],
  },
  {
    level: 3,
    layout: [
      '.............',
      '..B..BBB..B..',
      '..B.......B..',
      'SSB..WWW..BSS',
      '....WWWWW....',
      '.BB..WWW..BB.',
      '.B.........B.',
      '.B..S.B.S..B.',
      '....S.B.S....',
      'BB.........BB',
      '..B.BB.BB.B..',
      '..B..BBB..B..',
      '.....BHB.....',
    ],
    order: [N, N, F, N, N, H, F, N, N, H, F, N, H, F],
    carriers: [3, 8, 12],
  },
  {
    level: 4,
    layout: [
      '.............',
      '.B.S.B.B.S.B.',
      '.B...B.B...B.',
      '...WW...WW...',
      'BB.........BB',
      '...B.SBS.B...',
      '.W.B.....B.W.',
      '.W...B.B...W.',
      '...S.B.B.S...',
      'BB.........BB',
      '..BB.S.S.BB..',
      '.....BBB.....',
      '..B..BHB..B..',
    ],
    order: [N, F, N, N, H, F, N, N, H, F, N, H, F, N, H, F],
    carriers: [3, 8, 13],
  },
  {
    level: 5,
    layout: [
      '.............',
      '.SBB.BSB.BBS.',
      '..W.......W..',
      '..W.BB.BB.W..',
      'B.W.B...B.W.B',
      '....B.S.B....',
      '.SS.......SS.',
      '....BWWWB....',
      'B.B.......B.B',
      '..B.S.B.S.B..',
      '.BB.......BB.',
      '..S..BBB..S..',
      '.....BHB.....',
    ],
    order: [N, F, N, H, F, N, N, H, F, N, H, F, N, H, F, N, H, F],
    carriers: [3, 7, 11, 15],
  },
];

export function levelDef(level: number): LevelDef {
  const def = LEVELS[level - 1];
  if (!def) throw new RangeError(`no level ${level}`);
  return def;
}

export function levelCounts(def: LevelDef): { total: number; byType: Record<EnemyType, number> } {
  const byType: Record<EnemyType, number> = { normal: 0, fast: 0, heavy: 0 };
  for (const t of def.order) byType[t] += 1;
  return { total: def.order.length, byType };
}
