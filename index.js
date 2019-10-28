import { VkRequest, vkSendRequest } from './vk_request.js';
import { VkApiSession } from './vk_api.js';
import { htmlEscape } from './html_escape.js';
import { config } from './config.js';
import { searchPosts } from './algo.js';

document.addEventListener('DOMContentLoaded', () => {
    new VkRequest('VKWebAppInit', {}).schedule();
    const session = new VkApiSession();

    const body = document.getElementsByTagName('body')[0];

    const logArea = document.createElement('div');
    const resetLogArea = () => {
        logArea.innerHTML = '<hr/><b>Log area:</b>';
        const clearBtn = document.createElement('input');
        clearBtn.setAttribute('type', 'button');
        clearBtn.setAttribute('value', 'Clear');
        clearBtn.onclick = () => {
            resetLogArea();
            return false;
        };
        logArea.appendChild(clearBtn);
    };
    resetLogArea();

    const say = what => {
        const line = document.createElement('div');
        line.innerHTML = htmlEscape(what);
        logArea.appendChild(line);
        return line;
    };

    const getAccessToken = async (scope) => {
        say('Requesting access token...');
        const result = await vkSendRequest(
            'VKWebAppGetAuthToken',
            'VKWebAppAccessTokenReceived',
            'VKWebAppAccessTokenFailed',
            {app_id: config.APP_ID, scope: scope});

        const splitPermissions = s => s ? s.split(',') : [];
        const isSubset = (a, b) => new Set([...a, ...b]).size == new Set(b).size;

        if (!isSubset(splitPermissions(scope), splitPermissions(result.scope)))
            throw new Error(`Requested scope "${scope}", got "${result.scope}"`);

        return result.access_token;
    };

    const work = async (uid, gid, tl_days) => {
        session.setAccessToken(await getAccessToken(''));
        session.setRateLimitCallback(what => {
            say(`We are being too fast (${what})!`);
        });
        say('Getting server time...');
        const [serverTime] = await session.apiRequest('execute', {
            code: 'return [API.utils.getServerTime()];',
            v: '5.101',
        });
        const config = {
            session: session,
            oid: gid,
            uid: uid,
            commentsPerRequest: 150,
            pprInitial: 24,
            pprAdjustFunc: n => Math.max(1, n - 2),
            timeLimit: serverTime - tl_days * 24 * 60 * 60,
            rethrowOrIgnore: async err => {
                // TODO
                throw err;
            },
        };
        say('Transferring control to searchPosts()...');
        await searchPosts(config, (what, data) => {
            if (what === 'found') {
                say(`FOUND: https://vk.com/wall${gid}_${data.postId} (comment ${data.commentNo})`);
            } else {
                say(`callback: ${what}: ${data}`);
            }
        });
    };

    const form = document.createElement('form');

    const uid_div = document.createElement('div');
    uid_div.innerHTML = 'User ID: ';

    const uid_input = document.createElement('input');
    uid_input.setAttribute('type', 'number');
    uid_input.setAttribute('required', '1');

    const gid_div = document.createElement('div');
    gid_div.innerHTML = 'Group ID: ';

    const gid_input = document.createElement('input');
    gid_input.setAttribute('type', 'number');
    gid_input.setAttribute('required', '1');

    const tl_div = document.createElement('div');
    tl_div.innerHTML = 'Time limit (days): ';

    const tl_input = document.createElement('input');
    tl_input.setAttribute('type', 'number');
    tl_input.setAttribute('value', '7');
    tl_input.setAttribute('required', '1');

    const btn_div = document.createElement('div');

    const submitBtn = document.createElement('input');
    submitBtn.setAttribute('type', 'submit');

    const cancelBtn = document.createElement('input');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.setAttribute('value', 'Cancel');
    cancelBtn.onclick = () => {
        session.cancel();
        return false;
    };

    form.onsubmit = () => {
        const uid = parseInt(uid_input.value);
        const gid = parseInt(gid_input.value);
        const tl = parseFloat(tl_input.value);

        work(uid, gid, tl)
            .then(() => {
                say('Done...');
            })
            .catch(err => {
                // TODO check if it's cancellation
                say(`ERROR: ${err.name}: ${err.message}`);
                console.log(err);
            });

        // Do not reload the page!
        return false;
    };

    uid_div.appendChild(uid_input);
    gid_div.appendChild(gid_input);
    tl_div.appendChild(tl_input);
    btn_div.appendChild(submitBtn);
    btn_div.appendChild(cancelBtn);

    form.appendChild(uid_div);
    form.appendChild(gid_div);
    form.appendChild(tl_div);
    form.appendChild(btn_div);

    body.appendChild(form);
    body.appendChild(logArea);

    say('Initialized');
});
