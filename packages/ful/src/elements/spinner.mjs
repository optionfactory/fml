import { ParsedElement } from "@optionfactory/ftl"

class Spinner extends ParsedElement {
    static slots = true;
    static template = `
        <div class="ful-spinner-wrapper" role="status">
            <div class="ful-spinner-text">{{{{ slots.default }}}}</div>
            <div class="ful-spinner-icon"></div>
        </div>
    `;
    render({ slots }) {
        this.template().withOverlay({ slots }).renderTo(this);
    }
}

export { Spinner };