import { View } from "./view.js";
import { createAnchor } from "./utils.js";

const entityIdToLink = (id) => {
    if (id < 0)
        return `https://vk.com/public${-id}`;
    else
        return `https://vk.com/id${id}`;
};

const postDatumToLink = (datum) => {
    return `https://vk.com/wall${datum.ownerId}_${datum.postId}`;
};

const makeSpanWithHtml = (html) => {
    const span = document.createElement('span');
    span.innerHTML = html;
    return span;
};

export class ArchiveView extends View {
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
        this._inner = null;
    }

    _setInner(inner) {
        if (this._inner !== null)
            this._inner.remove();
        this._div.appendChild(inner);
        this._inner = inner;
    }

    setData(data) {
        const inner = document.createElement('div');
        if (data.size === 0) {
            inner.innerHTML = '<hr/>Архив пуст.';
        } else {
            for (const [entityId, posts] of data) {
                inner.appendChild(document.createElement('hr'));

                inner.appendChild(makeSpanWithHtml('Комментарии '));
                inner.appendChild(createAnchor(entityIdToLink(entityId)));
                inner.appendChild(makeSpanWithHtml(':<br/>'));

                const ul = document.createElement('ul');
                for (const post of posts) {
                    const li = document.createElement('li');
                    const a = createAnchor(postDatumToLink(post));
                    li.appendChild(a);
                    ul.appendChild(li);
                }
                inner.appendChild(ul);
            }
        }
        this._setInner(inner);
    }

    get element() {
        return this._div;
    }

    mount() {
    }

    unmount() {
    }
}
