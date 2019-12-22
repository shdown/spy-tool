import { View } from "./view.js";
import { createAnchor } from "./utils.js";
import { __ } from "./gettext.js";

export class ResultsView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');
        this._backBtn = document.createElement('input');
        this._backBtn.setAttribute('type', 'button');
        this._backBtn.setAttribute('value', __('Back'));
        this._backBtn.onclick = () => {
            super._emitSignal('back');
            return false;
        };
        this._div.appendChild(this._backBtn);
        this._div.appendChild(document.createElement('hr'));
        this._inner = null;
    }

    get element() {
        return this._div;
    }

    _setInner(inner) {
        if (this._inner !== null)
            this._inner.remove();
        this._inner = inner;
        this._div.appendChild(inner);
    }

    setResults(data) {
        const inner = document.createElement('div');
        if (data.length === 0) {
            inner.append(__('Nothing found! 😢'));
        } else {
            inner.append(__('Posts founds:'));
            inner.appendChild(document.createElement('br'));
            const ul = document.createElement('ul');
            for (const datum of data) {
                const li = document.createElement('li');
                const a = createAnchor(datum.link);
                const span = document.createElement('span');
                if (datum.isNew) {
                    span.style = 'font-weight: bold;';
                    span.append(__(' (new)'));
                } else {
                    span.style = 'color: #999;';
                    span.append(__(' (old)'));
                }
                li.appendChild(a);
                li.appendChild(span);
                ul.appendChild(li);
            }
            inner.appendChild(ul);
        }
        this._setInner(inner);
    }

    setError(text) {
        const inner = document.createElement('div');
        inner.append(text);
        this._setInner(inner);
    }

    mount() {
    }

    unmount() {
    }
}
