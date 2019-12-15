import { View } from "./view.js";

export class ProgressView extends View {
    constructor(progress_painter, chart_painter) {
        super();
        this._div = document.createElement('div');
        this._progress_painter = progress_painter;
        this._chart_painter = chart_painter;

        this._progress_painter.element.style = 'display: block; width: 100%;';
        this._div.appendChild(this._progress_painter.element);

        this._div.appendChild(this._chart_painter.element);

        this._bottom = document.createElement('div');
        this._cancelBtn = document.createElement('input');
        this._cancelBtn.setAttribute('type', 'button');
        this._cancelBtn.setAttribute('value', 'Отмена');
        this._cancelBtn.onclick = () => {
            super._emitSignal('cancel');
            return false;
        };
        this._log = document.createElement('span');
        this._log.style = 'margin-left: 1em;';

        this._bottom.appendChild(this._cancelBtn);
        this._bottom.appendChild(this._log);
        this._div.appendChild(this._bottom);
    }

    get element() {
        return this._div;
    }

    mount() {
    }

    unmount() {
        this._progress_painter.reset();
        this._chart_painter.reset();
        this._log.innerHTML = '';
    }

    setLogContent(html) {
        this._log.innerHTML = html;
    }
}
