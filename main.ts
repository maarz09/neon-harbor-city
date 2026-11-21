// Neon Harbor's hand-in program (Node 22, standard library only). The game itself lives in
// game/: static files that desktop Chrome opens with no build step and no network request
// (index.html, an import map pointing "three" at the vendored minified three.js build, and the
// game's own ES modules under game/src/). This program copies game/ and the four screenshots in
// screenshots/ (the first by name is the cover) into the output directory, then writes the
// dossier.json summary the judge reads, using the kit's unchanged vendor/makefun-game.ts.
//
// Play locally: `node serve.ts`, then open http://localhost:8080.
// Build locally: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` (the grader uses /output).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output'; // the grader's directory unless overridden

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The limits below mirror the scorer's: the dossier's source text is cut at 160 KiB, and the build fails early
// (rather than at the gate) on more than 4 screenshots or one over 256 KiB, on more than 993 entries or 48 MiB
// under game/, or on a game path longer than 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
