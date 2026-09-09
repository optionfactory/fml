/**
 * The theme builder of the kitchen sink: every --ful-* declaration read off
 * the page's stylesheets, editable live in a drawer. Edits persist in
 * localStorage and "copy overrides" hands back the css to paste into a
 * stylesheet. Loaded before the page's configure(), so the drawer projects
 * what it builds; no server involved, file:// included.
 */
(() => {
    const root = document.documentElement;
    const host = document.getElementById('theme-vars');
    const custom = document.getElementById('theme-custom');
    if (!host) {
        return;
    }

    const declarations = new Map();
    const computed = getComputedStyle(root);
    for (const prop of computed) {
        if (prop.startsWith('--ful-')) {
            declarations.set(prop, computed.getPropertyValue(prop).trim());
        }
    }

    const toHex = (value) => {
        const rgb = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        if (rgb) {
            return `#${rgb
                .slice(1)
                .map((n) => Number(n).toString(16).padStart(2, '0'))
                .join('')}`;
        }
        return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
    };

    const rows = [];
    for (const [name, declared] of [...declarations].sort(([a], [b]) => a.localeCompare(b))) {
        const row = document.createElement('div');
        row.className = 'theme-var';
        const label = document.createElement('label');
        label.htmlFor = `theme-var-${name}`;
        label.textContent = name;
        label.title = `${name}: ${declared}`;
        row.append(label);
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `theme-var-${name}`;
        input.value = declared;
        input.spellcheck = false;
        input.addEventListener('input', () => apply());
        const swatchHex = toHex(declared);
        if (swatchHex) {
            const swatch = document.createElement('input');
            swatch.type = 'color';
            swatch.value = swatchHex;
            swatch.addEventListener('input', () => {
                input.value = swatch.value;
                apply();
            });
            row.append(swatch, input);
        } else {
            row.append(input);
        }
        host.append(row);
        rows.push({ name, declared, input, row });
    }
    if (rows.length === 0) {
        host.textContent = 'no --ful-* declarations found in the page stylesheets.';
        return;
    }

    const overrides = () =>
        rows.filter((r) => r.input.value.trim() !== r.declared).map((r) => [r.name, r.input.value.trim()]);

    const css = () => {
        const vars = overrides();
        const head = vars.length ? `:root {\n${vars.map(([n, v]) => `    ${n}: ${v};`).join('\n')}\n}\n` : '';
        return head + (custom?.value.trim() ?? '');
    };

    const style = document.createElement('style');
    root.append(style);

    const KEY = 'ful-theme-builder';
    const apply = () => {
        style.textContent = css();
        for (const r of rows) {
            r.row.classList.toggle('changed', r.input.value.trim() !== r.declared);
        }
        try {
            localStorage.setItem(
                KEY,
                JSON.stringify({ vars: Object.fromEntries(overrides()), custom: custom?.value ?? '' }),
            );
        } catch {
            return;
        }
    };

    custom?.addEventListener('input', () => apply());
    document.getElementById('theme-reset')?.addEventListener('click', () => {
        for (const r of rows) {
            r.input.value = r.declared;
        }
        if (custom) {
            custom.value = '';
        }
        apply();
    });
    document.getElementById('theme-copy')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(css()).catch(() => undefined);
    });

    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        for (const [name, value] of Object.entries(saved.vars ?? {})) {
            const found = rows.find((r) => r.name === name);
            if (found) {
                found.input.value = value;
            }
        }
        if (custom) {
            custom.value = saved.custom ?? '';
        }
    } catch {
        return;
    }
    apply();
})();
