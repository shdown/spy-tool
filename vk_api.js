import { monotonicNowMillis, sleepMillis } from "./utils.js";

export class VkApiError extends Error {
    constructor(code, msg) {
        super(`[${code}] ${msg}`);
        this.name = 'VkApiError';
        this.code = code;
        this.msg = msg;
    }
}

export class VkApiCancellation extends Error {
    constructor() {
        super('Cancellation');
        this.name = 'VkApiCancellation';
    }
}

const MIN_DELAY_MILLIS = 360;

export class VkApiSession {
    constructor(transport) {
        this._transport = transport;
        this._rateLimitCallback = null;
        this._lastRequestTimestamp = -Infinity;
        this._cancelFlag = false;
    }

    _maybeThrowForCancel() {
        if (this._cancelFlag) {
            this._cancelFlag = false;
            throw new VkApiCancellation();
        }
    }

    async _sleepMillis(ms) {
        const MAX_LAG = 200;
        while (ms >= MAX_LAG) {
            this._maybeThrowForCancel();
            await sleepMillis(MAX_LAG);
            ms -= MAX_LAG;
        }
        this._maybeThrowForCancel();
        await sleepMillis(ms);
    }

    setCancelFlag(flag) {
        this._cancelFlag = flag;
    }

    setRateLimitCallback(fn) {
        this._rateLimitCallback = fn;
    }

    async _limitRate(reason, delayMillis) {
        if (this._rateLimitCallback)
            this._rateLimitCallback(reason);
        await this._sleepMillis(delayMillis);
    }

    async _apiRequestNoRateLimit(method, params, raw) {
        const now = monotonicNowMillis();
        const delay = now - this._lastRequestTimestamp;
        if (delay < MIN_DELAY_MILLIS)
            await this._sleepMillis(MIN_DELAY_MILLIS - delay);

        this._maybeThrowForCancel();

        this._lastRequestTimestamp = monotonicNowMillis();

        const result = await this._transport.callAPI(method, params);
        return raw ? result : result.response;
    }

    async handleOrThrow(err) {
        if (!(err instanceof VkApiError))
            throw err;
        // https://vk.com/dev/errors
        switch (err.code) {
        case 6:
            await this._limitRate('rateLimit', 3000);
            break;
        case 9:
            await this._limitRate('rateLimitHard', 5000);
            break;
        case 1:
        case 10:
            await this._limitRate('serverUnavailable', 1000);
            break;
        default:
            throw err;
        }
    }

    async apiRequest(method, params, raw = false, forwardErrors = false) {
        while (true) {
            try {
                return await this._apiRequestNoRateLimit(method, params, raw);
            } catch (err) {
                if (forwardErrors)
                    throw err;
                await this.handleOrThrow(err);
            }
        }
    }

    async apiExecuteRaw(params, forwardErrors = false) {
        const result = await this.apiRequest('execute', params, /*raw=*/true, forwardErrors);
        const errors = result.execute_errors || [];
        return {
            response: result.response,
            errors: errors.map(datum => new VkApiError(datum.error_code, datum.error_msg)),
        };
    }
}
