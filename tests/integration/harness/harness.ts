import '../../../src/styles/main.css';
import appHtml from '../../../index.html?raw';
import { boot } from '../../../src/app/boot';
import { CONFIG } from '../../../src/game/config';
import { levelDef } from '../../../src/game/levels';
import { parseSeed } from '../../../src/game/rng';
import type { EnemyType } from '../../../src/game/types';

const params = new URLSearchParams(window.location.search);
const parsed = new DOMParser().parseFromString(appHtml, 'text/html');
const app = parsed.getElementById('app');
if (!app) throw new Error('index.html has no #app');
document.body.prepend(document.importNode(app, true));
boot(document.body, {
  seed: parseSeed(params.get('seed')) ?? 1,
  startLevel: Number(params.get('startLevel') ?? '1') || 1,
  onTestAccess: ({ world }) => {
    // Test-page-only shortcut: destroys every enemy of the current level (on the field and still to come)
    // with normal scoring, so the next simulation step detects the clear.
    (window as unknown as { harness: unknown }).harness = {
      destroyAllEnemies(): void {
        const s = world();
        if (!s) throw new Error('no game in progress');
        const def = levelDef(s.level);
        const pending = [...s.enemies.map((e) => e.type as EnemyType), ...def.order.slice(s.enemiesSpawned)];
        s.score += pending.reduce((sum, t) => sum + CONFIG.enemyScore[t], 0);
        s.enemies = [];
        s.enemiesSpawned = def.order.length;
        s.enemiesRemaining = 0;
      },
    };
  },
});
