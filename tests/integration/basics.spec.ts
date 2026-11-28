import { expect, test } from '@playwright/test';
import { snap, startPlaying } from './helpers';

test.describe('AC-1 / AC-3 title and how-to', () => {
  test('shows the title, the how-to region and no existing game names', async ({ page }) => {
    await page.goto('/?seed=1');
    await expect(page).toHaveTitle('钢铁防线');
    await expect(page.getByRole('heading', { level: 1, name: '钢铁防线' })).toBeVisible();
    const start = page.getByRole('dialog', { name: '开始画面' });
    await expect(start).toBeVisible();
    await expect(start.getByRole('button', { name: '开始游戏' })).toBeVisible();
    await expect(start.getByText('钢铁防线', { exact: true })).toBeVisible();
    const howTo = page.getByRole('region', { name: '怎么玩' });
    await expect(howTo).toBeVisible();
    await expect(howTo.getByRole('heading', { name: '怎么玩' })).toBeVisible();
    const text = await howTo.innerText();
    for (const part of ['方向键', 'W', 'A', 'S', 'D', '空格', '开火', '消灭', '敌方坦克', '指挥所', '静音', '可能听不到音效']) {
      expect(text).toContain(part);
    }
    await expect(page.getByRole('status', { name: '历史最高分' })).toHaveText(/^\d+$/);
    await expect(page.getByRole('button', { name: '静音' })).toHaveAttribute('aria-pressed', 'false');
    const all = await page.locator('body').innerText();
    for (const banned of ['坦克大战', 'Battle City', 'Tank 1990', '坦克1990', '坦克世界', 'World of Tanks', '90坦克', 'Tank Force', 'Tank Battalion']) {
      expect(all).not.toContain(banned);
    }
  });

  test('how-to explains the phone virtual controls and the system-mute hint (AC-3)', async ({ page }) => {
    await page.goto('/?seed=1');
    const items = await page.getByRole('region', { name: '怎么玩' }).getByRole('listitem').allInnerTexts();
    const phone = items.filter((t) => t.includes('手机') && t.includes('方向键'));
    expect(phone, items.join('\n')).toHaveLength(1);
    for (const part of ['按住', '移动', '松开即停', '开火按钮']) {
      expect(phone[0]).toContain(part);
    }
    const desktop = items.filter((t) => !t.includes('手机'));
    expect(desktop.some((t) => t.includes('方向键') && t.includes('W / A / S / D'))).toBe(true);
    expect(desktop.some((t) => t.includes('空格') && t.includes('开火'))).toBe(true);
    expect(items.join('\n')).toContain('手机处于静音模式等系统原因时，可能听不到音效。');
  });

  test('how-to is readable on a phone without horizontal scrolling', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto('/?seed=1');
    const howTo = page.getByRole('region', { name: '怎么玩' });
    await expect(howTo).toBeVisible();
    expect(await howTo.innerText()).toContain('开火');
    const box = (await howTo.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
    await ctx.close();
  });
});

test.describe('AC-4 keyboard', () => {
  test('arrows and WASD move, face, stop on release and fire along the facing', async ({ page }) => {
    await startPlaying(page);
    const keys: Array<[string, string]> = [
      ['ArrowUp', 'up'], ['KeyW', 'up'], ['ArrowRight', 'right'], ['KeyD', 'right'],
      ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowDown', 'down'], ['KeyS', 'down'],
    ];
    for (const [key, dir] of keys) {
      const horizontal = dir === 'left' || dir === 'right';
      const sign = dir === 'up' || dir === 'left' ? -1 : 1;
      const p0 = (await snap(page)).player!;
      await page.keyboard.down(key);
      await page.clock.runFor(100);
      const p1 = (await snap(page)).player!;
      await page.clock.runFor(400);
      const p2 = (await snap(page)).player!;
      await page.keyboard.up(key);
      await page.clock.runFor(100);
      const p3 = (await snap(page)).player!;
      await page.clock.runFor(400);
      const p4 = (await snap(page)).player!;
      expect(p1.dir, key).toBe(dir);
      const along = (p: { x: number; y: number }) => (horizontal ? p.x : p.y) * sign;
      const cross = (p: { x: number; y: number }) => (horizontal ? p.y : p.x);
      expect(along(p1), key).toBeGreaterThan(along(p0));
      expect(along(p2), key).toBeGreaterThan(along(p1));
      expect(cross(p2), key).toBe(cross(p1));
      expect(p4, key).toEqual(p3);
      expect(p4.dir, key).toBe(dir);
      expect(p4.moving, key).toBe(false);
    }
  });

  test('space fires a bullet travelling along the facing in all four directions', async ({ page }) => {
    await startPlaying(page);
    // From spawn (col 4,row 12) row 10 is open: go up into it, then face each way.
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(1000);
    await page.keyboard.up('ArrowUp');
    for (const [key, dir] of [['ArrowRight', 'right'], ['ArrowLeft', 'left'], ['ArrowDown', 'down'], ['ArrowUp', 'up']] as const) {
      await page.keyboard.down(key);
      await page.clock.runFor(dir === 'up' ? 20 : 300);
      await page.keyboard.up(key);
      await page.clock.runFor(800);
      const before = await snap(page);
      expect(before.bullets.filter((b) => b.owner === 'player')).toHaveLength(0);
      await page.keyboard.down('Space');
      await page.clock.runFor(20);
      await page.keyboard.up('Space');
      const s1 = await snap(page);
      const p = s1.player!;
      expect(p.dir).toBe(dir);
      const mine = s1.bullets.filter((b) => b.owner === 'player');
      expect(mine, dir).toHaveLength(1);
      expect(mine[0].dir).toBe(dir);
      const cx = p.x + 0.4375;
      const cy = p.y + 0.4375;
      if (dir === 'up') expect(mine[0].y).toBeLessThan(cy);
      if (dir === 'down') expect(mine[0].y).toBeGreaterThan(cy);
      if (dir === 'left') expect(mine[0].x).toBeLessThan(cx);
      if (dir === 'right') expect(mine[0].x).toBeGreaterThan(cx);
      await page.clock.runFor(1500);
    }
  });

  test('last pressed direction wins and release falls back (A-4)', async ({ page }) => {
    await startPlaying(page);
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(1000);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await page.clock.runFor(100);
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(50);
    const a = (await snap(page)).player!;
    expect(a.dir).toBe('up');
    await page.keyboard.up('ArrowUp');
    await page.clock.runFor(100);
    const b = (await snap(page)).player!;
    expect(b.dir).toBe('left');
    await page.clock.runFor(100);
    const c = (await snap(page)).player!;
    expect(c.x).toBeLessThan(b.x);
    await page.keyboard.up('ArrowLeft');
  });

  test('keys during the level intro do nothing (A-9)', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto('/?seed=1');
    await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await page.clock.runFor(100);
    const intro = page.getByRole('dialog', { name: '关卡开场' });
    await expect(intro).toContainText('第 1 关');
    await expect(intro).toContainText('敌人 10 辆');
    const s0 = await snap(page);
    expect(s0.screen).toBe('levelIntro');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');
    await page.clock.runFor(500);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('Space');
    const s1 = await snap(page);
    expect(s1.player).toEqual(s0.player);
    expect(s1.bullets).toHaveLength(0);
    await page.clock.runFor(1500);
    const s2 = await snap(page);
    expect(s2.screen).toBe('playing');
    expect(s2.player).toEqual(s0.player);
    await expect(page.getByRole('status', { name: '关卡' })).toHaveText('1');
    await expect(page.getByRole('status', { name: '生命' })).toHaveText('3');
    await expect(page.getByRole('status', { name: '分数' })).toHaveText('0');
    await expect(page.getByRole('status', { name: '剩余敌人' })).toHaveText('10');
  });
});

test('dev-only harness mounts the app at a chosen start level', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/tests/integration/harness/index.html?seed=7&startLevel=3');
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.clock.runFor(100);
  await expect(page.getByRole('dialog', { name: '关卡开场' })).toContainText('第 3 关');
  const s = await snap(page);
  expect(s.level).toBe(3);
  expect(s.seed).toBe(7);
  expect(s.map.cells[1]).toHaveLength(52);
});

test.describe('AC-6 terrain', () => {
  test('every level contains brick, steel and water; level 1 map matches its layout', async ({ page }) => {
    await startPlaying(page);
    const s = await snap(page);
    expect(s.levels).toHaveLength(5);
    for (const lv of s.levels) {
      const t = lv.layout.join('');
      expect(t).toContain('B');
      expect(t).toContain('S');
      expect(t).toContain('W');
    }
    expect(s.map.cells).toHaveLength(52);
    s.levels[0].layout.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const want = ch === 'H' ? '.' : ch;
        expect(s.map.cells[r * 4 + 1][c * 4 + 1]).toBe(want);
      });
    });
  });

  test('shooting a brick wall chips it unit by unit until the tank can pass', async ({ page }) => {
    await startPlaying(page);
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(1000);
    await page.keyboard.up('ArrowUp');
    const s0 = await snap(page);
    expect(s0.player!.y).toBeCloseTo(10, 5);
    const tile = (s: typeof s0) => s.map.cells.slice(36, 40).map((r) => r.slice(16, 20));
    expect(tile(s0)).toEqual(['BBBB', 'BBBB', 'BBBB', 'BBBB']);
    await page.keyboard.press('Space');
    await page.clock.runFor(300);
    const s1 = await snap(page);
    expect(s1.bullets).toHaveLength(0);
    expect(tile(s1)).toEqual(['BBBB', 'BBBB', '....', '....']);
    await page.keyboard.press('Space');
    await page.clock.runFor(300);
    expect(tile(await snap(page))).toEqual(['....', '....', '....', '....']);
    await page.keyboard.down('ArrowUp');
    await page.clock.runFor(700);
    await page.keyboard.up('ArrowUp');
    expect((await snap(page)).player!.y).toBeLessThan(9);
  });
});
