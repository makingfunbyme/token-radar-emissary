import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' } } });
const input = values.input ?? '/input/snapshot.json';
const output = resolve(values.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const project = import.meta.dirname;
const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.board, snapshot);
if (issue) throw new Error(issue);

mkdirSync(output, { recursive: true });
for (const name of ['dashboard', 'screenshots']) {
  const source = join(project, name);
  const destination = join(output, name);
  mkdirSync(destination, { recursive: true });
  if (source !== destination && existsSync(source)) cpSync(source, destination, { recursive: true });
}
writeFileSync(join(output, 'board.json'), JSON.stringify({ rows: radar.board }, null, 2) + '\n');
writeFileSync(join(output, 'data.js'), dataScript(radar));

const dossier = join(output, 'dossier.json');
const hasScreenshots = readdirSync(join(output, 'screenshots')).length > 0;
if (hasScreenshots) {
  writeFileSync(dossier, buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  }));
} else {
  rmSync(dossier, { force: true });
}
const { counts } = radar.meta;
console.log(`EMISSARY · ${counts.ranked} ranked / ${counts.eligible} eligible · ${counts.excluded} excluded · ${counts.covered}/${counts.watchlist} watchlist · ${counts.live} live · ${hasScreenshots ? 'dossier written' : 'dossier pending screenshots'}`);
