export class View {
    constructor() {
        this._signalHandlers = {};
    }

    subscribe(signal, f) {
        let fs = this._signalHandlers[signal];
        if (fs === undefined)
            fs = this._signalHandlers[signal] = [];
        fs.push(f);
    }

    _emitSignal(signal) {
        const fs = this._signalHandlers[signal];
        if (fs !== undefined)
            for (const f of fs)
                f();
    }
}
