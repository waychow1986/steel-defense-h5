import '../../../src/styles/main.css';
import appHtml from '../../../index.html?raw';
import { boot } from '../../../src/app/boot';
import { parseSeed } from '../../../src/game/rng';

const params = new URLSearchParams(window.location.search);
const parsed = new DOMParser().parseFromString(appHtml, 'text/html');
const app = parsed.getElementById('app');
if (!app) throw new Error('index.html has no #app');
document.body.prepend(document.importNode(app, true));
boot(document.body, {
  seed: parseSeed(params.get('seed')) ?? 1,
  startLevel: Number(params.get('startLevel') ?? '1') || 1,
});
