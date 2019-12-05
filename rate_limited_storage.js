import { VkApiError } from './vk_api.js';
import { monotonicNowMillis } from './utils.js';
import { encodeInteger, decodeInteger } from './intcodec.js';

class HardwareRateLimitError extends Error {
    constructor() {
        super('storage API rate limit');
        this.name = 'HardwareRateLimitError';
    }
}

class Hardware {
    constructor(session) {
        this._session = session;
    }

    async readKeys() {
        return await this._session.apiRequest('storage.getKeys', {
            count: 1000,
            v: '5.103',
        });
    }

    async read(rawKey) {
        return await this._session.apiRequest('storage.get', {
            key: rawKey,
            v: '5.103',
        });
    }

    async readMany(rawKeys) {
        if (rawKeys.length === 0)
            return [];

        const rawKeyToIndex = {};
        for (let i = 0; i < rawKeys.length; ++i)
            rawKeyToIndex[rawKeys[i]] = i;

        const data = await this._session.apiRequest('storage.get', {
            keys: rawKeys.join(','),
            v: '5.103',
        });
        const result = Array(rawKeys.length);
        for (const datum of data)
            result[rawKeyToIndex[datum.key]] = datum.value;
        return result;
    }

    canWrite(value) {
        return value.length <= 1024;
    }

    async write(rawKey, value) {
        try {
            await this._session.apiRequest(
                'storage.set',
                {
                    key: rawKey,
                    value: value,
                    v: '5.103',
                },
                /*raw=*/false,
                /*forwardErrors=*/{9: true}
            );
        } catch (err) {
            if (!(err instanceof VkApiError))
                throw err;
            if (err.code !== 9)
                throw err;
            throw new HardwareRateLimitError();
        }
    }
}

class Cache {
    constructor(hardware) {
        this._data = [];
        this._hardware = hardware;
        this._rawKeysToData = {};
        this._keyToCurIndex = null;
        this._keyToLastIndex = null;
        this._timer = null;
    }

    async fetchKeysIfNeeded() {
        if (this._keyToCurIndex !== null && this._keyToLastIndex !== null && this._timer !== null)
            return;

        const rawKeys = await this._hardware.readKeys();
        const values = await this._hardware.readMany(rawKeys);

        this._keyToCurIndex = {};
        this._keyToLastIndex = {};
        this._timer = 0;

        const keyToMaxTimer = {};

        for (let i = 0; i < rawKeys.length; ++i) {
            const rawKey = rawKeys[i];
            const value = values[i];

            let m;
            if ((m = rawKey.match(/^([^0-9]+)([0-9]+)$/)) === null)
                continue;
            const key = m[1];
            const index = parseInt(m[2]);

            if ((m = value.match(/^([^;]*);.*$/)) === null)
                continue;
            const timer = decodeInteger(m[1]);

            const oldMaxTimer = keyToMaxTimer[key];
            if (oldMaxTimer === undefined || oldMaxTimer < timer) {
                this._keyToCurIndex[key] = index;
                keyToMaxTimer[key] = timer;
            }

            const oldLast = this._keyToLastIndex[key];
            if (oldLast === undefined || oldLast < index)
                this._keyToLastIndex[key] = index;

            if (this._timer < timer)
                this._timer = timer;
        }
    }

    tick() {
        return ++this._timer;
    }

    canWrite(value) {
        return this._hardware.canWrite(value);
    }

    getCurIndex(key) {
        return this._keyToCurIndex[key];
    }

    getLastIndex(key) {
        return this._keyToLastIndex[key];
    }

    async read(key, index) {
        const rawKey = `${key}${index}`;
        const datum = this._rawKeysToData[rawKey];
        if (datum !== undefined)
            return datum.value;
        return await this._hardware.read(rawKey);
    }

    async readMany(rawKeys) {
        const result = [];
        for (const rawKey of rawKeys) {
            const datum = this._rawKeysToData[rawKey];
            if (datum !== undefined)
                result.push(datum.value);
        }
        if (result.length === rawKeys.length)
            return result;
        return await this._hardware.readMany(rawKeys);
    }

    // Use for debugging only: does not catch rate limit errors and stuff.
    async unsafeClear() {
        const rawKeys = await this._hardware.readKeys();
        for (const rawKey of rawKeys)
            await this._hardware.write(rawKey, '');
    }

    write(key, index, value) {
        const rawKey = `${key}${index}`;
        const datum = this._rawKeysToData[rawKey];
        if (datum !== undefined) {
            datum.value = value;
        } else {
            const newDatum = {key: key, index: index, value: value};
            this._data.push(newDatum);
            this._rawKeysToData[rawKey] = newDatum;
        }

        this._keyToCurIndex[key] = index;
        const oldLast = this._keyToLastIndex[key];
        if (oldLast === undefined || oldLast < index)
            this._keyToLastIndex[key] = index;
    }

    async flush() {
        let i = 0;
        for (; i < this._data.length; ++i) {
            const datum = this._data[i];
            const rawKey = `${datum.key}${datum.index}`;
            try {
                await this._hardware.write(rawKey, datum.value);
            } catch (err) {
                if (!(err instanceof HardwareRateLimitError))
                    throw err;
                break;
            }
            delete this._rawKeysToData[rawKey];
        }
        this._data.splice(0, i);
        return i;
    }

    hasSomethingToFlush() {
        return this._data.length !== 0;
    }
}

export class RateLimitedStorage {
    constructor(perKeyLimits, session) {
        this._perKeyLimits = perKeyLimits;
        this._cache = new Cache(new Hardware(session));
        this._lastFlushTimestamp = -Infinity;
    }

    async _writeToCache(key, value) {
        const limit = this._perKeyLimits[key];

        const index = this._cache.getCurIndex(key);
        if (index === undefined) {
            const prefix = encodeInteger(this._cache.tick()) + ';';
            this._cache.write(key, 0, prefix + value);
        } else {
            const prefix = await this._cache.read(key, index) + ';';
            if (this._cache.canWrite(prefix + value)) {
                this._cache.write(key, index, prefix + value);
            } else {
                const newPrefix = encodeInteger(this._cache.tick()) + ';';
                this._cache.write(key, (index + 1) % limit, newPrefix + value);
            }
        }
    }

    async write(key, value) {
        await this._cache.fetchKeysIfNeeded();
        await this._writeToCache(key, value);
        return await this.flush();
    }

    async read(key) {
        await this._cache.fetchKeysIfNeeded();

        const lastIndex = this._cache.getLastIndex(key);
        if (lastIndex === undefined)
            return [];

        const curIndex = this._cache.getCurIndex(key);

        const rawKeys = [];
        for (let i = 0; i <= lastIndex; ++i) {
            const index = (curIndex + 1 + i) % (lastIndex + 1);
            rawKeys.push(`${key}${index}`);
        }

        const result = [];
        const values = await this._cache.readMany(rawKeys);
        for (const value of values) {
            const segments = value.spit(';');
            for (let i = 1; i < segments.length; ++i)
                result.push(segments[i]);
        }
        return result;
    }

    // Use for debugging only: does not catch rate limit errors and stuff.
    async unsafeClear() {
        await this._cache.unsafeClear();
    }

    hasSomethingToFlush() {
        return this._cache.hasSomethingToFlush();
    }

    async flush() {
        await this._cache.fetchKeysIfNeeded();

        const now = monotonicNowMillis();
        if (now - this._lastFlushTimestamp >= 3600) {
            const nwrites = await this._cache.flush();
            if (nwrites)
                this._lastFlushTimestamp = monotonicNowMillis() + ((nwrites - 1) * 3600 / 2);
            return true;
        }
        return false;
    }
}
