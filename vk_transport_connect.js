import connect from "@vkontakte/vk-connect";
import { VkApiError } from "./vk_api.js";

const methodsByKey = {};
const requestsByMethod = {};

const doSend = (request) => {
    for (const key in request.callbacks)
        methodsByKey[key] = request.method;
    requestsByMethod[request.method] = request;
    connect.send(request.method, request.params);
};

connect.subscribe((event) => {
    const { type, data } = event.detail;
    const method = methodsByKey[type];
    const request = requestsByMethod[method];

    // This also catches the 'method === undefined' case:
    if (request === undefined) {
        // "VKWebAppUpdateConfig"
        // "VKWebAppInitResult"
        console.log(`W: no handler for VK event of type "${type}"`);
        return;
    }

    if (request.next !== null)
        doSend(request.next);
    else
        delete requestsByMethod[method];
    request.callbacks[type](data);
});

export class VkRequest {
    constructor(method, params) {
        this.method = method;
        this.params = params;
        this.callbacks = {};
        this.next = null;
    }

    on(key, fn) {
        this.callbacks[key] = fn;
    }

    schedule() {
        const ongoing = requestsByMethod[this.method];
        if (ongoing !== undefined) {
            this.next = ongoing.next;
            ongoing.next = this;
        } else {
            doSend(this);
        }
    }
}

export class VkRequestError extends Error {
    constructor(data) {
        super(JSON.stringify(data));
        this.name = 'VkRequestError';
        this.data = data;
    }
}

export const vkSendRequest = (method, successKey, failureKey, params) => {
    return new Promise((resolve, reject) => {
        const r = new VkRequest(method, params);
        r.on(successKey, resolve);
        r.on(failureKey, (data) => reject(new VkRequestError(data)));
        r.schedule();
    });
};

export class Transport {
    constructor() {
        this._accessToken = null;
    }

    setAccessToken(accessToken) {
        this._accessToken = accessToken;
    }

    async callAPI(method, params) {
        if (this._accessToken === null)
            throw new Error('access token was not set for this Transport instance');
        let result;
        try {
            result = await vkSendRequest(
                'VKWebAppCallAPIMethod',
                'VKWebAppCallAPIMethodResult',
                'VKWebAppCallAPIMethodFailed',
                {
                    method: method,
                    params: {...params, access_token: this._accessToken},
                    request_id: '1',
                }
            );
        } catch (err) {
            if (!(err instanceof VkRequestError))
                throw err;
            if (err.data.error_type === 'client_error' && err.data.error_data.error_code === 1) {
                const reason = err.data.error_data.error_reason;
                throw new VkApiError(reason.error_code, reason.error_msg);
            } else {
                throw err;
            }
        }
        if (result.error)
            throw new VkApiError(result.error.error_code, result.error.error_msg);
        return result;
    }
}
