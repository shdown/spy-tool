export class ViewManager {
    constructor(rootElement) {
        this._rootElement = rootElement;
        this._currentView = null;
    }

    unshow() {
        if (this._currentView !== null) {
            this._currentView.element.remove();
            this._currentView.unmount();
            this._currentView = null;
        }
    }

    show(view) {
        this.unshow();
        view.mount();
        this._rootElement.appendChild(view.element);
        this._currentView = view;
    }
}
