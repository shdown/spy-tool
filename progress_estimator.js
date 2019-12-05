export class ProgressEstimator {
    constructor() {
        this._offsets = {};
        this._totalDone = 0;
        this._totalTodo = 0;
        this._earliestTimestamp = Infinity;
        this._latestTimestamp = -Infinity;
    }

    handleAdd(value) {
        this._totalDone += value.offset;
        this._totalTodo += value.total;
        if (value.offset !== 0 && value.offset !== value.total)
            this._offsets[value.id] = value.offset;
        if (!value.pinned) {
            this._earliestTimestamp = Math.min(this._earliestTimestamp, value.date);
            this._latestTimestamp = Math.max(this._latestTimestamp, value.date);
        }
    }

    handleUpdate(value) {
        const {id, offset} = value;
        const delta = offset - (this._offsets[id] || 0);
        this._totalDone += delta;
        if (offset === value.total)
            delete this._offsets[id];
        else
            this._offsets[id] = offset;
    }

    getStats() {
        if (this._earliestTimestamp === Infinity)
            return undefined;
        return {
            timeSpan: this._latestTimestamp - this._earliestTimestamp,
            totalComments: this._totalTodo,
        };
    }

    getDoneCommentsNumber() {
        return this._totalDone;
    }

    static statsToExpectedCommentsCount(stats, timeLimit) {
        return stats.totalComments / stats.timeSpan * timeLimit;
    }
}
