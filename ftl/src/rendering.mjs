import { registry } from "./registry.mjs";

class Rendering {
    static async waitFor(el) {
        const pending = Array.from(registry.upgrades)
            .filter(([child, promise ]) => el.contains(child))
            .map(([child, promise ]) => promise);
        await Promise.all(pending);
    }
    static async waitForChildren(el) {
        const pending = Array.from(registry.upgrades)
            .filter(([child, promise]) => el !== child && el.contains(child))
            .map(([child, promise ]) => promise);
        await Promise.all(pending);
    }

}


export { Rendering }