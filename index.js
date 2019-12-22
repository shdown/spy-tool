import { __ } from './gettext.js';

import { sleepMillis, unduplicate } from './utils.js';
import { requestAccessToken } from './access_token.js';

import { VkRequest, Transport } from './vk_transport_connect.js';
import { VkApiSession, VkApiCancellation } from './vk_api.js';

import { findPosts, gatherStats } from './algo.js';

import { ChartController } from './chart_ctl.js';
import { ProgressEstimator } from './progress_estimator.js';

import { RateLimitedStorage } from './rate_limited_storage.js';
import { StatsStorage } from './stats_storage.js';
import { PostsStorage } from './posts_storage.js';

import { ViewManager } from './view_mgr.js';

import { LoadingView } from './loading_view.js';
import { FormView } from './form_view.js';
import { ProgressView } from './progress_view.js';
import { ResultsView } from './results_view.js';
import { ArchiveView } from './archive_view.js';

import { vkPostUrl } from "./vk_url.js";


const makeCallbackDispatcher = (callbacks) => {
    return async (what, arg) => {
        const fn = callbacks[what];
        if (fn === undefined)
            console.log(`No callback for "${what}": ${JSON.stringify(arg)}`);
        else
            await fn(arg);
    };
};


const asyncMain = async () => {
    const rootDiv = document.getElementById('root');
    const viewManager = new ViewManager(rootDiv);

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

    const progressView = new ProgressView();
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

        resolveConfig.logText(__('Gathering statistics…'));
        progressView.setProgress(0);
        const gatherResults = await gatherStats({
            oids: oidsToGatherStats,
            session: session,
            ignorePinned: resolveConfig.ignorePinned,
            callback: makeCallbackDispatcher({
                progress: async (datum) => {
                    progressView.setProgress(datum.numerator / datum.denominator);
                },
                error: async (datum) => {
                    const error = datum.error;
                    resolveConfig.logText(__('Error gathering statistics: {0}',
                                             `${error.name}: ${error.message}`));
                },
            }),
        });

        resolveConfig.logText(__('Saving results…'));
        progressView.setProgress(NaN);

        for (const oid in gatherResults) {
            const stats = gatherResults[oid];
            await statsStorage.setStats(parseInt(oid), stats, /*isApprox=*/true);
            result[oid] = stats;
        }

        return result;
    };

    const work = async (workConfig) => {
        session.setRateLimitCallback((reason) => {
            workConfig.logText(__('We are being too fast ({0})', reason));
        });

        workConfig.logText(__('Getting server time…'));
        const serverTime = await session.apiRequest('utils.getServerTime', {v: '5.101'});

        const timeLimit = workConfig.timeLimit;
        const sinceTimestamp = serverTime - timeLimit;

        workConfig.logText(__('Checking user…'));
        const uid = await resolveDomainToId(workConfig.userDomain);

        workConfig.logText(__('Checking public list…'));
        let oids = [];
        for (const domain of workConfig.publicDomains)
            oids.push(await resolveDomainToId(domain));
        oids = unduplicate(oids);

        const stats = await resolveStatsFor(oids, {
            ignorePinned: workConfig.ignorePinned,
            logText: workConfig.logText,
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

            let statusText = __('Searching in {0}/{1}…', `${i + 1}`, `${oids.length}`);
            if (result.length !== 0)
                statusText += __(' (found {0})', `${result.length}`);
            workConfig.logText(statusText);

            implicitDenominator -= ProgressEstimator.statsToExpectedCommentsCount(stat, timeLimit);

            const estimator = new ProgressEstimator();
            const chartCtl = new ChartController(30, progressView.chartView);

            const callbacks = {
                found: async (datum) => {
                    const link = vkPostUrl(oid, datum.postId);
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
                    workConfig.logText(__('Found: {0}', link));
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
                        progressView.setProgress(numerator / denominator);
                    }
                },
                error: async (datum) => {
                    const error = datum.error;
                    workConfig.logText(__('Error checking {0}: {1}',
                                          `${oid}_${datum.postId}`,
                                          `${error.name}: ${error.message}`));
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
            workConfig.logText(__('Saving results…'));
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
                    formView.setLogText(__('No subscriptions found!'));
                formView.ownerDomains = data;
            }).catch((err) => {
                formView.setLogText(__('Error: {0}', `${err.name}: ${err.message}`));
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
                progressView.setLogText(text);
            },
        };
        work(workConfig)
            .then((results) => {
                session.setCancelFlag(false);
                session.setRateLimitCallback(null);

                viewManager.show(resultsView);
                resultsView.setResults(results);
            }).catch((err) => {
                session.setCancelFlag(false);
                session.setRateLimitCallback(null);

                if (err instanceof VkApiCancellation) {
                    viewManager.show(formView);
                } else {
                    viewManager.show(resultsView);
                    resultsView.setError(__('Error: {0}', `${err.name}: ${err.message}`));
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
                formView.setLogText(__('Error: {0}', `${err.name}: ${err.message}`));
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


const installGlobalErrorHandler = () => {
    const rootDiv = document.getElementById('root');
    window.onerror = (errorMsg, url, lineNum, columnNum, errorObj) => {
        const text = document.createElement('div');
        text.append(`Error: ${errorMsg} @ ${url}:${lineNum}:${columnNum}`);
        text.style = 'color: red;';
        rootDiv.prepend(text);
        console.log('Error object:');
        console.log(errorObj);
        return false;
    };
};


document.addEventListener('DOMContentLoaded', () => {
    installGlobalErrorHandler();

    new VkRequest('VKWebAppInit', {}).schedule();

    asyncMain()
        .catch((err) => {
            throw err;
        });
});
