import './styles/main.css';
import { boot } from './app/boot';
import { parseSeed } from './game/rng';

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

const seed = parseSeed(new URLSearchParams(window.location.search).get('seed')) ?? randomSeed();
boot(document.body, { seed });
