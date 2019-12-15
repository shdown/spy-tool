import { View } from "./view.js";

export class LoadingView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');
        this._div.innerHTML = 'Загрузка…';
    }

    get element() {
        return this._div;
    }

    mount() {
    }

    unmount() {
    }
}
