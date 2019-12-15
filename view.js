export class View {
    constructor() {
        this._signalHandlers = {};
    }

    subscribe(signal, fn) {
        this._signalHandlers[signal] = fn;
    }

    _emitSignal(signal) {
        const fn = this._signalHandlers[signal];
        if (fn !== undefined)
            fn();
    }
}
