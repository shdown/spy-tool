import { View } from "./view.js";
import { createAnchor, htmlEscape } from "./utils.js";

export class ResultsView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');
        this._backBtn = document.createElement('input');
        this._backBtn.setAttribute('type', 'button');
        this._backBtn.setAttribute('value', 'Назад');
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
            inner.innerHTML = 'Ничего не найдено! 😢';
        } else {
            inner.innerHTML = 'Найдены посты:<br/>';
            const ul = document.createElement('ul');
            for (const datum of data) {
                const li = document.createElement('li');
                const a = createAnchor(datum.link);
                const span = document.createElement('span');
                if (datum.isNew) {
                    span.style = 'font-weight: bold;';
                    span.innerHTML = ' (новый)';
                } else {
                    span.style = 'color: #999;';
                    span.innerHTML = ' (старый)';
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
        inner.innerHTML = htmlEscape(text);
        this._setInner(inner);
    }

    mount() {
    }

    unmount() {
    }
}
