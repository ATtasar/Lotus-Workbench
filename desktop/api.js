// Same-origin HTTP client. No business records or credentials are written to
// localStorage/IndexedDB. LAN authentication uses an HttpOnly device cookie.
const config = window.LOTUS_CONFIG || {};
export const localAccess = config.localAccess ?? location.hostname === '127.0.0.1';
const base = new URL(config.apiBase || '/local-api/', location.origin);
if (base.origin !== location.origin) throw new Error('API 必须与当前电脑工作台同源。');
if (!base.pathname.endsWith('/')) base.pathname += '/';
let token, connecting;
async function raw(endpoint, body, withToken = true) {
  let response;
  try {
    response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Lotus-Local': '1',
        ...(withToken && token ? { 'X-Lotus-Token': token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(
      error.name === 'TimeoutError'
        ? '连接电脑超时，修改尚未确认保存。请保留页面或导出备份。'
        : '无法连接电脑，修改尚未确认保存。请检查电脑服务和 Wi-Fi。',
    );
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('电脑服务响应不正确，请运行最新版安装脚本后重试。');
  }
  return { response, value };
}
function failure(result) {
  return Object.assign(new Error(result.value.message || '电脑数据操作失败。'), {
    status: result.response.status,
  });
}
async function pair() {
  return new Promise((resolve, reject) => {
    const root = document.querySelector('#modal-root');
    root.innerHTML =
      '<div class="modal-backdrop"><section class="modal narrow" role="dialog" aria-modal="true" aria-label="连接电脑"><div class="modal-head"><h2>连接电脑</h2></div><div class="modal-body"><p class="settings-note">请在电脑的“工作台设置 → 手机联动”中生成配对码。稿件和图片将保存到电脑。</p><form id="pair-form"><label class="field"><span>配对码</span><input name="pair-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label><label class="field"><span>设备名称</span><input name="pair-name" value="我的手机" maxlength="60" required></label><p role="alert" id="pair-error" class="settings-note"></p><button class="btn primary" id="pair-submit" type="submit">连接</button></form></div></section></div>';
    document.querySelector('#app').inert = true;
    const form = root.querySelector('form'),
      submit = root.querySelector('#pair-submit'),
      message = root.querySelector('#pair-error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      submit.disabled = true;
      try {
        const data = new FormData(form);
        const result = await raw(
          'lan/pair',
          {
            code: String(data.get('pair-code')).trim(),
            name: String(data.get('pair-name')).trim(),
          },
          false,
        );
        if (!result.response.ok) throw failure(result);
        root.replaceChildren();
        document.querySelector('#app').inert = false;
        resolve();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    root.querySelector('[name=pair-code]').focus();
  });
}
export async function connect(interactive = false) {
  if (connecting) return connecting;
  connecting = (async () => {
    let result = await raw('session', undefined, false);
    if (result.response.status === 401 && !localAccess && interactive) {
      await pair();
      result = await raw('session', undefined, false);
    }
    if (!result.response.ok) throw failure(result);
    token = result.value.token;
  })();
  try {
    await connecting;
  } finally {
    connecting = undefined;
  }
}
export async function request(endpoint, body) {
  if (!token) await connect(false);
  let result = await raw(endpoint, body);
  // A 403 CSRF/session rejection happens before any write. Refresh the session
  // once after a PC restart; never retry an ambiguous network failure.
  if (result.response.status === 403) {
    token = undefined;
    await connect(false);
    result = await raw(endpoint, body);
  }
  if (!result.response.ok) throw failure(result);
  return result.value;
}
