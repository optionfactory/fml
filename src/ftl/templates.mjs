import { registry } from './registry.mjs';
import { Template } from './template.mjs';

/** The Template factories bound to the page's own registry: the same four sources, with its modules and data already applied. */
class Templates {
    /**
     * @param {string} html
     * @returns {Template}
     */
    static fromHtml(html) {
        return Template.fromHtml(html).withEvaluator(registry.evaluator());
    }
    /**
     * @param {string} selector for an HTMLTemplateElement
     * @returns {Template}
     */
    static fromSelector(selector) {
        return Template.fromSelector(selector).withEvaluator(registry.evaluator());
    }
    /**
     * @param {HTMLTemplateElement} templateEl consumed: its content is adopted
     * @returns {Template}
     */
    static fromTemplate(templateEl) {
        return Template.fromTemplate(templateEl).withEvaluator(registry.evaluator());
    }
    /**
     * @param {DocumentFragment} fragment
     * @returns {Template}
     */
    static fromFragment(fragment) {
        return Template.fromFragment(fragment).withEvaluator(registry.evaluator());
    }
}

export { Templates };
