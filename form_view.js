import { View } from "./view.js";

const makeDivWithHtml = (html) => {
    const result = document.createElement('div');
    result.innerHTML = html;
    return result;
};

export class FormView extends View {
    constructor() {
        super();
        this._form = document.createElement('form');

        this._form.appendChild(makeDivWithHtml(
            'ID пользователя или адрес страницы (например, <b>1</b> или <b>durov</b>):'));

        this._userInput = document.createElement('input');
        this._userInput.setAttribute('type', 'text');
        this._userInput.setAttribute('required', '1');
        this._form.appendChild(this._userInput);

        this._form.appendChild(document.createElement('hr'));

        this._form.appendChild(makeDivWithHtml(
            'Список пабликов, ID или адреса страниц; разделяйте запятыми, пробелами или ' +
            'переводами строки:'));

        this._ownersInput = document.createElement('textarea');
        this._ownersInput.setAttribute('required', '1');
        this._form.appendChild(this._ownersInput);

        this._getSubsBtn = document.createElement('input');
        this._getSubsBtn.setAttribute('type', 'button');
        this._getSubsBtn.setAttribute('value', 'Заполнить подписками пользователя');
        this._getSubsBtn.style = 'display: block;';
        this._getSubsBtn.onclick = () => {
            super._emitSignal('get-subs');
            return false;
        };
        this._form.appendChild(this._getSubsBtn);

        this._form.appendChild(document.createElement('hr'));

        this._form.appendChild(makeDivWithHtml(
            'Ограничение по времени, в днях:'));

        this._timeLimitInput = document.createElement('input');
        this._timeLimitInput.setAttribute('type', 'number');
        this._timeLimitInput.setAttribute('required', '1');
        this._timeLimitInput.setAttribute('value', '30');
        this._form.appendChild(this._timeLimitInput);

        this._form.appendChild(document.createElement('hr'));

        this._submitBtn = document.createElement('input');
        this._submitBtn.setAttribute('type', 'submit');
        this._submitBtn.setAttribute('value', 'Найти!');
        this._form.appendChild(this._submitBtn);

        this._archiveBtn = document.createElement('input');
        this._archiveBtn.setAttribute('type', 'button');
        this._archiveBtn.setAttribute('value', 'Архив');
        this._archiveBtn.onclick = () => {
            super._emitSignal('open-archive');
            return false;
        }
        this._form.appendChild(this._archiveBtn);

        this._form.appendChild(document.createElement('hr'));

        this._log = makeDivWithHtml('');
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
        this._log.innerHTML = (
            'Привет! Это — приложение для поиска постов или комментариев определённого ' +
            'пользователя. <br/> Оно использует метод <code>execute()</code>, который позволяет ' +
            'проверить 25 постов за один запрос.');
    }

    unmount() {
    }

    setLogContent(html) {
        this._log.innerHTML = html;
    }
}
