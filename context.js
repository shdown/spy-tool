import { sleepMillis } from "./utils.js";

export class ContextCancellation extends Error {
    constructor() {
        super('Cancellation');
        this.name = 'ContextCancellation';
    }
}

export class Context {
    constructor(maxLagMillis) {
        this._cancelFlag = false;
        this._maxLagMillis = maxLagMillis;
    }

    setCancelFlag(flag) {
        this._cancelFlag = flag;
    }

    maybeThrowForCancel() {
        if (this._cancelFlag) {
            this._cancelFlag = false;
            throw new ContextCancellation();
        }
    }

    async sleepMillis(ms) {
        const max_lag = this._maxLagMillis;
        for (; ms > max_lag; ms -= max_lag) {
            this.maybeThrowForCancel();
            await sleepMillis(max_lag);
        }
        this.maybeThrowForCancel();
        await sleepMillis(ms);
    }
}
