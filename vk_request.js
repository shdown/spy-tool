import connect from '@vkontakte/vk-connect';

const methodsByKey = {};
const requestsByMethod = {};

const doSend = request => {
    for (const key in request.callbacks)
        methodsByKey[key] = request.method;
    requestsByMethod[request.method] = request;
    connect.send(request.method, request.params);
};

connect.subscribe(event => {
    const { type, data } = event.detail;
    const method = methodsByKey[type];
    if (!method)
        throw new Error(`Unknown VK event type: ${type}`);
    const request = requestsByMethod[method];
    if (request.next)
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
        return this;
    }

    schedule() {
        const ongoing = requestsByMethod[this.method];
        if (ongoing) {
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
        new VkRequest(method, params)
            .on(successKey, resolve)
            .on(failureKey, data => reject(new VkRequestError(data)))
            .schedule();
    });
};
