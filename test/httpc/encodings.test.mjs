import { expect } from 'chai';
import { Base64, Hex } from '../../src/httpc/encodings.mjs';

describe('Encodings', () => {
    describe('Base64', () => {
        it('encodes and decodes an ArrayBuffer using the STANDARD dialect', () => {
            const text = 'Hello FML';
            const buffer = new TextEncoder().encode(text).buffer;
            const encoded = Base64.encode(buffer, Base64.STANDARD);
            expect(encoded, 'the STANDARD dialect encodes to the RFC 4648 alphabet without padding').to.equal(
                'SGVsbG8gRk1M',
            );
            const decodedBuffer = Base64.decode(encoded, Base64.STANDARD);
            const decodedText = new TextDecoder().decode(decodedBuffer);
            expect(decodedText, 'decoding the encoding gives back the original bytes').to.equal(text);
        });

        it('round trips every payload length, writing exactly as many bytes as encoded', () => {
            for (let length = 0; length !== 12; ++length) {
                const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37) % 256));
                for (const dialect of [undefined, Base64.STANDARD]) {
                    const encoded = Base64.encode(bytes.buffer, dialect);
                    const decoded = new Uint8Array(Base64.decode(encoded, dialect));
                    expect(
                        decoded.length,
                        `decoding yields exactly as many bytes as were encoded, at length ${length}`,
                    ).to.equal(length);
                    expect(
                        Array.from(decoded),
                        `decoding gives back the encoded bytes, at length ${length}`,
                    ).to.deep.equal(Array.from(bytes));
                }
            }
        });

        it('round trips a payload whose length needs padding', () => {
            const buffer = new TextEncoder().encode('foob').buffer;
            const encoded = Base64.encode(buffer, Base64.URL_SAFE);

            expect(encoded, 'the URL_SAFE encoding of a length that is not a multiple of three is a string').to.be.a(
                'string',
            );
            const decodedBuffer = Base64.decode(encoded, Base64.URL_SAFE);
            expect(
                new TextDecoder().decode(decodedBuffer),
                'a length that needs padding decodes back even though the encoder emits none',
            ).to.equal('foob');
        });

        it('decodes payloads that carry the standard padding, which this encoder never emits', () => {
            expect(
                Array.from(new Uint8Array(Base64.decode('QQ==', Base64.STANDARD))),
                'two padding characters leave one byte',
            ).to.deep.equal([65]);
            expect(
                Array.from(new Uint8Array(Base64.decode('QUI=', Base64.STANDARD))),
                'one padding character leaves two bytes',
            ).to.deep.equal([65, 66]);
            expect(
                Array.from(new Uint8Array(Base64.decode('QUJD', Base64.STANDARD))),
                'a full quartet with no padding decodes to three bytes',
            ).to.deep.equal([65, 66, 67]);
        });

        it('decodes every padded atob output back to its source bytes', () => {
            for (let length = 0; length !== 16; ++length) {
                const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 61 + 7) % 256));
                const padded = btoa(String.fromCharCode(...bytes));

                const decoded = new Uint8Array(Base64.decode(padded, Base64.STANDARD));

                expect(
                    decoded.length,
                    `a padded atob output decodes to as many bytes as its source, at length ${length}`,
                ).to.equal(length);
                expect(
                    Array.from(decoded),
                    `a padded atob output decodes back to its source bytes, at length ${length}`,
                ).to.deep.equal(Array.from(bytes));
            }
        });

        it('rejects invalid input instead of corrupting silently', () => {
            expect(
                () => Base64.decode('SGVsbG8+', Base64.URL_SAFE),
                'a + is outside the URL_SAFE alphabet and is rejected',
            ).to.throw('invalid character');
            expect(
                () => Base64.decode('SGVs bG8', Base64.STANDARD),
                'a space is outside the alphabet and is rejected rather than skipped',
            ).to.throw('invalid character');
            expect(() => Base64.decode('====', Base64.STANDARD), 'padding alone with no data is rejected').to.throw(
                'invalid padding',
            );
            expect(
                () => Base64.decode('=', Base64.STANDARD),
                'a single padding character with no data is rejected',
            ).to.throw('invalid padding');
            expect(
                () => Base64.decode('==', Base64.STANDARD),
                'two padding characters with no data are rejected',
            ).to.throw('invalid padding');
            expect(() => Base64.decode('QU=JD', Base64.STANDARD), 'padding anywhere but the tail is rejected').to.throw(
                'invalid padding',
            );
            expect(
                () => Base64.decode('QUJDQ', Base64.STANDARD),
                'a length that leaves one character over cannot be decoded and is rejected',
            ).to.throw('invalid length');
            expect(() => Hex.decode('zz'), 'Hex rejects a character that is not a hex digit').to.throw(
                'invalid character',
            );
            expect(() => Hex.decode('0x'), 'Hex rejects a 0x prefix, which is not a hex digit pair').to.throw(
                'invalid character',
            );
        });
    });

    describe('Hex', () => {
        it('encodes and decodes hexadecimal strings', () => {
            const bytes = new Uint8Array([255, 0, 170]);
            const encoded = Hex.encode(bytes, true);
            expect(encoded, 'encode with upper set writes uppercase digits').to.equal('FF00AA');
            const decoded = Hex.decode(encoded);
            expect(decoded, 'decoding the encoding gives back the original bytes').to.deep.equal(bytes);
        });

        it('throws a specific error for uneven/invalid hex lengths', () => {
            expect(
                () => Hex.decode('FFF'),
                'an odd number of hex digits cannot form whole bytes and is rejected',
            ).to.throw('invalid length');
        });

        it('pads single digit bytes', () => {
            expect(
                Hex.encode(new Uint8Array([0, 5, 15, 16])),
                'each byte is written as two lowercase digits, a single digit padded with a zero',
            ).to.equal('00050f10');
            expect(
                Hex.encode(new Uint8Array([0, 5, 15, 16]), true),
                'the padding also holds with uppercase digits',
            ).to.equal('00050F10');
        });
    });
});
