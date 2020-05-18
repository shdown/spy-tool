export const monotonicNowMillis = () => window.performance.now();
export const sleepMillis = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const divCeil = (a, b) => Math.ceil(a / b);
export const clearArray = (array) => {
    array.splice(0, array.length);
};
export const isSubset = (a, b) => {
    const unionSet = new Set([...a, ...b]);
    const bSet = new Set(b);
    return unionSet.size === bSet.size;
};
export const unduplicate = (array) => [...new Set(array)];

const htmlEntityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
};
export const htmlEscape = (s) => {
    return String(s).replace(/[&<>"'`=/]/g, c => htmlEntityMap[c]);
};

export const fromHtml = (html) => {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html;
    return tmpl.content.firstElementChild;
};

export const parseSearchString = (search) => {
    const segments = search.slice(search.indexOf('?') + 1).split('&');
    const result = {};
    for (const segment of segments) {
        const [key, value] = segment.split('=', /*limit=*/2);
        if (value === undefined)
            continue;
        result[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    return result;
};

export const createAnchor = (link) => {
    const a = document.createElement('a');
    a.setAttribute('href', link);
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('target', '_blank');
    a.append(link);
    return a;
};
