import { VkApiError } from "./vk_api.js";

export class Transport {
    constructor() {
    }

    callAPI(method, params) {
        return new Promise((resolve, reject) => {
            VK.Api.call(method, params, (result) => {
                if (result.error) {
                    reject(new VkApiError(result.error.error_code, result.error.error_msg));
                } else {
                    resolve(result);
                }
            });
        });
    }
}
