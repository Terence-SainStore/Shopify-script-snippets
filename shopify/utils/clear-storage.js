/**
 * =============================================================================
 * 脚本名称：clear-storage
 * 用途：清理当前站点 localStorage / sessionStorage（可选 Cookie）
 * 场景：复现首次访问、弹窗不出现、A/B 或推荐被旧数据影响、购物车状态异常
 * 用法：运行后弹出面板，勾选要清的项再执行
 *   __toolbox.clearStorage.run({ local:true, session:true, cookies:false })
 *   __toolbox.clearStorage.hide()
 * 注意：清 Cookie 可能退出登录 / 影响 cart cookie，请确认后再勾选
 * =============================================================================
 */
(function clearStorage() {
  'use strict';

  const NS = 'clearStorage';
  const PANEL_ID = 'toolbox-clear-storage-panel';
  const LOG = '%c[Toolbox] clear-storage';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function listKeys(storage) {
    try {
      return Object.keys(storage);
    } catch {
      return [];
    }
  }

  function listCookies() {
    if (!document.cookie) return [];
    return document.cookie
      .split(';')
      .map((raw) => raw.split('=')[0].trim())
      .filter(Boolean);
  }

  function snapshot() {
    return {
      localStorage: listKeys(localStorage),
      sessionStorage: listKeys(sessionStorage),
      cookies: listCookies(),
    };
  }

  function clearCookies(filterFn) {
    const names = listCookies();
    let cleared = 0;
    const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const host = location.hostname;

    names.forEach((name) => {
      if (typeof filterFn === 'function' && !filterFn(name)) return;
      document.cookie = `${name}=; ${expire}; path=/`;
      document.cookie = `${name}=; ${expire}; path=/; domain=${host}`;
      document.cookie = `${name}=; ${expire}; path=/; domain=.${host}`;
      // 常见父域
      const parts = host.split('.');
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.');
        document.cookie = `${name}=; ${expire}; path=/; domain=.${parent}`;
      }
      cleared += 1;
    });
    return cleared;
  }

  function run(options = {}) {
    const opts = {
      local: options.local !== false,
      session: options.session !== false,
      cookies: Boolean(options.cookies),
      reload: Boolean(options.reload),
      cookieFilter: options.cookieFilter || null,
    };

    const before = snapshot();
    const summary = {
      localStorageKeys: 0,
      sessionStorageKeys: 0,
      cookiesCleared: 0,
      before,
    };

    console.group(LOG, LOG_STYLE);

    if (opts.local) {
      summary.localStorageKeys = before.localStorage.length;
      console.log('清理 localStorage:', before.localStorage);
      localStorage.clear();
    }

    if (opts.session) {
      summary.sessionStorageKeys = before.sessionStorage.length;
      console.log('清理 sessionStorage:', before.sessionStorage);
      sessionStorage.clear();
    }

    if (opts.cookies) {
      summary.cookiesCleared = clearCookies(opts.cookieFilter);
      console.log('清理 cookies:', before.cookies);
    }

    summary.after = snapshot();
    console.log('清理结果:', summary);
    console.info(opts.reload ? '即将刷新页面…' : '建议：刷新页面后再验证行为');
    console.groupEnd();

    api.lastResult = summary;
    if (opts.reload) {
      location.reload();
    } else {
      renderPanel(summary);
    }
    return summary;
  }

  const PANEL_CSS = `
    :host {
      all: initial;
      display: block;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483646 !important;
      width: min(420px, calc(100vw - 24px));
      max-height: calc(100vh - 32px);
      color-scheme: light;
    }
    .tb-root {
      display: block; max-height: calc(100vh - 32px); overflow: auto;
      background: #fff; color: #1b1f1a; border: 1px solid #dde3d8;
      border-radius: 12px; box-shadow: 0 12px 32px rgba(27,31,26,.12);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    * { box-sizing: border-box; }
    .tb-hd {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-bottom: 1px solid #dde3d8;
      position: sticky; top: 0; background: #fff; z-index: 2;
    }
    .tb-hd-main { flex: 1; min-width: 0; }
    .tb-hd strong { display: block; color: #1b1f1a; font-size: 15px; font-weight: 700; }
    .tb-hd .tb-badge { display: block; margin-top: 2px; font-size: 12px; color: #5c6658; font-weight: 600; }
    .tb-body { padding: 12px 14px 14px; background: #f6f7f4; }
    label {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 0 0 8px; cursor: pointer; color: #1b1f1a;
    }
    label input { margin-top: 2px; }
    .hint { color: #5c6658; font-size: 11px; margin: 2px 0 0 22px; }
    .warn { color: #b42318; }
    .keys {
      margin: 0 0 12px; padding: 8px 10px; background: #fff; border: 1px solid #dde3d8;
      border-radius: 8px; color: #5c6658; max-height: 140px; overflow: auto;
      white-space: pre-wrap; word-break: break-all;
      font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .tb-actions { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; justify-content: flex-end; }
    button {
      appearance: none; border: 1px solid #dde3d8; background: #fff; color: #1b1f1a;
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font: 12px/1.2 inherit;
    }
    button:hover { border-color: #3b82f6; }
    button.danger {
      border-color: #b42318; background: #b42318; color: #fff; font-weight: 600;
    }
    button.danger:hover { border-color: #912018; background: #912018; color: #fff; }
    .result { margin-top: 12px; color: #1e3a8a; background: #eff6ff; padding: 8px 10px; border-radius: 8px; }
  `;

  function getPanelRoot() {
    let host = document.getElementById(PANEL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = PANEL_ID;
      document.documentElement.appendChild(host);
    }
    if (!host.shadowRoot) {
      host.innerHTML = '';
      host.attachShadow({ mode: 'open' });
    }
    return host.shadowRoot;
  }

  function renderPanel(lastResult) {
    const snap = snapshot();
    const root = getPanelRoot();
    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Clear Storage</strong>
            <span class="tb-badge">${location.hostname}</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="run" class="danger">清理</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          <label>
            <input type="checkbox" name="local" checked />
            <span>localStorage（${snap.localStorage.length} keys）</span>
          </label>
          <div class="keys">${escapeHtml(snap.localStorage.join('\n') || '(empty)')}</div>

          <label>
            <input type="checkbox" name="session" checked />
            <span>sessionStorage（${snap.sessionStorage.length} keys）</span>
          </label>
          <div class="keys">${escapeHtml(snap.sessionStorage.join('\n') || '(empty)')}</div>

          <label>
            <input type="checkbox" name="cookies" />
            <span>Cookies（${snap.cookies.length}）</span>
          </label>
          <div class="hint warn">可能退出登录 / 影响 cart cookie，默认不勾选</div>
          <div class="keys">${escapeHtml(snap.cookies.join('\n') || '(empty)')}</div>

          <label>
            <input type="checkbox" name="reload" />
            <span>清理后自动刷新页面</span>
          </label>
          ${
            lastResult
              ? `<div class="result">已清理：local ${lastResult.localStorageKeys} · session ${lastResult.sessionStorageKeys} · cookies ${lastResult.cookiesCleared}</div>`
              : ''
          }
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'hide') return api.hide();
        if (act === 'refresh') return renderPanel(api.lastResult);
        if (act === 'run') {
          const local = root.querySelector('input[name="local"]').checked;
          const session = root.querySelector('input[name="session"]').checked;
          const cookies = root.querySelector('input[name="cookies"]').checked;
          const reload = root.querySelector('input[name="reload"]').checked;
          if (!local && !session && !cookies) {
            console.warn(LOG, LOG_STYLE, '未勾选任何项');
            return;
          }
          if (cookies && !confirm('确认同时清理 Cookies？可能退出登录。')) return;
          api.run({ local, session, cookies, reload });
        }
      });
    });
  }

  const api = {
    lastResult: null,
    snapshot,
    run,
    refresh() {
      renderPanel(api.lastResult);
      console.group(LOG, LOG_STYLE);
      console.log('当前存储快照:', snapshot());
      console.info('执行: __toolbox.clearStorage.run({ local:true, session:true, cookies:false, reload:false })');
      console.groupEnd();
      return snapshot();
    },
    hide() {
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
