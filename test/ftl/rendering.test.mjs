import { expect } from '@esm-bundle/chai';
import { registry as singletonRegistry } from '../../src/ftl/registry.mjs';
import { Rendering } from '../../src/ftl/rendering.mjs';

describe('Rendering', () => {
    it('distinguishes properly between waitFor and waitForChildren', async () => {
        // Rendering relies on the singleton registry instance
        class RenderEl extends HTMLElement {
            upgrade() { 
                return new Promise(resolve => setTimeout(resolve, 20)); 
            }
        }
        
        if (!customElements.get('render-el')) {
            singletonRegistry.defineElement('render-el', RenderEl);
            singletonRegistry.configure();
        }

        const parent = document.createElement('render-el');
        const child = document.createElement('render-el');
        parent.appendChild(child);
        document.body.appendChild(parent);

        // Queue ONLY the parent element for upgrade
        RenderEl.BITS.enqueue(parent);

        // waitForChildren should NOT wait because the parent is NOT a child of itself
        let childrenDone = false;
        Rendering.waitForChildren(parent).then(() => childrenDone = true);
        
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(childrenDone).to.be.true; 

        // waitFor SHOULD wait because it includes the element itself
        let allDone = false;
        Rendering.waitFor(parent).then(() => allDone = true);

        await new Promise(resolve => setTimeout(resolve, 5));
        expect(allDone).to.be.false; // Still locked by the 20ms timer

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(allDone).to.be.true;

        parent.remove();
    });
});