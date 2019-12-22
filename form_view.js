import { View } from "./view.js";
import { __ } from "./gettext.js";

const createDiv = (text) => {
    const div = document.createElement('div');
    div.append(text);
    return div;
};

export class FormView extends View {
    constructor() {
        super();
        this._form = document.createElement('form');

        this._form.appendChild(createDiv(
            __('User ID or handle (for example, “1” or “durov”):')));

        this._userInput = document.createElement('input');
        this._userInput.setAttribute('type', 'text');
        this._userInput.setAttribute('required', '1');
        this._form.appendChild(this._userInput);

        this._form.appendChild(document.createElement('hr'));

        this._form.appendChild(createDiv(
            __('Public list (IDs or handles); separate with commas, spaces or line feeds:')));

        this._ownersInput = document.createElement('textarea');
        this._ownersInput.setAttribute('required', '1');
        this._form.appendChild(this._ownersInput);

        this._getSubsBtn = document.createElement('input');
        this._getSubsBtn.setAttribute('type', 'button');
        this._getSubsBtn.setAttribute('value', __('Fill with user subscriptions'));
        this._getSubsBtn.style = 'display: block;';
        this._getSubsBtn.onclick = () => {
            super._emitSignal('get-subs');
            return false;
        };
        this._form.appendChild(this._getSubsBtn);

        this._form.appendChild(document.createElement('hr'));

        this._form.appendChild(createDiv(__('Time limit, days:')));

        this._timeLimitInput = document.createElement('input');
        this._timeLimitInput.setAttribute('type', 'number');
        this._timeLimitInput.setAttribute('required', '1');
        this._timeLimitInput.setAttribute('value', '30');
        this._form.appendChild(this._timeLimitInput);

        this._form.appendChild(document.createElement('hr'));

        this._submitBtn = document.createElement('input');
        this._submitBtn.setAttribute('type', 'submit');
        this._submitBtn.setAttribute('value', __('Find!'));
        this._form.appendChild(this._submitBtn);

        this._archiveBtn = document.createElement('input');
        this._archiveBtn.setAttribute('type', 'button');
        this._archiveBtn.setAttribute('value', __('Archive'));
        this._archiveBtn.onclick = () => {
            super._emitSignal('open-archive');
            return false;
        }
        this._form.appendChild(this._archiveBtn);

        this._form.appendChild(document.createElement('hr'));

        this._log = document.createElement('div');
        this._form.appendChild(this._log);
        this._form.onsubmit = () => {
            super._emitSignal('submit');
            return false;
        };
    }

    get userDomain() {
        return this._userInput.value;
    }

    get ownerDomains() {
        return this._ownersInput.value.split(/[,\s]/).filter((x) => x !== '');
    }

    set ownerDomains(domains) {
        this._ownersInput.value = domains.join('\n');
    }

    get timeLimitSeconds() {
        return parseFloat(this._timeLimitInput.value) * 24 * 60 * 60;
    }

    get element() {
        return this._form;
    }

    mount() {
        this._log.innerHTML = '';
        this._log.appendChild(createDiv(
            __('Hello! This app can find posts made by a specific user.')));
        this._log.appendChild(createDiv(
            __('It uses the execute() method, which allows checking 25 posts per request')));
    }

    unmount() {
    }

    setLogText(text) {
        this._log.innerHTML = '';
        this._log.append(text);
    }
}
