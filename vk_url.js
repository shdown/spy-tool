export const vkEntityUrl = (id) => {
    if (id < 0)
        return `https://vk.com/public${-id}`;
    else
        return `https://vk.com/id${id}`;
};

export const vkPostUrl = (ownerId, postId) => {
    return `https://vk.com/wall${ownerId}_${postId}`;
};
