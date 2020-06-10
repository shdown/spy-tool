import { View } from "./view.js";
import { __ } from "./gettext.js";
import { fromHtml } from "./utils.js";

class InputField {
    constructor(allElements, mainElement) {
        this.allElements = allElements;
        this.mainElement = mainElement;
    }
}

const makeInputField = (params) => {
    const all = [];

    if (params.label !== undefined) {
        const label = fromHtml('<label class="fv-input-label"></label>');
        label.setAttribute('for', params.id);
        label.append(params.label);
        all.push(label);
    }

    let input;
    if (params.textarea) {
        input = fromHtml(`<textarea></textarea>`);
    } else {
        input = fromHtml(`<input type="text"></input>`);
    }
    input.setAttribute('id', params.id);
    all.push(input);

    if (params.note !== undefined) {
        const note = fromHtml(`<div class="fv-input-note"></div>`);
        note.append(params.note);
        all.push(note);
    }

    if (params.extraAttributes !== undefined) {
        for (const attr in params.extraAttributes) {
            input.setAttribute(attr, params.extraAttributes[attr]);
        }
    }

    return new InputField(all, input);
};

const createButton = (params) => {
    const btn = fromHtml('<button></button>');
    btn.setAttribute('id', params.id);
    btn.append(params.text);

    if (params.type !== undefined)
        btn.setAttribute('type', params.type);

    if (params.clickHandler !== undefined)
        btn.onclick = params.clickHandler;

    return btn;
};

const createFieldSet = (children) => {
    const f = fromHtml('<fieldset></fieldset>');
    for (const c of children) {
        if (c instanceof InputField) {
            for (const elem of c.allElements) {
                f.appendChild(elem);
            }
        } else {
            f.appendChild(c);
        }
    }
    return f;
};

export class FormView extends View {
    constructor() {
        super();

        const userInputField = makeInputField({
            id: 'fv-input-id-uid',
            label: __('User:'),
            note: __('ID or handle (for example, “1” or “durov”)'),
            extraAttributes: {
                required: '1',
            },
        });
        this._userInput = userInputField.mainElement;

        const ownersInputField = makeInputField({
            id: 'fv-input-id-oids',
            label: __('Public list:'),
            note: __('IDs or handles; separate with commas, spaces or line feeds'),
            textarea: true,
            extraAttributes: {
                required: '1',
            },
        });
        this._ownersInput = ownersInputField.mainElement;

        const getSubsBtn = createButton({
            id: 'fv-button-get-subs',
            text: __('Fill with user subscriptions'),
            clickHandler: () => {
                super._emitSignal('get-subs');
                return false;
            },
        });

        const timeLimitInputField = makeInputField({
            id: 'fv-input-id-tl',
            label: __('Time limit, days:'),
            extraAttributes: {
                type: 'number',
                value: '30',
                required: '1',
            },
        });
        this._timeLimitInput = timeLimitInputField.mainElement;

        const submitBtn = createButton({
            id: 'fv-button-find',
            text: __('Find!'),
            type: 'submit',
        });

        const archveBtn = createButton({
            id: 'fv-button-open-archive',
            text: __('Archive'),
            clickHandler: () => {
                super._emitSignal('open-archive');
                return false;
            },
        });

        const reloadBtn = createButton({
            id: 'fv-button-reload',
            text: __('Reload'),
            clickHandler: () => {
                super._emitSignal('reload');
                return false;
            },
        });

        this._log = fromHtml('<div class="fv-form-log-area"></div>');

        this._form = fromHtml('<form id="fv-form"></form>');
        this._form.appendChild(createFieldSet([
            userInputField,
        ]));
        this._form.appendChild(createFieldSet([
            ownersInputField,
            getSubsBtn,
        ]));
        this._form.appendChild(createFieldSet([
            timeLimitInputField,
        ]));
        this._form.appendChild(createFieldSet([
            submitBtn,
            archveBtn,
            reloadBtn,
        ]));
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
        this._log.append(
            __('Hello! This app can find comments left by a specific user.'));
        this._log.append(document.createElement('br'));
        this._log.append(
            __('It uses the “execute()” method, which allows checking 25 posts per request.'));
    }

    unmount() {
    }

    setLogText(text, tone = 'info') {
        this._log.innerHTML = '';
        let alertClass;
        switch (tone) {
        case 'warning':
            alertClass = 'warning';
            break;
        case 'error':
            alertClass = 'error';
            break;
        case 'info':
        default:
            alertClass = 'info';
            break;
        }
        const alertDiv = fromHtml(`<div role="alert"></div>`);
        alertDiv.setAttribute('class', alertClass);
        alertDiv.append(text);
        this._log.append(alertDiv);
    }
}
