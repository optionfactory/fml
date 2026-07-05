import "./mock-dom.mjs"
import { strict as assert } from 'node:assert';
import { it, describe } from 'node:test'; 
import { Fragments } from "@optionfactory/ftl"
import { Bindings } from "../src/elements/bindings.mjs";

describe('Bindings.flatten', () => {
    it('can flatten an empty object', () => {
        const got = Bindings.flatten({}, '', new Set());
        assert.deepEqual(got, {});
    });    
    it('can flatten a flat object', () => {
        const got = Bindings.flatten({a: 1, b: 2}, '', new Set());
        assert.deepEqual(got, {a: 1, b: 2});
    });    
    it('can flatten a nested object', () => {
        const got = Bindings.flatten({a: 1, b: {c: 2}}, '', new Set());
        assert.deepEqual(got, {a: 1, "b.c": 2});
    });    
    it('can flatten an array', () => {
        const got = Bindings.flatten({a: [1, 2]}, '', new Set());
        assert.deepEqual(got, {"a.0": 1, "a.1": 2});
    });    
    it('objects are not flattened over stops', () => {
        const got = Bindings.flatten({a: {b: {c: 1}}}, '', new Set(["a.b"]));
        assert.deepEqual(got, {"a.b": {c: 1}});
    });    

});


describe('Bindings', () => {
    
    it('can extract value from an input text', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="text" name="a" value="1">
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: "1"});
    });
    it('can extract value from a select', () => {
        const el = Fragments.fromHtml(`
            <form>
                <select name="a">
                    <option value="nope">NO</option>
                    <option value="1" selected>YES</option>
                </select>
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: "1"});
    });
    it('can extract value from an unchecked checkbox', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a">
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: false});
    });
    it('can extract value from an checked checkbox', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a" checked>
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: true});
    });
    it('can extract value from an checked radio button', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2" checked="checked">
                <input type="radio" name="a" value="3">
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: "2"});
    });
    it('can extract deeply nested values', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.b.c" checked>
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: {b: {c: true}}});
    });
    it('can extract all values from a container', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.a" checked>
                <input type="checkbox" name="a.b" checked>
                <input type="text" name="a.c" value="lorem ipsum">
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {a: {a: true, b: true, c: "lorem ipsum"}});
    });
    it('tags with disabled are ignored', () => {
        const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.a" checked disabled>
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {});
    });
    it('tags children of a disabled fieldset are ignored', () => {
        const el = Fragments.fromHtml(`
            <form>
                <fieldset disabled>
                    <input type="checkbox" name="a.a" checked>
                </fieldset>
            </form>
        `);
        const got = Bindings.extractFrom(el.querySelector('form'));
        assert.deepEqual(got, {});
    });
});