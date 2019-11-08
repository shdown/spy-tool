const MAX_VALUE = 1000;

export class ProgressPainter {
    constructor() {
        this._element = document.createElement('progress');
        this._element.setAttribute('max', String(MAX_VALUE));
    }

    get element() {
        return this._element;
    }

    reset() {
        this._element.setAttribute('value', '');
    }

    setRatio(ratio) {
        this._element.setAttribute('value', String(Math.round(ratio * MAX_VALUE)));
    }
}
