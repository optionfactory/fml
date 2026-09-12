/**
 * Captures the wiki's screenshots of the disclosure and navigation family from
 * manifest/wiki-screenshots.html, rendered against dist.
 *
 * Usage:
 *   npm run build && node manifest/wiki-screenshots.mjs [../fml.wiki/images]
 */
import { chromium } from 'playwright';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = root;
const out = resolve(process.argv[2] ?? join(root, '..', 'fml.wiki', 'images'));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto(`file://${join(base, 'manifest', 'wiki-screenshots.html')}`);
await p.waitForFunction(() => document.querySelector('ful-wizard')?.rendered === true);
await p.waitForTimeout(400);

const shot = async (sel, file, clip) => {
    const el = await p.$(sel);
    await (clip ? p.screenshot({ path: `${out}/${file}`, clip }) : el.screenshot({ path: `${out}/${file}` }));
    console.log('wrote', file);
};

// tooltip: open the popover
await p.click('#shot-tooltip ful-tooltip button');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/tooltip.png`, clip: { x: 24, y: 24, width: 620, height: 150 } });
console.log('wrote tooltip.png');
await p.keyboard.press('Escape');
await p.waitForTimeout(200);

// dialog and drawer are modal: clear the page behind them so the shot is the overlay
const only = (id) => p.evaluate((keep) => {
    for (const s of document.querySelectorAll('.shot')) {
        s.hidden = s.id !== keep;
    }
}, id);

await only('shot-dialog');
await p.evaluate(() => { document.querySelector('#dlg').open(); });
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/dialog.png`, clip: { x: 130, y: 250, width: 640, height: 260 } });
console.log('wrote dialog.png');
await p.evaluate(() => document.querySelector('#dlg').querySelector('[data-result=cancelled]').click());
await p.waitForTimeout(300);

await only('shot-drawer');
await p.evaluate(() => { document.querySelector('#drw').open(); });
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/drawer.png`, clip: { x: 250, y: 0, width: 650, height: 460 } });
console.log('wrote drawer.png');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.evaluate(() => { for (const s of document.querySelectorAll('.shot')) s.hidden = false; });
await p.waitForTimeout(200);

// toasts
await p.evaluate(() => {
    const t = document.querySelector('#tst');
    t.show('Ledger published.', { severity: 'success' });
    t.show('Two entries were rounded.', { severity: 'warning' });
    t.show('The export endpoint is unreachable.', { severity: 'error' });
});
await p.waitForTimeout(500);
await shot('#tst', 'toasts.png');

// the files field with an authored item template
await p.evaluate(() => {
    const dt = new DataTransfer();
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8DwnwEJMKIL0F8BABKcA/9tPCWyAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
    dt.items.add(new File([png], 'receipt.png', { type: 'image/png' }));
    dt.items.add(new File(['terms'], 'terms.pdf', { type: 'application/pdf' }));
    document.querySelector('#shot-files ful-input-file').files = dt.files;
});
await p.waitForTimeout(300);
await shot('#shot-files', 'files-items.png');

await shot('#shot-tabs', 'tabs.png');
await shot('#shot-accordion', 'accordion.png');
await shot('#shot-wizard', 'wizard.png');

await b.close();
