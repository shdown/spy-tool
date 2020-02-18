import { encodeManyIntegers, decodeManyIntegers } from './intcodec.js';
import { isStatsValid } from './stats_utils.js';

export class StatsStorage {
    constructor(storage) {
        this._storage = storage;
        this._data = null;
    }

    async _fetchDataIfNeeded() {
        if (this._data !== null)
            return;
        this._data = {};
        const entries = await this._storage.read('s');
        for (const entry of entries) {
            const [ownerId, totalComments, timeSpan] = decodeManyIntegers(entry);
            const stat = {totalComments: totalComments, timeSpan: timeSpan};
            // The storage may contain junk -- e.g. data written by older versions; let's check it.
            if (isStatsValid(stat))
                this._data[ownerId] = stat;
        }
    }

    async getStats(ownerId) {
        await this._fetchDataIfNeeded();
        return this._data[ownerId];
    }

    async setStats(ownerId, stats, isApprox) {
        await this._fetchDataIfNeeded();
        this._data[ownerId] = stats;
        const entry = encodeManyIntegers([ownerId, stats.totalComments, stats.timeSpan]);
        await this._storage.write('s',  entry);
    }
}
