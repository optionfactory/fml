/**
 * Runs the wiki's ful examples against dist and reports what still holds.
 *
 * The snippets in manifest/wiki-examples.html are transcribed from pages 10-17
 * of the wiki: they go stale when those pages change, so edit them together.
 * It has caught four wrong examples so far, which is why it is kept.
 *
 * Usage:
 *   npm run build && node manifest/wiki-examples.mjs
 */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE-ERR', m.text()));
await p.goto(`file://${join(root, 'manifest', 'wiki-examples.html')}`);
await p.waitForFunction(() => document.getElementById('out').textContent.includes('[done]'), null, { timeout: 60000 });
const report = await p.textContent('#out');
console.log(report);
await b.close();
const failed = report.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('THREW'));
console.log(failed.length === 0 ? 'every wiki example holds' : `${failed.length} wiki examples are wrong`);
process.exit(failed.length === 0 ? 0 : 1);
