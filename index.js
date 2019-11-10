import { VkRequest, vkSendRequest, Transport } from './vk_transport_connect.js';
import { VkApiSession } from './vk_api.js';
import { GLOBAL_CONFIG } from './global_config.js';
import { findPosts, gatherStats } from './algo.js';
import { ChartController } from './chart_ctl.js';
import { ChartPainter } from './chart_painter.js';
import { ProgressEstimator } from './progress_estimator.js';
import { ProgressPainter } from './progress_painter.js';
import { monotonicNowMillis, htmlEscape, unduplicate } from './utils.js';
import { StatsStorage } from './stats_storage.js';

const makeCallbackDispatcher = (callbacks) => {
    return (what, arg) => {
        const fn = callbacks[what];
        if (fn === undefined)
            console.log(`No callback for "${what}": ${JSON.stringify(arg)}`);
        else
            fn(arg);
    };
};

document.addEventListener('DOMContentLoaded', () => {
    new VkRequest('VKWebAppInit', {}).schedule();

    const rootDiv = document.getElementById('root');
    window.onerror = (errorMsg, url, lineNum, columnNum, errorObj) => {
        const span = document.createElement('span');
        span.innerHTML = htmlEscape(`Ошибка: ${errorMsg} @ ${url}:${lineNum}:${columnNum}`);
        span.style = 'color: red;';
        rootDiv.appendChild(span);
        console.log('Error object:');
        console.log(errorObj);
        return false;
    };

    const body = document.getElementsByTagName('body')[0];

    const transport = new Transport();
    const session = new VkApiSession(transport);

    const statsStorage = new StatsStorage();

    const getAccessToken = async (scope) => {
        const result = await vkSendRequest(
            'VKWebAppGetAuthToken',
            'VKWebAppAccessTokenReceived',
            'VKWebAppAccessTokenFailed',
            {app_id: GLOBAL_CONFIG.APP_ID, scope: scope});

        const splitPermissions = s => s ? s.split(',') : [];
        const isSubset = (a, b) => new Set([...a, ...b]).size === new Set(b).size;

        if (!isSubset(splitPermissions(scope), splitPermissions(result.scope)))
            throw new Error(`Requested scope "${scope}", got "${result.scope}"`);

        transport.setAccessToken(result.access_token);
    };

    const resolveDomainToId = async (domain) => {
        if (domain.match(/^-?\d+$/) !== null)
            return parseInt(domain);

        let m = domain.match(/^.*\/(.*)$/);
        if (m !== null)
            domain = m[1];

        const resp = await session.apiRequest('utils.resolveScreenName', {
            screen_name: domain,
            v: '5.103',
        });
        switch (resp.type) {
        case 'group':
        case 'public':
        case 'club':
            return -resp.object_id;
        case 'user':
            return resp.object_id;
        default:
            throw new Error(`Cannot resolve "${domain}": unknown object type "${resp.type}"`);
        }
    };

    const resultDiv = document.createElement('div');

    const workingDiv = document.createElement('div');
    const workingText = document.createElement('div');
    workingText.innerHTML = '…';
    const progressPainter = new ProgressPainter();
    progressPainter.element.style = 'display: block; width: 100%;';
    const chartPainter = new ChartPainter();
    workingDiv.appendChild(progressPainter.element);
    workingDiv.appendChild(chartPainter.element);
    workingDiv.appendChild(workingText);

    const form = document.createElement('form');
    const formLog = document.createElement('div');
    const appendInputToForm = props => {
        const elem = document.createElement(props.tag || 'input');
        if (props.type !== undefined)
            elem.setAttribute('type', props.type);
        if (props.required)
            elem.setAttribute('required', '1');
        if (props.value !== undefined)
            elem.setAttribute('value', props.value);
        if (props.label !== undefined) {
            const text = document.createElement('div');
            text.innerHTML = props.label;
            form.appendChild(text);
        }
        form.appendChild(elem);
        return elem;
    };

    const userIdInput = appendInputToForm({
        type: 'text',
        label: 'ID пользователя или адрес страницы (например, <b>1</b> или <b>durov</b>):',
        required: true,
    });
    form.appendChild(document.createElement('hr'));
    const ownerIdsInput = appendInputToForm({
        tag: 'textarea',
        label: 'Список пабликов, ID или адреса страниц; разделяйте запятыми, пробелами или переводами строки:',
        required: true,
    });
    const getSubscriptions = async (userDomain) => {
        await getAccessToken('');
        session.setRateLimitCallback(null);
        const uid = await resolveDomainToId(userDomain);
        const resp = await session.apiRequest('users.getSubscriptions', {
            user_id: uid,
            v: '5.103',
        });
        const result = [];
        for (const id of resp.users.items)
            result.push(id);
        for (const id of resp.groups.items)
            result.push(-id);
        return result;
    };
    form.appendChild(document.createElement('br'));
    const getSubsBtn = appendInputToForm({
        type: 'button',
        value: 'Заполнить подписками пользователя',
    });
    getSubsBtn.onclick = () => {
        getSubscriptions(userIdInput.value)
            .then(result => {
                if (result.length === 0)
                    formLog.innerHTML = `Подписок не найдено!`;
                ownerIdsInput.value = result.join('\n');
            })
            .catch(err => {
                formLog.innerHTML = `Ошибка: ${htmlEscape(err.name)}: ${htmlEscape(err.message)}`;
            });
        return false;
    };
    form.appendChild(document.createElement('hr'));
    const timeLimitInput = appendInputToForm({
        type: 'number',
        label: 'Ограничение по времени, в днях:',
        value: '30',
        required: true,
    });

    const resolveStatsFor = async (oids, resolveConfig) => {
        const result = {};

        const oidsToGatherStats = [];
        for (const oid of oids) {
            const stats = statsStorage.getStats(oid);
            if (stats === undefined)
                oidsToGatherStats.push(oid);
            else
                result[oid] = stats;
        }

        progressPainter.setRatio(0);
        const gatherResults = await gatherStats({
            oids: oidsToGatherStats,
            session: session,
            ignorePinned: resolveConfig.ignorePinned,
            callback: makeCallbackDispatcher({
                progress: datum => {
                    progressPainter.setRatio(datum.numerator / datum.denominator);
                },
            }),
        });
        progressPainter.reset();

        for (const oid in gatherResults) {
            const stats = gatherResults[oid];
            statsStorage.setStats(oid, stats);
            result[oid] = stats;
        }

        return result;
    };

    const work = async (workConfig) => {
        workConfig.logText('Получаю токен…');
        await getAccessToken('');

        session.setRateLimitCallback(reason => {
            workConfig.logText(`Умерим пыл (${reason})`);
        });

        workConfig.logText('Получаю время сервера…');
        const serverTime = await session.apiRequest('utils.getServerTime', {v: '5.101'});

        const timeLimit = workConfig.timeLimit;
        const sinceTimestamp = serverTime - timeLimit;

        workConfig.logText('Проверяю пользователя…');
        const uid = await resolveDomainToId(workConfig.userDomain);

        workConfig.logText('Проверяю список пабликов…');
        let oids = [];
        for (const domain of workConfig.publicDomains)
            oids.push(await resolveDomainToId(domain));
        oids = unduplicate(oids);

        workConfig.logText('Собираю статистику…');
        const stats = await resolveStatsFor(oids, {
            ignorePinned: workConfig.ignorePinned,
        });

        let implicitNumerator = 0;

        let implicitDenominator = 0;
        for (const oid in stats)
            implicitDenominator += ProgressEstimator.statsToExpectedCommentsCount(
                stats[oid], timeLimit);

        const result = [];

        for (let i = 0; i < oids.length; ++i) {
            const oid = oids[i];
            const stat = stats[oid];
            if (stat === undefined)
                continue;

            workConfig.logText(
                result.length === 0
                    ? `Ищу в ${i + 1}/${oids.length}`
                    : `Ищу в ${i + 1}/${oids.length} (найдено ${result.length})`);

            implicitDenominator -= ProgressEstimator.statsToExpectedCommentsCount(stat, timeLimit);

            const estimator = new ProgressEstimator();
            chartPainter.reset();
            const chartCtl = new ChartController(30, chartPainter);

            const callbacks = {
                found: datum => {
                    const link = `https://vk.com/wall${oid}_${datum.postId}`;
                    result.push({
                        link: link,
                        offset: datum.offset,
                    });
                    workConfig.logText(`Найдено: ${link}`);
                },
                infoAdd: datum => {
                    chartCtl.handleAdd(datum);
                    estimator.handleAdd(datum);
                },
                infoUpdate: datum => {
                    chartCtl.handleUpdate(datum);
                    estimator.handleUpdate(datum);
                },
                infoFlush: _ => {
                    chartCtl.handleFlush();

                    const explicitNumerator = estimator.getDoneCommentsNumber();
                    const explicitDenominator = ProgressEstimator.statsToExpectedCommentsCount(
                        estimator.getStats(), timeLimit);
                    const numerator = explicitNumerator + implicitNumerator;
                    const denominator = explicitDenominator + implicitDenominator;
                    progressPainter.setRatio(numerator / denominator);
                },
                error: datum => {
                    const error = datum.error;
                    workConfig.logText(`Ошибка при проверке ${oid}_${datum.postId}: ${error.name}: ${error.message}`);
                    console.log('error callback payload:');
                    console.log(error);
                },
            };

            await findPosts({
                session: session,
                oid: oid,
                uid: uid,
                sinceTimestamp: sinceTimestamp,
                ignorePinned: workConfig.ignorePinned,
                callback: makeCallbackDispatcher(callbacks),
            });

            const commentsChecked = estimator.getDoneCommentsNumber();
            implicitNumerator += commentsChecked;
            implicitDenominator += commentsChecked;
            statsStorage.setStats(oid, estimator.getStats());
        }

        return result;
    };

    form.appendChild(document.createElement('hr'));
    appendInputToForm({type: 'submit'});
    form.appendChild(document.createElement('hr'));
    form.appendChild(formLog);
    form.onsubmit = () => {
        const workConfig = {
            userDomain: userIdInput.value,
            publicDomains: ownerIdsInput.value
                .split(/[,\s]/)
                .filter(domain => domain !== ''),
            timeLimit: parseFloat(timeLimitInput.value) * 24 * 60 * 60,
            ignorePinned: false,
            logText: text => {
                workingText.innerHTML = htmlEscape(text);
            },
            logHTML: html => {
                workingText.innerHTML = html;
            },
        };

        form.remove();
        body.appendChild(workingDiv);

        work(workConfig)
            .then(result => {
                console.log('Done');

                workingDiv.remove();
                body.appendChild(resultDiv);

                if (result.length === 0) {
                    resultDiv.innerHTML = 'Ничего не найдено! 😢';
                } else {
                    resultDiv.innerHTML = 'Найдены посты:<br/>';
                    const ul = document.createElement('ul');
                    for (const datum of result) {
                        const a = document.createElement('a');
                        a.setAttribute('href', datum.link);
                        a.setAttribute('rel', 'noopener noreferrer');
                        a.setAttribute('target', '_blank');
                        a.innerHTML = htmlEscape(datum.link);
                        const li = document.createElement('li');
                        li.appendChild(a);
                        ul.appendChild(li);
                    }
                    resultDiv.appendChild(ul);
                }
            })
            .catch(err => {
                console.log(err);

                workingDiv.remove();
                body.appendChild(resultDiv);

                resultDiv.innerHTML = `Произошла ошибка: ${htmlEscape(err.name)}: ${htmlEscape(err.message)}`;
            });
        return false;
    };

    body.appendChild(form);
});
