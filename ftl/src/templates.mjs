import { registry } from "./registry.mjs";
import { Template } from "./template.mjs";


class Templates {
    static fromHtml(html) {
        const { modules, data } = registry.context()
        return Template.fromHtml(html, modules, ...data);
    }
    static fromSelector(selector) {
        const { modules, data } = registry.context()
        return Template.fromSelector(selector, modules, ...data);
    }
    static fromTemplate(templateEl) {
        const { modules, data } = registry.context()
        return Template.fromTemplate(templateEl, modules, ...data);
    }
    static fromFragment(fragment) {
        const { modules, data } = registry.context()
        return Template.fromFragment(fragment, modules, ...data);
    }
}

export { Templates }