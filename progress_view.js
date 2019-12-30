import { View } from "./view.js";
import { ChartView } from "./chart_view.js";
import { __ } from "./gettext.js";

const PROGRESS_MAX = 1000;

export class ProgressView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');

        this._progress = document.createElement('progress');
        this._progress.setAttribute('max', String(PROGRESS_MAX));
        this._progress.style = 'display: block; width: 100%;';
        this._div.appendChild(this._progress);

        this._chartView = new ChartView();
        this._div.appendChild(this._chartView.element);

        this._bottom = document.createElement('div');
        this._cancelBtn = document.createElement('input');
        this._cancelBtn.setAttribute('type', 'button');
        this._cancelBtn.setAttribute('value', __('Cancel'));
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

    get chartView() {
        return this._chartView;
    }

    setProgress(ratio) {
        const v = isNaN(ratio) ? '' : String(Math.round(ratio * PROGRESS_MAX));
        this._progress.setAttribute('value', v);
    }

    mount() {
        this._chartView.mount();
    }

    unmount() {
        this.setProgress(NaN);
        this._chartView.unmount();
        this._log.innerHTML = '';
    }

    setLogText(text) {
        this._log.innerHTML = '';
        this._log.append(text);
    }
}
