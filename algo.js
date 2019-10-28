import { VkApiError } from './vk_api.js';

const checkMultiplePosts = async (runtimeConfig, config, callback) => {
    const code = `\
var posts = API.wall.get({owner_id: ${config.oid}, offset: ${runtimeConfig.offset}, count: ${runtimeConfig.postsPerRequest}}).items;
if (posts.length == 0) {
    return [0, -1, [], []];
}
var too_big = [], result = [];
var i = 0;
while (i < posts.length) {
    if (posts[i].from_id == ${config.uid}) {
        result.push(posts[i].id);
        result.push(0);
    }
    var posters = API.wall.getComments({owner_id: ${config.oid}, post_id: posts[i].id, need_likes: 0, count: ${config.commentsPerRequest}, extended: 1, thread_items_count: 10}).profiles@.id;
    var j = 0, found = false;
    while (!found && j < posters.length) {
        found = posters[j] == ${config.uid};
        j = j + 1;
    }
    if (found) {
        result.push(posts[i].id);
        result.push(j);
    } else {
        if (posts[i].comments.count > ${config.commentsPerRequest}) {
            too_big.push(posts[i].id);
        }
    }
    i = i + 1;
}
return [posts.length, posts[posts.length-1].date, too_big, result];`;
    return await config.session.apiRequest('execute', {code: code, v: '5.101'});
};

const checkSinglePost = async (postConfig, config, callback) => {
    callback('single-post-with-execute', postConfig.postId);
    const MAX_COMMENTS = 1000;
    const code = `\
var offset = 0, brk = false, found = false, result = 0;
while (!brk) {
    var posters = API.wall.getComments({owner_id: ${config.oid}, post_id: ${postConfig.postId}, need_likes: 0, count: ${MAX_COMMENTS}, offset: offset, extended: 1});
    offset = offset + ${MAX_COMMENTS};
    brk = offset >= posters.count;
    posters = posters.profiles@.id;
    var i = 0;
    while (!found && i < posters.length) {
        found = posters[i] == ${config.uid};
        i = i + 1;
    }
    if (found) {
        brk = true;
        result = i;
    }
}
return [result];`;
    const result = await config.session.apiRequest('execute', {code: code, v: '5.101'});
    return result[0] ? {postId: postConfig.postId, commentNo: result[0]} : null;
};

const checkSinglePostManually = async (postConfig, config, callback) => {
    callback('single-post-manually', postConfig.postId);
    const MAX_COMMENTS = 100;
    let offset = 0;
    while (true) {
        const result = await config.session.apiRequest('wall.getComments', {
            owner_id: config.oid,
            thread_items_count: 10,
            post_id: postConfig.postId,
            need_likes: 0,
            count: MAX_COMMENTS,
            offset: offset,
            extended: 1,
            v: '5.101',
        });
        for (let i = 0; i < result.profiles.length; ++i) // const index in result.profiles)
            if (result.profiles[i].id === config.uid)
                return {postId: postConfig.postId, commentNo: offset + i + 1};
        offset += MAX_COMMENTS;
        if (offset >= result.count)
            break;
    }
    return null;
};

const searchOneOff = async (runtimeConfig, config, callback) => {
    callback('check-one-off', runtimeConfig.offset);
    const result = await config.session.apiRequest('wall.get', {
        owner_id: config.oid,
        offset: runtimeConfig.offset,
        count: 1,
        v: '5.101',
    });
    if (result.items.length === 0) {
        callback('last', 'no-more-posts');
        return false;
    }

    if (result.items[0].from_id === config.uid) {
        callback('found', {postId: postId, commentNo: 0});
    } else {
        const postId = result.items[0].id;
        const datum = checkSinglePostManually({postId: postId}, config, callback);
        if (datum !== null)
            callback('found', datum);
    }
    runtimeConfig.offset += 1;
    return true;
};

const searchPostsIteration = async (runtimeConfig, config, callback) => {
    callback('offset', runtimeConfig.offset);

    let result;
    try {
        result = await checkMultiplePosts(runtimeConfig, config, callback);
    } catch (err) {
        if (!(err instanceof VkApiError))
            throw err;
        if (err.code === 13 && /too many operations/i.test(err.msg)) {
            runtimeConfig.postsPerRequest = config.pprAdjustFunc(runtimeConfig.postsPerRequest);
            callback('ppr', runtimeConfig.postsPerRequest);
            return true;
        } else {
            await callback.retrowOrIgnore(err);
            // try to check the next post manually instead
            try {
                return await checkOneOff(runtimeConfig, config, callback);
            } catch (err) {
                if (!(err instanceof VkApiError))
                    throw err;
                await callback.retrowOrIgnore(err);
                // skip this one
                runtimeConfig.offset += 1;
                return true;
            }
        }
    }

    const [numTotalPosts, lastDate, tooBigIds, data] = result;
    callback('last-date', lastDate);

    for (let i = 0; i < data.length; i += 2)
        callback('found', {postId: data[i], commentNo: data[i + 1]});

    for (const postId of tooBigIds) {
        const postConfig = {postId: postId};
        let datum;
        try {
            datum = await checkSinglePost(postConfig, config, callback);
        } catch (err) {
            if (!(err instanceof VkApiError))
                throw err;
            if (err.code === 13 && /too many (operations|api calls)/i.test(err.msg)) {
                try {
                    datum = await checkSinglePostManually(postConfig, config, callback);
                } catch (err) {
                    if (!(err instanceof VkApiError))
                        throw err;
                    // skip this one
                    await callback.retrowOrIgnore(err);
                    continue;
                }
            } else {
                // skip this one
                await callback.retrowOrIgnore(err);
                continue;
            }
        }
        if (datum !== null)
            callback('found', datum);
    }

    if (numTotalPosts < runtimeConfig.postsPerRequest) {
        callback('last', 'no-more-posts');
        return false;
    }
    if (lastDate <= config.timeLimit) {
        callback('last', 'time-limit-reached');
        return false;
    }
    runtimeConfig.offset += runtimeConfig.postsPerRequest;
    return true;
};

export const searchPosts = async (config, callback) => {
    const runtimeConfig = {offset: 0, postsPerRequest: config.pprInitial};
    while (await searchPostsIteration(runtimeConfig, config, callback)) {}
};
