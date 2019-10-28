import { vkSendRequest, VkRequestError } from './vk_request.js';

export class VkApiError extends Error {
    constructor(code, msg) {
        super(`[${code}] ${msg}`);
        this.name = 'VkApiError';
        this.code = code;
        this.msg = msg;
    }
}

const monotonicNowMillis = () => window.performance.now();
const sleepMillis = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export class VkApiCancellation extends Error {
    constructor() {
        super('Cancellation');
        this.name = 'VkApiCancellation';
    }
}

const MIN_DELAY_MILLIS = 0.36 * 1000;

export class VkApiSession {
    constructor() {
        this.accessToken = null;
        this.rateLimitCallback = null;
        this.lastRequestTimestamp = NaN;
        this.cancelFlag = false;
    }

    _maybeThrowForCancel() {
        if (this.cancelFlag) {
            this.cancelFlag = false;
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

    cancel() {
        this.cancelFlag = true;
    }

    setAccessToken(accessToken) {
        this.accessToken = accessToken;
        return this;
    }

    setRateLimitCallback(fn) {
        this.rateLimitCallback = fn;
        return this;
    }

    async _limitRate(what, delayMillis) {
        if (this.rateLimitCallback)
            this.rateLimitCallback(what);
        await this._sleepMillis(delayMillis);
    }

    async _apiRequestNoRateLimit(method, params) {
        if (!this.accessToken)
            throw 'Access token was not set for this VkApiSession instance';

        const now = monotonicNowMillis();
        const delay = now - this.lastRequestTimestamp;
        if (delay < MIN_DELAY_MILLIS)
            await this._sleepMillis(MIN_DELAY_MILLIS - delay);

        this._maybeThrowForCancel();

        this.lastRequestTimestamp = monotonicNowMillis();
        let result;
        try {
            result = await vkSendRequest(
                'VKWebAppCallAPIMethod',
                'VKWebAppCallAPIMethodResult',
                'VKWebAppCallAPIMethodFailed',
                {
                    method: method,
                    params: Object.assign({access_token: this.accessToken}, params),
                    request_id: '1',
                }
            );
        } catch (err) {
            if (!(err instanceof VkRequestError))
                throw err;
            if (err.data.error_type === 'client_error') {
                const reason = err.data.error_data.error_reason;
                throw new VkApiError(reason.error_code, reason.error_msg);
            } else {
                throw err;
            }
        }
        if (result.error)
            throw new VkApiError(result.error.error_code, result.error.error_msg);
        return result.response;
    }

    async apiRequest(method, params) {
        while (true) {
            try {
                return await this._apiRequestNoRateLimit(method, params);
            } catch (err) {
                if (!(err instanceof VkApiError))
                    throw err;
                // https://vk.com/dev/errors
                switch (err.code) {
                case 6:
                    await this._limitRate('rate-limit', 3000);
                    break;
                case 9: // this one was not seen in practice, but still...
                    await this._limitRate('rate-limit-hard', 9000);
                    break;
                case 1:
                case 10:
                    await this._limitRate('server-unavailable', 1000);
                    break;
                default:
                    throw err;
                }
            }
        }
    }
}
