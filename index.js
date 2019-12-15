import { sleepMillis, htmlEscape, unduplicate } from './utils.js';
import { GLOBAL_CONFIG } from './global_config.js';

import { VkRequest, vkSendRequest, Transport } from './vk_transport_connect.js';
import { VkApiSession, VkApiCancellation } from './vk_api.js';

import { findPosts, gatherStats } from './algo.js';

import { ChartController } from './chart_ctl.js';
import { ChartPainter } from './chart_painter.js';

import { ProgressEstimator } from './progress_estimator.js';
import { ProgressPainter } from './progress_painter.js';

import { RateLimitedStorage } from './rate_limited_storage.js';
import { StatsStorage } from './stats_storage.js';
import { PostsStorage } from './posts_storage.js';

import { ViewManager } from './view_mgr.js';

import { LoadingView } from './loading_view.js';
import { FormView } from './form_view.js';
import { ProgressView } from './progress_view.js';
import { ResultsView } from './results_view.js';
import { ArchiveView } from './archive_view.js';


const makeCallbackDispatcher = (callbacks) => {
    return async (what, arg) => {
        const fn = callbacks[what];
        if (fn === undefined)
            console.log(`No callback for "${what}": ${JSON.stringify(arg)}`);
        else
            await fn(arg);
    };
};

const requestAccessToken = async (scope) => {
    const result = await vkSendRequest(
        'VKWebAppGetAuthToken',
        'VKWebAppAccessTokenReceived',
        'VKWebAppAccessTokenFailed',
        {app_id: GLOBAL_CONFIG.APP_ID, scope: scope});

    const splitPermissions = (s) => s ? s.split(',') : [];
    const isSubset = (a, b) => new Set([...a, ...b]).size === new Set(b).size;

    if (!isSubset(splitPermissions(scope), splitPermissions(result.scope)))
        throw new Error(`Requested scope "${scope}", got "${result.scope}"`);

    return result.access_token;
};

const installGlobalErrorHandler = () => {
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
};

const asyncMain = async () => {
    installGlobalErrorHandler();
    const body = document.getElementsByTagName('body')[0];
    const viewManager = new ViewManager(body);

    const loadingView = new LoadingView();
    viewManager.show(loadingView);

    const transport = new Transport();
    transport.setAccessToken(await requestAccessToken(/*scope=*/''));
    const session = new VkApiSession(transport);

    const storage = new RateLimitedStorage(
        /*limits=*/{
            /*stats*/s: 400,
            /*posts*/p: 600,
        },
        session);
    const statsStorage = new StatsStorage(storage);
    const postsStorage = new PostsStorage(storage);

    const progressPainter = new ProgressPainter();
    const chartPainter = new ChartPainter();

    const progressView = new ProgressView(progressPainter, chartPainter);
    const resultsView = new ResultsView();
    const formView = new FormView();
    const archiveView = new ArchiveView();

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

    const getSubscriptions = async (userDomain) => {
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

    const resolveStatsFor = async (oids, resolveConfig) => {
        const result = {};

        const oidsToGatherStats = [];
        for (const oid of oids) {
            const stats = await statsStorage.getStats(oid);
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
                progress: async (datum) => {
                    progressPainter.setRatio(datum.numerator / datum.denominator);
                },
            }),
        });
        progressPainter.reset();

        for (const oid in gatherResults) {
            const stats = gatherResults[oid];
            await statsStorage.setStats(parseInt(oid), stats, /*isApprox=*/true);
            result[oid] = stats;
        }

        return result;
    };

    const work = async (workConfig) => {
        workConfig.logText('Получаю токен…');

        session.setRateLimitCallback((reason) => {
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
                found: async (datum) => {
                    const link = `https://vk.com/wall${oid}_${datum.postId}`;
                    const isNew = await postsStorage.addPost(
                        uid,
                        {
                            ownerId: oid,
                            postId: datum.postId,
                            commentId: -1,
                        }
                    );
                    result.push({
                        link: link,
                        offset: datum.offset,
                        isNew: isNew,
                    });
                    workConfig.logText(`Найдено: ${link}`);
                },
                infoAdd: async (datum) => {
                    chartCtl.handleAdd(datum);
                    estimator.handleAdd(datum);
                },
                infoUpdate: async (datum) => {
                    chartCtl.handleUpdate(datum);
                    estimator.handleUpdate(datum);
                },
                infoFlush: async (_) => {
                    chartCtl.handleFlush();

                    const currentStats = estimator.getStats();
                    if (currentStats !== undefined) {
                        const explicitNumerator = estimator.getDoneCommentsNumber();
                        const explicitDenominator = ProgressEstimator.statsToExpectedCommentsCount(
                            currentStats, timeLimit);
                        const numerator = explicitNumerator + implicitNumerator;
                        const denominator = explicitDenominator + implicitDenominator;
                        progressPainter.setRatio(numerator / denominator);
                    }
                },
                error: async (datum) => {
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

            const actualStats = estimator.getStats();
            if (actualStats !== undefined)
                await statsStorage.setStats(parseInt(oid), actualStats, /*isApprox=*/false);
        }

        while (storage.hasSomethingToFlush()) {
            workConfig.logText('Сохраняю результаты…');
            await sleepMillis(200);
            await storage.flush();
        }

        return result;
    };

    const readArchive = async () => {
        const result = new Map();
        const userIds = await postsStorage.getUsers();
        for (const userId of userIds)
            result.set(userId, await postsStorage.getUserPosts(userId));
        return result;
    };

    formView.subscribe('get-subs', () => {
        getSubscriptions(formView.userDomain)
            .then((data) => {
                if (data.length === 0)
                    formView.setLogContent('Подписок не найдено!');
                formView.ownerDomains = data;
            }).catch((err) => {
                formView.setLogContent(htmlEscape(`Ошибка: ${err.name}: ${err.message}`));
            });
    });
    formView.subscribe('submit', () => {
        viewManager.show(progressView);

        const workConfig = {
            userDomain: formView.userDomain,
            publicDomains: formView.ownerDomains,
            timeLimit: formView.timeLimitSeconds,
            ignorePinned: false,
            logText: (text) => {
                progressView.setLogContent(htmlEscape(text));
            },
        };
        work(workConfig)
            .then((results) => {
                session.setCancelFlag(false);

                viewManager.show(resultsView);
                resultsView.setResults(results);
            }).catch((err) => {
                session.setCancelFlag(false);

                if (err instanceof VkApiCancellation) {
                    viewManager.show(formView);
                } else {
                    viewManager.show(resultsView);
                    resultsView.setError(`Ошибка: ${err.name}: ${err.message}`);
                }
            });
    });

    formView.subscribe('open-archive', () => {
        viewManager.show(loadingView);

        readArchive()
            .then((data) => {
                viewManager.show(archiveView);
                archiveView.setData(data);
            }).catch((err) => {
                viewManager.show(formView);
                formView.setLogContent(htmlEscape(`Ошибка: ${err.name}: ${err.message}`));
            });
    });
    archiveView.subscribe('back', () => {
        viewManager.show(formView);
    });
    resultsView.subscribe('back', () => {
        viewManager.show(formView);
    });
    progressView.subscribe('cancel', () => {
        session.setCancelFlag(true);
    });

    viewManager.show(formView);
};

document.addEventListener('DOMContentLoaded', () => {
    new VkRequest('VKWebAppInit', {}).schedule();
    asyncMain()
        .catch((err) => {
            throw err;
        });
});
