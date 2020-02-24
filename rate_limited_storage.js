import { VkApiError } from './vk_api.js';
import { monotonicNowMillis } from './utils.js';
import { encodeInteger, decodeInteger } from './intcodec.js';

// So, the basic problem is to store some data we want using the VK storage API, which is quite
// cumbersome to use.
//
// What we have is the following functions:
//
//   * listKeys() -> Array(String)
//
//   * get(keys: Array(String)) -> Array(String)
//
//   * set(key: String, value: String)
//
// All values are effectively limited to 1024 bytes; keys to 100 bytes. There number of entries is
// limited to 1000; an entry can be deleted by calling 'set' with empty 'value'.
//
// The API is rate-limited: if you call 'set' more than 1000 times an hour, it will throw an error.
//
// The abstraction this module provides on top on this API can be described as a
// "mapping from strings to ordered collections of strings", although there are certain
// limitations to strings. Concretely, the following methods are provided by the
// 'RateLimitedStorage' class:
//
//   * async write(key, value)
//       Pushes a new string 'value' _to the back_ of the ordered collection at the key 'key'. If
//       there is no room for the new value in the storage, an unspecified number of values are
//       popped _from the front_ of the ordered collection.
//
//       (!) This function may or may not actually flush the data to the storage; use
//           'hasSomethingToFlush()' and 'flush()' methods to query the state of the cache and try
//           to flush it, respectively.
//
//   * async read(key)
//       Returns the ordered collection at the key 'key' as an array of strings.
//
//   * async clear()
//       Clears the entire storage (all the ordered collections).
//
//       (!) This function may or may not actually flush the data to the storage; use
//           'hasSomethingToFlush()' and 'flush()' methods to query the state of the cache and try
//           to flush it, respectively.
//
//   * hasSomethingToFlush()
//       Returns 'true' if there are any unflushed entries in the cache, 'false' otherwise.
//
//   * async flush()
//       Tries to flush the unflushed entries in the cache, if any.
//
// A key can only contain ASCII Latin letters (upper- or lowercase), and can not be longer than 90
// bytes.
// A value can only contain the printable subset of ASCII without the semicolon (';') character, and
// can not be longer than 512 bytes.
// If any of those requirements is unmet, the behavior is undefined.

const MIN_DELAY_MILLIS = 3600;

// Maximum request parameter length.
const PARAM_MAX = 1024;

// Must be a power of two.
const READ_CACHE_SIZE = 32;

const hashString = (str) => {
    let hash = 5381;
    for (let i = str.length;
         i;
         hash = (hash * 33) ^ str.charCodeAt(--i))
    {}
    return hash >>> 0;
};

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

    async readMany(rawKeys) {
        const rawKeyToIndex = {};
        for (let i = 0; i < rawKeys.length; ++i)
            rawKeyToIndex[rawKeys[i]] = i;

        const result = Array(rawKeys.length);

        let i = 0;
        while (i !== rawKeys.length) {
            let j = i;
            for (let len = 0;
                 len <= PARAM_MAX && j !== rawKeys.length;
                 len += 1 + rawKeys[j].length, ++j)
            {}
            const data = await this._session.apiRequest('storage.get', {
                keys: rawKeys.slice(i, j).join(','),
                v: '5.103',
            });
            for (const datum of data)
                result[rawKeyToIndex[datum.key]] = datum.value;
            i = j;
        }
        return result;
    }

    canWrite(prefix, value) {
        return prefix.length + value.length <= PARAM_MAX;
    }

    async write(rawKey, value) {
        while (true) {
            try {
                await this._session.apiRequestForwardErrors(
                    'storage.set',
                    {
                        key: rawKey,
                        value: value,
                        v: '5.103',
                    }
                );
                break;
            } catch (err) {
                if ((err instanceof VkApiError) && err.code === 9)
                    throw new HardwareRateLimitError();
                await this._session.handleOrThrow(err);
            }
        }
    }
}

class Cache {
    constructor(hardware) {
        this._hardware = hardware;
        this._writeCache = [];
        this._rawKeyToWriteDatum = {};
        this._readCache = Array(READ_CACHE_SIZE).fill(null);
    }

    async readMany(rawKeys) {
        const result = Array(rawKeys.length).fill(null);
        const toFetchRawKeys = [];
        const toFetchResultIndices = [];
        const toFetchReadCacheIndices = [];

        for (let i = 0; i < rawKeys.length; ++i) {
            const rawKey = rawKeys[i];

            const writeDatum = this._rawKeyToWriteDatum[rawKey];
            if (writeDatum !== undefined) {
                result[i] = writeDatum.value;
                continue;
            }

            const readCacheIndex = hashString(rawKey) & (READ_CACHE_SIZE - 1);
            const readDatum = this._readCache[readCacheIndex];
            if (readDatum !== null && readDatum.rawKey === rawKey) {
                result[i] = readDatum.value;
                continue;
            }

            toFetchRawKeys.push(rawKey);
            toFetchResultIndices.push(i);
            toFetchReadCacheIndices.push(readCacheIndex);
        }

        const fetched = await this._hardware.readMany(toFetchRawKeys);

        for (let i = 0; i < fetched.length; ++i) {
            const value = fetched[i];
            result[toFetchResultIndices[i]] = value;
            this._readCache[toFetchReadCacheIndices[i]] = {
                rawKey: toFetchRawKeys[i],
                value: value,
            };
        }

        return result;
    }

    write(rawKey, value) {
        const writeDatum = this._rawKeyToWriteDatum[rawKey];
        if (writeDatum !== undefined) {
            writeDatum.value = value;
            return;
        }

        const datum = {rawKey: rawKey, value: value};

        this._writeCache.push(datum);
        this._rawKeyToWriteDatum[rawKey] = datum;

        const readCacheIndex = hashString(rawKey) & (READ_CACHE_SIZE - 1);
        this._readCache[readCacheIndex] = datum;
    }

    async flush() {
        let i = 0;
        for (; i < this._writeCache.length; ++i) {
            const datum = this._writeCache[i];
            try {
                await this._hardware.write(datum.rawKey, datum.value);
            } catch (err) {
                if (!(err instanceof HardwareRateLimitError))
                    throw err;
                break;
            }
            delete this._rawKeyToWriteDatum[datum.rawKey];
        }
        this._writeCache.splice(0, i);
        return i;
    }

    hasSomethingToFlush() {
        return this._writeCache.length !== 0;
    }
}

class MetadataBuilder {
    constructor(perKeyLimits) {
        this._keyToMetadata = {};
        this._keyToMaxTimer = {};
        this._timer = 0;
        for (const key in perKeyLimits) {
            this._keyToMetadata[key] = {
                curIndex: -1,
                lastIndex: -1,
                limit: perKeyLimits[key],
            };
            this._keyToMaxTimer[key] = -1;
        }
    }

    feed(key, index, timer) {
        const metadata = this._keyToMetadata[key];
        if (this._keyToMaxTimer[key] < timer) {
            this._keyToMaxTimer[key] = timer;
            metadata.curIndex = index;
        }
        if (metadata.lastIndex < index)
            metadata.lastIndex = index;
        if (this._timer < timer)
            this._timer = timer;
    }

    finalize() {
        return {
            keyToMetadata: this._keyToMetadata,
            timer: this._timer,
        };
    }
}

export class RateLimitedStorage {
    constructor(perKeyLimits, session) {
        this._perKeyLimits = perKeyLimits;
        this._hardware = new Hardware(session);
        this._cache = new Cache(this._hardware);

        this._lastFlushTimestamp = -Infinity;

        this._keyToMetadata = null;
        this._timer = null;
    }

    async _fetchMetadataIfNeeded() {
        if (this._timer !== null)
            return;

        const rawKeys = await this._hardware.readKeys();
        const values = await this._hardware.readMany(rawKeys);

        const builder = new MetadataBuilder(this._perKeyLimits);

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

            builder.feed(key, index, timer);
        }

        const result = builder.finalize();
        this._keyToMetadata = result.keyToMetadata;
        this._timer = result.timer;
    }

    async _chooseBucket(key, value, metadata) {
        const index = metadata.curIndex;
        if (index !== -1) {
            const prefix = (await this._cache.readMany([`${key}${index}`]))[0] + ';';
            if (this._hardware.canWrite(prefix, value))
                return {index: index, prefix: prefix};
        }
        return {
            index: (index + 1) % metadata.limit,
            prefix: encodeInteger(++this._timer) + ';',
        };
    }

    async write(key, value) {
        await this._fetchMetadataIfNeeded();

        const metadata = this._keyToMetadata[key];
        const {index, prefix} = await this._chooseBucket(key, value, metadata);
        this._cache.write(`${key}${index}`, prefix + value);

        metadata.curIndex = index;
        if (metadata.lastIndex < index)
            metadata.lastIndex = index;

        await this.flush();
    }

    _getRawKeys(key) {
        const metadata = this._keyToMetadata[key];
        const nRawKeys = metadata.lastIndex + 1;

        const result = [];
        for (let i = 0; i < nRawKeys; ++i) {
            const index = (metadata.curIndex + 1 + i) % nRawKeys;
            result.push(`${key}${index}`);
        }
        return result;
    }

    async read(key) {
        await this._fetchMetadataIfNeeded();

        const rawKeys = this._getRawKeys(key);
        const values = await this._cache.readMany(rawKeys);
        const result = [];
        for (const value of values) {
            const segments = value.split(';');
            for (let i = 1; i < segments.length; ++i)
                result.push(segments[i]);
        }
        return result;
    }

    async clear() {
        await this._fetchMetadataIfNeeded();

        for (const key in this._keyToMetadata)
            for (const rawKey of this._getRawKeys(key))
                this._cache.write(rawKey, '');

        // Reset the metadata.
        const builder = new MetadataBuilder(this._perKeyLimits);
        const result = builder.finalize();
        this._keyToMetadata = result.keyToMetadata;
        this._timer = result.timer;

        await this.flush();
    }

    hasSomethingToFlush() {
        return this._cache.hasSomethingToFlush();
    }

    async flush() {
        const now = monotonicNowMillis();
        if (now - this._lastFlushTimestamp >= MIN_DELAY_MILLIS) {
            const nwrites = await this._cache.flush();
            if (nwrites) {
                const handicap = (nwrites - 1) * MIN_DELAY_MILLIS / 2;
                this._lastFlushTimestamp = monotonicNowMillis() + handicap;
            }
        }
    }
}
