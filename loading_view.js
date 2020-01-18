import { View } from "./view.js";
import { fromHtml, htmlEscape } from "./utils.js";
import { __ } from "./gettext.js";

export class LoadingView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');
        this._div.append(__('Loading…'));
    }

    get element() {
        return this._div;
    }

    mount() {
    }

    unmount() {
    }
}
