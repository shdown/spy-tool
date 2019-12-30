import { GLOBAL_CONFIG } from "./global_config.js";
import { isSubset } from "./utils.js";
import { vkSendRequest } from './vk_transport_connect.js';

const splitPermissions = (s) => {
    return s === '' ? [] : s.split(',');
};

export class AccessTokenError extends Error {
    constructor(requestedScope, gotScope) {
        super(`Requested scope '${requestedScope}', got '${gotScope}'`);
        this.name = 'AccessTokenError';
    }
}

export const requestAccessToken = async (scope) => {
    const result = await vkSendRequest(
        'VKWebAppGetAuthToken',
        'VKWebAppAccessTokenReceived',
        'VKWebAppAccessTokenFailed',
        {app_id: GLOBAL_CONFIG.APP_ID, scope: scope});

    if (!isSubset(splitPermissions(scope), splitPermissions(result.scope)))
        throw new AccessTokenError(scope, result.scope);

    return result.access_token;
};
