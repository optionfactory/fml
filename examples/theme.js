/**
 * The scheme toggle every example page shares: it pins color-scheme on the
 * root, starting from the os preference, and flips it on click. The library's
 * palette follows the page's color-scheme alone, so this is all a dark mode
 * ever costs.
 */
(() => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    const apply = (dark) => {
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        //the label names where the click goes
        button.textContent = dark ? 'light' : 'dark';
        button.setAttribute('aria-pressed', String(dark));
    };
    apply(matchMedia('(prefers-color-scheme: dark)').matches);
    button.addEventListener('click', () => apply(document.documentElement.style.colorScheme !== 'dark'));
    //the script may load from the head, before the body exists
    if (document.body) {
        document.body.prepend(button);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.body.prepend(button));
    }
})();
