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
        const maxLag = this._maxLagMillis;
        for (; ms > maxLag; ms -= maxLag) {
            this.maybeThrowForCancel();
            await sleepMillis(maxLag);
        }
        this.maybeThrowForCancel();
        await sleepMillis(ms);
    }
}
