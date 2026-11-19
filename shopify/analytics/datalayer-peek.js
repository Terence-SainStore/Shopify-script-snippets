/**
 * =============================================================================
 * 脚本名称：datalayer-peek
 * 用途：查看 window.dataLayer 最近事件，方便核对 GA4 / GTM 推送
 * 场景：加购、checkout、view_item 等事件是否按时推送；对比多站埋点
 * 用法：任意页面运行；可监听后续 push
 *   __toolbox.dataLayerPeek.refresh()
 *   __toolbox.dataLayerPeek.listen()
 *   __toolbox.dataLayerPeek.unlisten()
 *   __toolbox.dataLayerPeek.copy()
 *   __toolbox.dataLayerPeek.hide()
 *   __toolbox.dataLayerPeek.report
 * =============================================================================
 */
(function dataLayerPeek() {
  'use strict';

  const NS = 'dataLayerPeek';
  const PANEL_ID = 'toolbox-datalayer-peek-panel';
  const LOG = '%c[Toolbox] datalayer-peek';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';
  const MAX_SHOW = 40;

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const state = {
    listening: false,
    patched: false,
    originalPush: null,
    filter: 'all', // all | ecommerce | custom
    query: '',
  };

  function getDataLayer() {
    try {
      if (!Array.isArray(window.dataLayer)) return [];
      return window.dataLayer;
    } catch {
      return [];
    }
  }

  function eventName(item) {
    if (item == null) return '(null)';
    if (typeof item === 'string') return item;
    if (typeof item !== 'object') return String(item);
    return (
      item.event ||
      item[0] ||
      item.eventName ||
      item.name ||
      (item.ecommerce ? Object.keys(item.ecommerce)[0] : null) ||
      '(object)'
    );
  }

  function summarize(item) {
    try {
      if (item == null) return 'null';
      if (typeof item === 'string') return item;
      if (typeof item !== 'object') return String(item);

      if (item.ecommerce) {
        const key = Object.keys(item.ecommerce)[0];
        const block = item.ecommerce[key];
        const items = block?.items || item.ecommerce.items;
        const value = block?.value ?? item.ecommerce.value;
        const currency = block?.currency ?? item.ecommerce.currency;
        const count = Array.isArray(items) ? items.length : null;
        return [
          key || 'ecommerce',
          currency ? `currency=${currency}` : null,
          value != null ? `value=${value}` : null,
          count != null ? `items=${count}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      }

      const keys = Object.keys(item).slice(0, 8);
      return keys.map((k) => `${k}=${stringifyShort(item[k])}`).join(' · ');
    } catch {
      return '(unserializable)';
    }
  }

  function stringifyShort(v) {
    if (v == null) return 'null';
    if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 37)}…` : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      const s = JSON.stringify(v);
      return s.length > 48 ? `${s.slice(0, 45)}…` : s;
    } catch {
      return String(v);
    }
  }

  function classify(item) {
    if (!item || typeof item !== 'object') return 'other';
    if (item.ecommerce || /^(view_item|add_to_cart|begin_checkout|purchase|select_item|view_item_list|remove_from_cart)/i.test(String(item.event || ''))) {
      return 'ecommerce';
    }
    if (item.event) return 'custom';
    return 'other';
  }

  function buildEntries(dl) {
    return dl.map((item, index) => ({
      index,
      event: String(eventName(item)),
      type: classify(item),
      summary: summarize(item),
      raw: item,
    }));
  }

  function filterEntries(entries) {
    let list = entries.slice();
    if (state.filter === 'ecommerce') list = list.filter((e) => e.type === 'ecommerce');
    if (state.filter === 'custom') list = list.filter((e) => e.type === 'custom' || e.event !== '(object)');
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const blob = `${e.event} ${e.summary} ${safeJson(e.raw)}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }

  function safeJson(v) {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }

  function buildReport() {
    const dl = getDataLayer();
    const entries = buildEntries(dl);
    const recent = entries.slice(-MAX_SHOW).reverse();
    const filtered = filterEntries(recent);

    const eventCounts = {};
    entries.forEach((e) => {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    });

    return {
      collectedAt: new Date().toISOString(),
      url: location.href,
      exists: Array.isArray(window.dataLayer),
      length: dl.length,
      listening: state.listening,
      eventCounts,
      recent,
      filtered,
      raw: dl,
    };
  }

  function ensurePatched() {
    if (state.patched) return;
    if (!Array.isArray(window.dataLayer)) {
      window.dataLayer = window.dataLayer || [];
    }
    const dl = window.dataLayer;
    state.originalPush = dl.push.bind(dl);
    dl.push = function toolboxDataLayerPush(...args) {
      const result = state.originalPush(...args);
      if (state.listening) {
        try {
          api.refresh({ keepUi: true, silent: true });
        } catch {
          /* ignore */
        }
      }
      return result;
    };
    state.patched = true;
  }

  function listen() {
    ensurePatched();
    state.listening = true;
    api.refresh({ keepUi: true });
    console.info(LOG, LOG_STYLE, '已开始监听 dataLayer.push');
  }

  function unlisten() {
    state.listening = false;
    api.refresh({ keepUi: true });
    console.info(LOG, LOG_STYLE, '已停止监听（patch 仍保留，可再 listen）');
  }

  const PANEL_CSS = `
    :host {
      all: initial;
      display: block;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483646 !important;
      width: min(480px, calc(100vw - 24px));
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
    .tb-actions { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; justify-content: flex-end; }
    button, .chip {
      appearance: none; border: 1px solid #dde3d8; background: #fff; color: #1b1f1a;
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font: 12px/1.2 inherit;
    }
    button:hover, .chip:hover { border-color: #3b82f6; }
    .chip.active { border-color: #3b82f6; background: #3b82f6; color: #fff; font-weight: 600; }
    button.on { border-color: #86efac; background: #f0fdf4; color: #15803d; }
    .tb-filters {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 10px 14px; border-bottom: 1px solid #dde3d8; background: #f6f7f4;
    }
    input[type="search"] {
      flex: 1; min-width: 140px; border: 1px solid #dde3d8; border-radius: 8px;
      background: #fff; color: #1b1f1a; padding: 7px 10px; font: 12px/1.2 inherit;
    }
    input[type="search"]:focus { outline: none; border-color: #3b82f6; }
    .tb-body { padding: 12px 14px 14px; background: #f6f7f4; }
    .summary {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;
      margin-bottom: 10px; padding: 10px 12px; border-radius: 10px;
      background: #eff6ff; color: #1e3a8a; font-size: 12px;
    }
    .summary b { color: #1b1f1a; }
    .card {
      background: #fff; border: 1px solid #dde3d8; border-radius: 10px;
      padding: 0; margin: 0 0 8px; overflow: hidden;
    }
    .row {
      display: block; width: 100%; text-align: left; border: 0; background: #fff;
      padding: 10px 12px; cursor: pointer; font: inherit; color: inherit;
      border-bottom: 1px solid #eef2ea;
    }
    .row:last-child { border-bottom: 0; }
    .row:hover { background: #eff6ff; }
    .title { font-weight: 700; color: #1b1f1a; word-break: break-word; }
    .meta {
      margin-top: 3px; color: #5c6658; font-size: 11px; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .pill {
      display: inline-block; margin-right: 6px; border-radius: 999px; padding: 1px 7px;
      font-size: 10px; font-weight: 700; border: 1px solid #dde3d8; color: #5c6658; background: #f6f7f4;
    }
    .pill.ecom { border-color: #bfdbfe; color: #1e3a8a; background: #eff6ff; }
    .muted { color: #7a8576; padding: 10px; }
    .hint { color: #5c6658; font-size: 12px; margin: 8px 0 0; }
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

  function renderList(root, report) {
    const listEl = root.querySelector('[data-role="list"]');
    if (!listEl) return;
    const filtered = report.filtered || [];
    listEl.innerHTML = filtered.length
      ? filtered
          .map(
            (e, i) => `
        <button type="button" class="row" data-idx="${i}">
          <div class="title">
            <span class="pill${e.type === 'ecommerce' ? ' ecom' : ''}">#${e.index}</span>
            ${escapeHtml(e.event)}
          </div>
          <div class="meta">${escapeHtml(e.summary)}</div>
        </button>`
          )
          .join('')
      : `<p class="muted">${report.exists ? '没有符合筛选的事件' : 'window.dataLayer 不存在或不是数组'}</p>`;

    root.querySelectorAll('button[data-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === state.filter);
    });

    listEl.querySelectorAll('button[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-idx'));
        const entry = filtered[i];
        if (!entry) return;
        console.group(LOG, LOG_STYLE, entry.event);
        console.log(entry.raw);
        console.groupEnd();
      });
    });
  }

  function renderPanel(report) {
    const root = getPanelRoot();
    const topEvents = Object.entries(report.eventCounts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ');

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>DataLayer Peek</strong>
            <span class="tb-badge">${
              report.exists ? `${report.length} events` : 'no dataLayer'
            }${state.listening ? ' · listening' : ''}</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="listen" class="${state.listening ? 'on' : ''}">${
              state.listening ? '听中' : '监听'
            }</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-filters">
          <button type="button" class="chip${state.filter === 'all' ? ' active' : ''}" data-filter="all">全部</button>
          <button type="button" class="chip${state.filter === 'ecommerce' ? ' active' : ''}" data-filter="ecommerce">电商</button>
          <button type="button" class="chip${state.filter === 'custom' ? ' active' : ''}" data-filter="custom">含 event</button>
          <input type="search" placeholder="搜索 event / 字段…" value="${escapeHtml(state.query)}" data-role="search" />
        </div>
        <div class="tb-body">
          <div class="summary">
            <div>length: <b>${report.length}</b></div>
            <div>showing: <b>${(report.filtered || []).length}/${Math.min(report.length, MAX_SHOW)}</b></div>
            <div style="grid-column:1/-1">top: <b>${escapeHtml(topEvents || '(none)')}</b></div>
          </div>
          <div class="card" data-role="list"></div>
          <p class="hint">默认显示最近 ${MAX_SHOW} 条（新→旧）。点条目会在 Console 打印完整对象。监听会 hook dataLayer.push。</p>
        </div>
      </div>
    `;

    renderList(root, report);
    bindActions(root, report);
  }

  function bindActions(root, report) {
    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') api.refresh({ keepUi: true });
        if (act === 'listen') {
          if (state.listening) unlisten();
          else listen();
        }
        if (act === 'copy') await api.copy();
        if (act === 'hide') api.hide();
      });
    });

    root.querySelectorAll('button[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.getAttribute('data-filter') || 'all';
        const next = buildReport();
        api.report = next;
        renderList(root, next);
      });
    });

    const search = root.querySelector('[data-role="search"]');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        state.query = search.value;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const next = buildReport();
          api.report = next;
          renderList(root, next);
        }, 120);
      });
    }
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    console.log(
      `dataLayer length=${report.length} · showing ${(report.filtered || []).length} · listening=${state.listening}`
    );
    console.table(
      (report.filtered || []).map((e) => ({
        index: e.index,
        event: e.event,
        type: e.type,
        summary: e.summary,
      }))
    );
    console.log('完整报告 → window.__toolbox.dataLayerPeek.report');
    console.groupEnd();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      console.info(LOG, LOG_STYLE, '已复制到剪贴板');
      return true;
    } catch {
      console.warn(LOG, LOG_STYLE, '剪贴板不可用，改为打印 JSON');
      console.log(text);
      return false;
    }
  }

  const api = {
    report: null,
    refresh(opts = {}) {
      const report = buildReport();
      api.report = report;
      const root = document.getElementById(PANEL_ID)?.shadowRoot;
      if (opts.keepUi && root?.querySelector('[data-role="list"]')) {
        // 更新 badge / list，尽量不重建 search（避免失焦）
        const badge = root.querySelector('.tb-badge');
        if (badge) {
          badge.textContent = `${report.exists ? `${report.length} events` : 'no dataLayer'}${
            state.listening ? ' · listening' : ''
          }`;
        }
        const listenBtn = root.querySelector('button[data-act="listen"]');
        if (listenBtn) {
          listenBtn.textContent = state.listening ? '听中' : '监听';
          listenBtn.classList.toggle('on', state.listening);
        }
        renderList(root, report);
      } else {
        renderPanel(report);
      }
      if (!opts.silent) logReport(report);
      return report;
    },
    listen,
    unlisten,
    async copy() {
      const report = api.report || api.refresh();
      return copyText(JSON.stringify(report.raw || getDataLayer(), null, 2));
    },
    hide() {
      state.listening = false;
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
