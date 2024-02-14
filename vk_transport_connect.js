import bridge from "@vkontakte/vk-bridge";
import { VkApiError } from "./vk_api.js";

class VkRequestError extends Error {
    constructor(data) {
        super(JSON.stringify(data));
        this.name = 'VkRequestError';
        this.data = data;
    }
}

export const vkSendInitRequest = () => {
    bridge.send('VKWebAppInit', {});
};

export const vkSendRequest = (method, params) => {
    return new Promise((resolve, reject) => {
        bridge.send(method, params)
            .then(resolve)
            .catch((data) => reject(new VkRequestError(data)));
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
                {
                    method: method,
                    params: {...params, access_token: this._accessToken},
                }
            );
        } catch (err) {
            if (!(err instanceof VkRequestError))
                throw err;
            //if (err.data.error_type === 'client_error' && err.data.error_data.error_code === 1) {
            //    const reason = err.data.error_data.error_reason;
            //    throw new VkApiError(reason.error_code, reason.error_msg);
            //} else {
            //    throw err;
            //}
            const error_data = err.data.error_data;
            throw new VkApiError(error_data.error_code, error_data.error_msg);
        }
        if (result.error)
            throw new VkApiError(result.error.error_code, result.error.error_msg);
        return result;
    }
}
