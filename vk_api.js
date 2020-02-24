import { monotonicNowMillis } from "./utils.js";

export class VkApiError extends Error {
    constructor(code, msg) {
        super(`[${code}] ${msg}`);
        this.name = 'VkApiError';
        this.code = code;
        this.msg = msg;
    }
}

const MIN_DELAY_MILLIS = 360;

export class VkApiSession {
    constructor(transport, context) {
        this._transport = transport;
        this._context = context;
        this._rateLimitCallback = null;
        this._lastRequestTimestamp = -Infinity;
        this._cancelFlag = false;
    }

    setRateLimitCallback(fn) {
        this._rateLimitCallback = fn;
    }

    async _limitRate(reason, delayMillis) {
        if (this._rateLimitCallback !== null)
            this._rateLimitCallback(reason);
        await this._context.sleepMillis(delayMillis);
    }

    async apiRequestForwardErrors(method, params, raw) {
        const now = monotonicNowMillis();
        const delay = now - this._lastRequestTimestamp;
        if (delay < MIN_DELAY_MILLIS)
            await this._context.sleepMillis(MIN_DELAY_MILLIS - delay);

        this._context.maybeThrowForCancel();

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

    async apiRequest(method, params, raw = false) {
        while (true) {
            try {
                return await this.apiRequestForwardErrors(method, params, raw);
            } catch (err) {
                await this.handleOrThrow(err);
            }
        }
    }

    async apiExecute(params) {
        const result = await this.apiRequest('execute', params, /*raw=*/true);
        const errors = result.execute_errors || [];
        return {
            response: result.response,
            errors: errors.map(datum => new VkApiError(datum.error_code, datum.error_msg)),
        };
    }
}
