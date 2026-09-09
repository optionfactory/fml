/**
 * Shows the authored markup of each demo card under the card itself. Loaded
 * synchronously after the last card and before the page's configure(): the
 * cards are still un-upgraded, so their innerHTML is exactly the authored
 * source. No fetch involved, file:// included. A card opts out through
 * data-nocode.
 */
const dedent = (html) => {
    const lines = html.split('\n');
    while (lines.length && !lines.at(0).trim()) {
        lines.shift();
    }
    while (lines.length && !lines.at(-1).trim()) {
        lines.pop();
    }
    const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length);
    const indent = indents.length ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(indent)).join('\n');
};

for (const card of document.querySelectorAll('body > fieldset')) {
    if (card.hasAttribute('data-nocode')) {
        continue;
    }
    const pristine = new DOMParser().parseFromString(`<body>${card.innerHTML}</body>`, 'text/html');
    pristine.querySelector('body > legend')?.remove();
    const source = dedent(pristine.body.innerHTML);
    if (!source) {
        continue;
    }
    const details = document.createElement('details');
    details.className = 'markup';
    const summary = document.createElement('summary');
    summary.textContent = 'the markup';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = source;
    pre.append(code);
    details.append(summary, pre);
    card.append(details);
}
