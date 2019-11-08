export class ChartController {
    constructor(maxBarsNum, painter) {
        this._painter = painter;
        this._bars = Array(maxBarsNum).fill(null);
        this._bumptimes = Array(maxBarsNum).fill(0);
        this._timer = 1;
    }

    _assign(i, value) {
        const copy = {...value};
        const old = this._bars[i];
        if (old === null) {
            this._painter.addBar(i, copy);
        } else if (old.id === value.id) {
            this._painter.setBarValue(i, copy);
        } else {
            this._painter.alterBar(i, copy);
        }
        this._bars[i] = copy;
        this._bumptimes[i] = this._timer++;
    }

    _findLRU() {
        let min = this._timer;
        let result = -1;
        for (let i = 0; i < this._bumptimes.length; ++i) {
            const cur = this._bumptimes[i];
            if (cur < min) {
                min = cur;
                result = i;
            }
        }
        return result;
    }

    _findWithId(id) {
        for (let i = 0; i < this._bars.length; ++i) {
            const value = this._bars[i];
            if (value !== null && value.id === id)
                return i;
        }
        return null;
    }

    handleAdd(value) {
        // Optimized for the most common/hot path: no 'null' elements in 'this._bars'.
        let i = this._bars.length - 1;
        while (i !== -1 && this._bars[i] === null)
            --i;
        if (i !== this._bars.length - 1)
            this._assign(i + 1, value);
    }

    handleUpdate(value) {
        const i = this._findWithId(value.id);
        this._assign(i !== null ? i : this._findLRU(), value);
    }

    handleFlush() {
        this._painter.flush();
    }
}
