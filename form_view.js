import { View } from "./view.js";
import { __ } from "./gettext.js";
import { fromHtml } from "./utils.js";

const createFieldSet = () => {
    return fromHtml(`<fieldset></fieldset>`);
};

const createInput = (params) => {
    const inputId = params.what === undefined ? undefined : `fv-input-id-${params.what}`;

    if (params.label !== undefined) {
        const label = fromHtml('<label class="fv-input-label"></label>');
        if (inputId !== undefined)
            label.setAttribute('for', inputId);
        label.append(params.label);

        params.container.append(label);
    }

    let input;
    if (params.textarea) {
        input = fromHtml(`<textarea></textarea>`);
    } else {
        input = fromHtml(`<input type="text"></input>`);
    }
    if (inputId !== undefined)
        input.setAttribute('id', inputId);

    params.container.append(input);

    if (params.note !== undefined) {
        const note = fromHtml(`<div class="fv-input-note"></div>`);
        note.append(params.note);

        params.container.append(note);
    }

    if (params.extraAttributes !== undefined) {
        for (const attr in params.extraAttributes)
            input.setAttribute(attr, params.extraAttributes[attr]);
    }

    return input;
};

const createButton = (params) => {
    const btn = fromHtml(`<button></button>`);
    btn.append(params.value);

    if (params.kind !== undefined)
        btn.setAttribute('class', `fv-button-${params.kind}`);

    if (params.type !== undefined)
        btn.setAttribute('type', params.type);

    if (params.onclick !== undefined)
        btn.onclick = params.onclick;

    params.container.append(btn);
    return btn;
};

export class FormView extends View {
    constructor() {
        super();
        this._form = fromHtml('<form id="fv-form"></form>');

        {
            const fieldSet = createFieldSet();

            this._userInput = createInput({
                container: fieldSet,
                what: 'uid',
                label: __('User:'),
                note: __('ID or handle (for example, “1” or “durov”)'),
                extraAttributes: {
                    required: '1',
                },
            });

            this._form.appendChild(fieldSet);
        }

        {
            const fieldSet = createFieldSet();

            this._ownersInput = createInput({
                container: fieldSet,
                what: 'oids',
                label: __('Public list:'),
                note: __('IDs or handles; separate with commas, spaces or line feeds'),
                textarea: true,
                extraAttributes: {
                    required: '1',
                },
            });

            this._getSubsBtn = createButton({
                container: fieldSet,
                value: __('Fill with user subscriptions'),
                kind: 'get-subs',
                onclick: () => {
                    super._emitSignal('get-subs');
                    return false;
                },
            });

            this._form.appendChild(fieldSet);
        }

        {
            const fieldSet = createFieldSet();

            this._timeLimitInput = createInput({
                container: fieldSet,
                what: 'tl',
                label: __('Time limits, days:'),
                extraAttributes: {
                    type: 'number',
                    value: '30',
                    required: '1',
                },
            });

            this._form.appendChild(fieldSet);
        }

        {
            const fieldSet = createFieldSet();

            this._submitBtn = createButton({
                container: fieldSet,
                value: __('Find!'),
                kind: 'find',
                type: 'submit',
            });

            this._archiveBtn = createButton({
                container: fieldSet,
                value: __('Archive'),
                kind: 'open-archive',
                onclick: () => {
                    super._emitSignal('open-archive');
                    return false;
                },
            });

            this._form.appendChild(fieldSet);
        }

        this._log = fromHtml('<div class="fv-form-log-area"></div>');
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
            __('Hello! This app can find posts made by a specific user.'));
        this._log.append(document.createElement('br'));
        this._log.append(
            __('It uses the execute() method, which allows checking 25 posts per request'));
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
