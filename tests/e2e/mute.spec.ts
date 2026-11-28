import { expect, test } from '@playwright/test';
import { openGame, passIntro, snap } from './helpers';

test.describe('E2E mute (AC-20, AC-19)', () => {
  test('sound on by default; mute in game silences everything; unmute restores; reload is on again', async ({ page }) => {
    await openGame(page);
    const muteBtn = page.getByRole('button', { name: '静音' });
    await expect(muteBtn).toBeVisible();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    expect((await snap(page)).audio).toMatchObject({ muted: false, masterGain: 1 });

    await page.getByRole('button', { name: '开始游戏' }).click();
    await passIntro(page);
    expect((await snap(page)).audio).toMatchObject({ state: 'running', musicPlaying: true, masterGain: 1 });

    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    expect((await snap(page)).audio.cues.map((c) => c.name)).toContain('fire');

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    expect((await snap(page)).audio).toMatchObject({ muted: true, masterGain: 0 });
    await page.clock.runFor(600);
    await page.keyboard.press('Space');
    await page.clock.runFor(300);
    expect((await snap(page)).audio).toMatchObject({ muted: true, masterGain: 0 });

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    expect((await snap(page)).audio).toMatchObject({ muted: false, masterGain: 1, musicPlaying: true });

    // Muting on the start screen does not survive a reload.
    await page.reload();
    await expect(page.getByRole('dialog', { name: '开始画面' })).toBeVisible();
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: '静音' })).toHaveAttribute('aria-pressed', 'false');
    expect((await snap(page)).audio).toMatchObject({ muted: false, masterGain: 1 });
  });
});
