import { expect } from '@esm-bundle/chai';
import { Base64, Hex } from '../../src/httpc/encodings.mjs';

describe('Encodings', () => {
    describe('Base64', () => {
        it('encodes and decodes an ArrayBuffer using the STANDARD dialect', () => {
            const text = 'Hello FML';
            const buffer = new TextEncoder().encode(text).buffer;
            const encoded = Base64.encode(buffer, Base64.STANDARD);
            expect(encoded).to.equal('SGVsbG8gRk1M'); 
            const decodedBuffer = Base64.decode(encoded, Base64.STANDARD);
            const decodedText = new TextDecoder().decode(decodedBuffer);
            expect(decodedText).to.equal(text);
        });

        it('handles padding correctly for URL_SAFE payloads', () => {
            const buffer = new TextEncoder().encode('foob').buffer;
            const encoded = Base64.encode(buffer, Base64.URL_SAFE);
            
            expect(encoded).to.be.a('string');
            const decodedBuffer = Base64.decode(encoded, Base64.URL_SAFE);
            expect(new TextDecoder().decode(decodedBuffer)).to.equal('foob');
        });
    });

    describe('Hex', () => {
        it('encodes and decodes hexadecimal strings', () => {
            const bytes = new Uint8Array([255, 0, 170]);
            const encoded = Hex.encode(bytes, true);
            expect(encoded).to.equal('FF00AA');
            const decoded = Hex.decode(encoded);
            expect(decoded).to.deep.equal(bytes);
        });

        it('throws a specific error for uneven/invalid hex lengths', () => {
            expect(() => Hex.decode('FFF')).to.throw('invalid length');
        });
    });
});