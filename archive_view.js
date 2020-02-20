import { View } from "./view.js";
import { vkEntityUrl, vkPostUrl } from "./vk_url.js";
import { createAnchor } from "./utils.js";
import { __ } from "./gettext.js";

export class ArchiveView extends View {
    constructor() {
        super();
        this._div = document.createElement('div');
        this._backBtn = document.createElement('input');
        this._backBtn.setAttribute('type', 'button');
        this._backBtn.setAttribute('class', 'av-button-back');
        this._backBtn.setAttribute('value', __('Back'));
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
            inner.appendChild(document.createElement('hr'));
            inner.append(__('Archive is empty.'));
        } else {
            for (const [entityId, postData] of data) {
                inner.appendChild(document.createElement('hr'));

                inner.append(__('Comments by '));
                inner.appendChild(createAnchor(vkEntityUrl(entityId)));
                inner.appendChild(document.createElement('br'));

                const ul = document.createElement('ul');
                for (const postDatum of postData) {
                    const li = document.createElement('li');
                    const a = createAnchor(vkPostUrl(postDatum.ownerId, postDatum.postId));
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
