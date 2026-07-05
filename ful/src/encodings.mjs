

class Base64 {
    static encode(arrayBuffer, dialect) {
        const d = dialect || Base64.URL_SAFE;
        const len = arrayBuffer.byteLength;
        const view = new Uint8Array(arrayBuffer);
        let res = '';
        for (let i = 0; i < len; i += 3) {
            const v1 = d[view[i] >> 2];
            const v2 = d[((view[i] & 3) << 4) | (view[i + 1] >> 4)];
            const v3 = d[((view[i + 1] & 15) << 2) | (view[i + 2] >> 6)];
            const v4 = d[view[i + 2] & 63];
            res += v1 + v2 + v3 + v4;
        }
        if (len % 3 === 2) {
            res = res.substring(0, res.length - 1);
        } else if (len % 3 === 1) {
            res = res.substring(0, res.length - 2);
        }
        return res;
    }
    static decode(str, dialect) {
        const d = dialect || Base64.URL_SAFE;
        let nbytes = Math.floor(str.length * 0.75);
        for (let i = 0; i !== str.length; ++i) {
            if (str[str.length - i - 1] !== '=') {
                break;
            }
            --nbytes;
        }
        const view = new Uint8Array(nbytes);

        let vi = 0;
        let si = 0;
        while (vi < str.length * 0.75) {
            const v1 = d.indexOf(str.charAt(si++));
            const v2 = d.indexOf(str.charAt(si++));
            const v3 = d.indexOf(str.charAt(si++));
            const v4 = d.indexOf(str.charAt(si++));
            view[vi++] = (v1 << 2) | (v2 >> 4);
            view[vi++] = ((v2 & 15) << 4) | (v3 >> 2);
            view[vi++] = ((v3 & 3) << 6) | v4;
        }

        return view.buffer;
    }
}

Base64.STANDARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
Base64.URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';


class Hex {
    static decode(hex) {
        if (hex.length % 2 !== 0) {
            throw new Error("invalid length");
        }
        const lenInBytes = hex.length / 2;
        return new Uint8Array(lenInBytes).map((e, i) => {
            const offset = i * 2;
            const octet = hex.substring(offset, offset + 2);
            return parseInt(octet, 16);
        });
    }
    static encode(bytes, upper) {
        return Array.from(bytes)
            .map(b => b.toString(16))
            .map(b => upper ? b.toUpperCase() : b)
            .map(o => o.padStart(2, 0))
            .join('');
    }
}

export { Base64, Hex };