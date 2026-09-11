import { registry } from './registry.mjs';
import { Template } from './template.mjs';

/** The Template factories, each bound to the page registry's scope. */
class Templates {
    static fromHtml(html) {
        return Template.fromHtml(html).withEvaluator(registry.evaluator());
    }
    static fromSelector(selector) {
        return Template.fromSelector(selector).withEvaluator(registry.evaluator());
    }
    static fromTemplate(templateEl) {
        return Template.fromTemplate(templateEl).withEvaluator(registry.evaluator());
    }
    static fromFragment(fragment) {
        return Template.fromFragment(fragment).withEvaluator(registry.evaluator());
    }
}

export { Templates };
