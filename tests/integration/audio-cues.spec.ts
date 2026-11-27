import { expect, test } from '@playwright/test';

type Features = { name: string; durationS: number; envelope: number[]; centroidHz: number };

test.describe('IT-01 six cues sound distinct (AC-19)', () => {
  test('each pair of cues differs clearly in duration, loudness envelope or spectral centroid', async ({ page }) => {
    await page.goto('/');
    const features = await page.evaluate(async (): Promise<Features[]> => {
      const url = '/src/audio/cues.ts';
      const mod = (await import(/* @vite-ignore */ url)) as typeof import('../../src/audio/cues');
      const SR = 44100;
      const out: Features[] = [];
      for (const name of mod.CUE_NAMES) {
        const recipe = mod.CUE_RECIPES[name];
        const ctx = new OfflineAudioContext(1, Math.ceil((recipe.durationS + 0.3) * SR), SR);
        recipe.play(ctx, ctx.destination, 0);
        const data = (await ctx.startRendering()).getChannelData(0);

        // Audible duration: last 10 ms window whose RMS is within -40 dB of the loudest window.
        const win = Math.round(SR * 0.01);
        const rms: number[] = [];
        for (let i = 0; i + win <= data.length; i += win) {
          let s = 0;
          for (let j = i; j < i + win; j++) s += data[j] * data[j];
          rms.push(Math.sqrt(s / win));
        }
        const peak = Math.max(...rms);
        let last = 0;
        rms.forEach((v, i) => {
          if (v > peak * 0.01) last = i;
        });
        const durationS = ((last + 1) * win) / SR;

        // Envelope: 16 equal slices of the audible part, normalised to the peak.
        const envelope: number[] = [];
        for (let k = 0; k < 16; k++) {
          const a = Math.floor((k * (last + 1)) / 16);
          const b = Math.max(a + 1, Math.floor(((k + 1) * (last + 1)) / 16));
          envelope.push(rms.slice(a, b).reduce((x, y) => x + y, 0) / (b - a) / peak);
        }

        // Spectral centroid: energy-weighted mean of 1024-point DFT magnitudes over frames.
        const N = 1024;
        let num = 0;
        let den = 0;
        const end = (last + 1) * win;
        for (let f = 0; f + N <= end; f += N * 2) {
          for (let k = 1; k < N / 2; k += 2) {
            let re = 0;
            let im = 0;
            for (let n = 0; n < N; n++) {
              const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
              const ang = (2 * Math.PI * k * n) / N;
              re += data[f + n] * w * Math.cos(ang);
              im -= data[f + n] * w * Math.sin(ang);
            }
            const mag = re * re + im * im;
            num += ((k * SR) / N) * mag;
            den += mag;
          }
        }
        out.push({ name, durationS, envelope, centroidHz: den > 0 ? num / den : 0 });
      }
      return out;
    });

    expect(features.map((f) => f.name).sort()).toEqual(['explosion', 'fire', 'gameOver', 'hit', 'levelClear', 'pickup']);
    for (const f of features) expect(f.durationS).toBeGreaterThan(0.05);

    const pairs: string[] = [];
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const a = features[i];
        const b = features[j];
        const durRatio = Math.max(a.durationS, b.durationS) / Math.min(a.durationS, b.durationS);
        const envDist = Math.sqrt(a.envelope.reduce((s, v, k) => s + (v - b.envelope[k]) ** 2, 0) / 16);
        const centroidRatio = Math.max(a.centroidHz, b.centroidHz) / Math.max(1, Math.min(a.centroidHz, b.centroidHz));
        const distinct = durRatio >= 1.3 || envDist >= 0.15 || centroidRatio >= 1.3;
        if (!distinct) pairs.push(`${a.name}~${b.name} dur×${durRatio.toFixed(2)} env ${envDist.toFixed(3)} centroid×${centroidRatio.toFixed(2)}`);
      }
    }
    expect(pairs, 'pairs that sound alike').toEqual([]);
  });
});
