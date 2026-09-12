/**
 * Writes the wiki's element reference from the IDE manifest.
 *
 * The manifest is derived from the declarations the runtime itself reads, and
 * test/manifest/metadata.test.mjs fails whenever the prose and the code
 * disagree, so the reference page cannot drift from the elements: regenerate it
 * rather than editing it by hand.
 *
 *   node manifest/wiki-reference.mjs ../fml.wiki/21-Element-reference.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, '..', 'fml.wiki', '21-Element-reference.md');
const manifest = JSON.parse(readFileSync(join(root, 'dist/custom-elements.json'), 'utf8'));

const elements = manifest.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName)
    .sort((a, b) => a.tagName.localeCompare(b.tagName));

//the families the wiki is organised by, so the reference reads in the same order
const FAMILIES = [
    ['Forms', ['ful-form']],
    ['Fields', ['ful-input', 'ful-checkbox', 'ful-radio-group', 'ful-select', 'ful-dropdown', 'ful-input-file']],
    ['Temporal', ['ful-input-local-date', 'ful-input-local-time', 'ful-input-instant', 'ful-local-date', 'ful-instant']],
    ['Tables', ['ful-table', 'ful-pagination', 'ful-sorter']],
    [
        'Filters',
        ['ful-filter-text', 'ful-filter-number', 'ful-filter-boolean', 'ful-filter-local-date', 'ful-filter-instant'],
    ],
    ['Disclosures', ['ful-tooltip', 'ful-dialog', 'ful-drawer', 'ful-toasts']],
    ['Navigation', ['ful-tabs', 'ful-accordion', 'ful-wizard']],
];

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const anchor = (tag) => tag.replace(/[^a-z0-9]+/g, '-');

const table = (title, rows, columns) => {
    if (!rows.length) {
        return '';
    }
    const head = `| ${columns.map((c) => c[0]).join(' | ')} |\n|${columns.map(() => '---').join('|')}|\n`;
    const body = rows.map((r) => `| ${columns.map((c) => cell(c[1](r))).join(' | ')} |`).join('\n');
    return `**${title}**\n\n${head}${body}\n\n`;
};

const section = (el) => {
    const parts = [`### \`<${el.tagName}>\`\n`];
    if (el.description) {
        parts.push(`${el.description}\n\n`);
    }
    parts.push(
        table(
            'Attributes',
            el.attributes ?? [],
            [
                ['attribute', (a) => `\`${a.name}\``],
                ['type', (a) => (a.type?.text ? `\`${a.type.text}\`` : '')],
                ['meaning', (a) => a.description],
            ],
        ),
    );
    parts.push(
        table(
            'Slots',
            el.slots ?? [],
            [
                ['slot', (s) => (s.name ? `\`${s.name}\`` : '*(default)*')],
                ['content', (s) => s.description],
            ],
        ),
    );
    parts.push(
        table(
            'Events',
            el.events ?? [],
            [
                ['event', (e) => `\`${e.name}\``],
                ['detail', (e) => e.description],
            ],
        ),
    );
    return parts.join('');
};

const seen = new Set();
const body = FAMILIES.map(([family, tags]) => {
    const chosen = tags.map((t) => elements.find((e) => e.tagName === t)).filter(Boolean);
    for (const e of chosen) {
        seen.add(e.tagName);
    }
    return `## ${family}\n\n${chosen.map(section).join('')}`;
}).join('');
const rest = elements.filter((e) => !seen.has(e.tagName));
const other = rest.length ? `## Other\n\n${rest.map(section).join('')}` : '';

const index = FAMILIES.map(
    ([family, tags]) =>
        `- **${family}** — ${tags
            .filter((t) => elements.some((e) => e.tagName === t))
            .map((t) => `[\`${t}\`](#${anchor(t)})`)
            .join(', ')}`,
).join('\n');

writeFileSync(
    out,
    `# Element reference

Every element ful registers, with its attributes, slots and events.

> This page is generated from \`dist/custom-elements.json\` by \`manifest/wiki-reference.mjs\`.
> The manifest is read from the same declarations the runtime uses and a test fails whenever
> the two disagree, so edit the element or its metadata rather than this page.

${index}

The same data ships to editors as \`dist/custom-elements.json\` (the community manifest),
\`dist/web-types.json\` (JetBrains) and \`dist/vscode.html-custom-data.json\` (VS Code), so an
IDE pointed at the package completes these attributes for you.

${body}${other}`,
);
console.log(`wrote ${out}: ${elements.length} elements`);
