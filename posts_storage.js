import { encodeManyIntegers, decodeManyIntegers } from './intcodec.js';

export class PostsStorage {
    constructor(storage) {
        this._storage = storage;
        this._data = null;
    }

    async _fetchDataIfNeeded() {
        if (this._data !== null)
            return;
        this._data = new Map();
        const entries = await this._storage.read('p');
        for (const entry of entries) {
            const [userId, ownerId, postId, commentId] = decodeManyIntegers(entry);

            let set = this._data.get(userId);
            if (set === undefined) {
                set = new Set();
                this._data.set(userId, set);
            }

            set.add(`${ownerId},${postId},${commentId}`);
        }
    }

    async getUsers() {
        await this._fetchDataIfNeeded();
        const keysCopy = [...this._data.keys()];
        keysCopy.reverse();
        return keysCopy;
    }

    async getUserPosts(userId) {
        await this._fetchDataIfNeeded();
        const set = this._data.get(userId);
        if (set === undefined)
            return [];

        const result = [];
        for (const setValue of set) {
            const [ownerId, postId, commentId] = setValue.split(',').map(x => parseInt(x));
            result.push({ownerId: ownerId, postId: postId, commentId: commentId});
        }
        return result;
    }

    async addPost(userId, datum) {
        await this._fetchDataIfNeeded();

        const setValue = `${datum.ownerId},${datum.postId},${datum.commentId}`;
        let set = this._data.get(userId);
        if (set === undefined) {
            set = new Set();
            this._data.set(userId, set);
        } else {
            if (set.has(setValue))
                return false;
        }
        set.add(setValue);

        const entry = encodeManyIntegers([userId, datum.ownerId, datum.postId, datum.commentId]);
        await this._storage.write('p', entry);
        return true;
    }
}
