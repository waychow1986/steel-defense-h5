import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/render/palette';
import { ART, OUTLINE_WIDTH, DEFAULT_DRAW } from '../../src/render/sprites/art';
import { allRecipes, TANK_TYPES, type SpriteRecipe } from '../../src/render/sprites';
import { TANK_STYLES } from '../../src/render/sprites/tank';

interface Recording {
  colors: string[];
  fills: Array<{ style: string; tx: number; ty: number; path: string }>;
  strokes: Array<{ style: string; width: number }>;
}

/** A 2D context stand-in that records colours, fills (with their translation) and strokes. */
function record(recipe: SpriteRecipe, shadowBlur = false): Recording {
  const rec: Recording = { colors: [], fills: [], strokes: [] };
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, tx: 0, ty: 0 };
  const stack: Array<typeof state> = [];
  let path: string[] = [];
  const methods: Record<string, (...a: number[]) => void> = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
    translate: (x, y) => {
      state.tx += x;
      state.ty += y;
    },
    beginPath: () => (path = []),
    rect: (...a) => path.push(`r${a.map((v) => v.toFixed(4)).join(',')}`),
    arc: (...a) => path.push(`a${a.slice(0, 3).map((v) => v.toFixed(4)).join(',')}`),
    moveTo: (...a) => path.push(`m${a.map((v) => v.toFixed(4)).join(',')}`),
    lineTo: (...a) => path.push(`l${a.map((v) => v.toFixed(4)).join(',')}`),
    fill: () => rec.fills.push({ style: state.fillStyle, tx: state.tx, ty: state.ty, path: path.join(' ') }),
    fillRect: (...a) => rec.fills.push({ style: state.fillStyle, tx: state.tx, ty: state.ty, path: `R${a.map((v) => v.toFixed(4)).join(',')}` }),
    stroke: () => rec.strokes.push({ style: state.strokeStyle, width: state.lineWidth }),
    strokeRect: () => rec.strokes.push({ style: state.strokeStyle, width: state.lineWidth }),
  };
  const ctx = new Proxy(
    {},
    {
      get: (_t, key: string) => methods[key] ?? (key in state ? state[key as keyof typeof state] : () => undefined),
      set: (_t, key: string, value) => {
        if (key === 'fillStyle' || key === 'strokeStyle' || key === 'shadowColor') rec.colors.push(String(value));
        if (key in state) (state as Record<string, unknown>)[key] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  recipe.draw(ctx, { ...DEFAULT_DRAW, shadowBlur });
  return rec;
}

const recipes = allRecipes();
const paletteValues = new Set<string>(Object.values(PALETTE));

describe('UT-art: one palette and one drawing style for every sprite (AC-15)', () => {
  it('covers tanks of every type, the base, both power-ups, bullet, muzzle flash and terrain', () => {
    const kinds = new Set(recipes.map((r) => r.name.split(':')[0]));
    expect([...kinds].sort()).toEqual(['barrel', 'base', 'bullet', 'muzzle', 'powerUp', 'tank', 'terrain', 'turret']);
    for (const t of TANK_TYPES) expect(recipes.some((r) => r.name.startsWith(`tank:${t}:`))).toBe(true);
  });

  it('every sprite takes all its colours from the palette', () => {
    for (const r of recipes) {
      for (const blur of [false, true]) {
        const rec = record(r, blur);
        expect(rec.colors.length, r.name).toBeGreaterThan(0);
        for (const c of rec.colors) expect(paletteValues.has(c), `${r.name} uses ${c}`).toBe(true);
      }
    }
  });

  it('no source file outside the palette writes a colour literal', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '../../src'));
    const offenders = files.filter((f) => !f.endsWith(join('render', 'palette.ts')) && /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every shadow uses the shared colour and is offset by the same amount to the bottom-right', () => {
    expect(ART.shadowColor).toBe(PALETTE.shadow);
    expect(ART.shadowOffset).toBeGreaterThan(0);
    for (const r of recipes) {
      const shadows = record(r).fills.filter((f) => f.style === ART.shadowColor);
      if (r.shadow) expect(shadows.length, r.name).toBeGreaterThan(0);
      else expect(shadows, r.name).toEqual([]);
      for (const s of shadows) expect([s.tx, s.ty], r.name).toEqual([ART.shadowOffset, ART.shadowOffset]);
      // Nothing else is drawn offset: shadows are the only translated fills.
      for (const f of record(r).fills.filter((x) => x.style !== ART.shadowColor)) expect([f.tx, f.ty], r.name).toEqual([0, 0]);
    }
  });

  it('every outline has the same colour and width', () => {
    expect(OUTLINE_WIDTH).toBeCloseTo(ART.outlinePx / ART.logicalPxPerTile);
    for (const r of recipes) {
      const rec = record(r);
      if (/^(tank|barrel|turret|base|powerUp|bullet):/.test(r.name) || r.name === 'bullet') expect(rec.strokes.length, r.name).toBeGreaterThan(0);
      for (const s of rec.strokes) {
        expect(s.style, r.name).toBe(PALETTE.outline);
        expect(s.width, r.name).toBe(OUTLINE_WIDTH);
      }
    }
  });

  it('tanks are layered: at least three palette colours besides shadow and outline', () => {
    for (const r of recipes.filter((x) => /^(tank|base|powerUp):/.test(x.name))) {
      const own = new Set(record(r).colors.filter((c) => c !== PALETTE.shadow && c !== PALETTE.outline));
      expect(own.size, r.name).toBeGreaterThanOrEqual(3);
    }
  });

  it('player and the three enemy types differ pairwise in main colour and in outline', () => {
    const main = TANK_TYPES.map((t) => PALETTE[TANK_STYLES[t].body]);
    expect(new Set(main).size).toBe(TANK_TYPES.length);
    const silhouettes = TANK_TYPES.map((t) => {
      const r = recipes.find((x) => x.name === `tank:${t}:up:0:false`)!;
      return record(r).fills.find((f) => f.style === ART.shadowColor)!.path;
    });
    expect(new Set(silhouettes).size).toBe(TANK_TYPES.length);
  });

  it('the hit-flash sprite differs from the normal sprite but keeps the same silhouette', () => {
    for (const t of TANK_TYPES) {
      const normal = record(recipes.find((x) => x.name === `tank:${t}:left:1:false`)!);
      const hit = record(recipes.find((x) => x.name === `tank:${t}:left:1:true`)!);
      expect(hit.colors).not.toEqual(normal.colors);
      expect(hit.fills.find((f) => f.style === ART.shadowColor)!.path).toBe(normal.fills.find((f) => f.style === ART.shadowColor)!.path);
    }
  });

  it('tread phases draw the tread links at different places', () => {
    for (const t of TANK_TYPES) {
      const paths = [0, 1, 2, 3].map((p) => JSON.stringify(record(recipes.find((x) => x.name === `tank:${t}:up:${p}:false`)!).fills));
      expect(new Set(paths).size).toBe(4);
    }
  });
});
