// "Codec" is for "co[der-]dec[oder]".

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_=';

export const encodeInteger = (z) => {
    let result = '';
    if (z < 0) {
        result += '-';
        z = -z;
    }
    while (z) {
        const digit = z & 63;
        result += CHARS[digit];
        z -= digit;
        z /= 64;
    }
    return result;
};

export const encodeManyIntegers = (zs) => zs.map(encodeInteger).join(',');

export const decodeInteger = (s) => {
    let i = 0;
    let negative = false;
    if (i < s.length && s[i] === '-') {
        negative = true;
        ++i;
    }
    let z = 0;
    for (let shift = 1; i < s.length; ++i, shift *= 64) {
        const digit = CHARS.indexOf(s[i]);
        if (digit === -1)
            return NaN;
        z += digit * shift;
    }
    return negative ? -z : z;
};

export const decodeManyIntegrs = (s) => s.split(',').map(decodeInteger);
