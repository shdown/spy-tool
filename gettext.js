const trnRu = {
    'Another operation is in progress — please wait!': 'Другая операция ещё выполняется; пожалуйста, дождитесь её завершения.',
    'Archive is empty.': 'Архив пуст.',
    'Archive': 'Архив',
    'Back': 'Назад',
    'Cancel': 'Отмена',
    'Checking public list…': 'Проверяю список пабликов…',
    'Checking user…': 'Проверяю пользователя…',
    'Comments by ': 'Комментарии ',
    'Error: {0}': 'Ошибка: {0}',
    'Error checking {0} at {1}: {2}': 'Ошибка проверки {0} при {1}: {2}',
    'Error gathering statistics: {0}': 'Ошибка при сборе статистики: {0}',
    'Fill with user subscriptions': 'Заполнить подписками пользователя',
    'Find!': 'Найти!',
    '  (found {0})': ' (найдено {0})',
    'Found: {0}': 'Найдено: {0}',
    'Gathering statistics…': 'Собираю статистику…',
    'Getting server time…': 'Получаю время сервера…',
    'Hello! This app can find comments left by a specific user.': 'Привет! Это — приложение для поиска комментариев определённого пользователя.',
    'ID or handle (for example, “1” or “durov”)': 'ID или адрес страницы (например, “1” или “durov”)',
    'IDs or handles; separate with commas, spaces or line feeds': 'ID или адреса страниц; разделяйте запятыми, пробелами или переводами строки',
    'It uses the “execute()” method, which allows checking 25 posts per request.': 'Оно использует метод “execute()”, который позволяет проверять 25 постов за один запрос.',
    'Loading…': 'Загрузка…',
    ' (new)': ' (новый)',
    'No subscriptions found!': 'Подписок не найдено!',
    'Nothing found! 😢': 'Ничего не найдено! 😢',
    ' (old)': ' (старый)',
    'Posts found:': 'Найдены посты:',
    'Public list:': 'Список пабликов:',
    'Saving results…': 'Сохраняю результаты…',
    'Searching in {0}/{1}…': 'Ищу в {0}/{1}…',
    'Time limit, days:': 'Ограничение по времени, в днях:',
    'User:': 'Пользователь:',
    'Skip gathering statistics': 'Пропустить сбор статистики',
    'We are being too fast ({0})': 'Умерим пыл ({0})',
    'Reload': 'Перезапуск',
};

const translations = {
    ru: trnRu,
    ua: trnRu,
    by: trnRu,
};

const selectTranslation = (langTag) => {
    // See RFC 4646.
    if (typeof(langTag) !== 'string')
        return undefined;
    const m = langTag.toLowerCase().match(/^[a-z]+/);
    if (m === null)
        return undefined;
    return translations[m[0]];
};

const translation = selectTranslation(navigator.language || navigator.userLanguage) || {};

export const __ = (text, ...args) => {
    let pattern = translation[text];
    if (pattern === undefined)
        pattern = text;
    return pattern.replace(/{([0-9]+)}/g, (m) => args[m[1]]);
};
