/**
 * =============================================================================
 * 脚本名称：free-gift-rules
 * 用途：可视化页面上的买赠规则 JSON（#FreeGiftConfig）
 * 场景：核对黑五/活动买赠配置、对照购物车看哪些规则会触发
 * 用法：在含 free-gift-config section 的前台页运行
 *   __toolbox.freeGiftRules.refresh()
 *   __toolbox.freeGiftRules.copy()
 *   __toolbox.freeGiftRules.hide()
 *   __toolbox.freeGiftRules.report
 * =============================================================================
 */
(function freeGiftRules() {
  'use strict';

  const NS = 'freeGiftRules';
  const PANEL_ID = 'toolbox-free-gift-rules-panel';
  const LOG = '%c[Toolbox] free-gift-rules';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const CONFIG_SELECTORS = [
    '#FreeGiftConfig',
    '#shopify-section-free-gift-config script[type="application/json"]',
    'script#FreeGiftConfig',
    '[id*="free-gift"] script[type="application/json"]',
  ];

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const rootUrl = () => window.Shopify?.routes?.root || '/';

  function findConfigEl() {
    for (const sel of CONFIG_SELECTORS) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el;
    }
    return null;
  }

  function parseConfig() {
    const el = findConfigEl();
    if (!el) {
      return { error: '未找到 #FreeGiftConfig，请确认当前页含 free-gift-config section' };
    }
    try {
      const data = JSON.parse(el.textContent);
      return {
        source: el.id ? `#${el.id}` : el.getAttribute('id') || '(script)',
        section: el.closest('.shopify-section')?.id || null,
        data,
      };
    } catch (err) {
      return { error: `JSON 解析失败: ${err.message}` };
    }
  }

  async function fetchCart() {
    try {
      const res = await fetch(`${rootUrl()}cart.js`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  function cartMatchKeys(cart) {
    if (!cart?.items?.length) {
      return { handles: new Set(), variantIds: new Set(), productIds: new Set() };
    }
    const handles = new Set();
    const variantIds = new Set();
    const productIds = new Set();
    cart.items.forEach((item) => {
      if (item.handle) handles.add(String(item.handle));
      // cart.js 有时只有 url：/products/xxx
      const fromUrl = item.url?.match(/\/products\/([^/?#]+)/);
      if (fromUrl) handles.add(decodeURIComponent(fromUrl[1]));
      if (item.variant_id != null) variantIds.add(String(item.variant_id));
      if (item.product_id != null) productIds.add(String(item.product_id));
      if (item.id != null) variantIds.add(String(item.id));
    });
    return { handles, variantIds, productIds };
  }

  function triggerMatched(rule, cartKeys) {
    const triggers = (rule.triggers || []).map(String);
    if (!triggers.length) return { matched: false, hits: [] };

    const hits = [];
    const type = rule.matchType || 'productHandle';

    triggers.forEach((t) => {
      if (type === 'variantId' && cartKeys.variantIds.has(t)) hits.push(t);
      else if (type === 'productId' && cartKeys.productIds.has(t)) hits.push(t);
      else if (type === 'productHandle' && cartKeys.handles.has(t)) hits.push(t);
      else if (!['variantId', 'productId', 'productHandle'].includes(type)) {
        // 未知类型：两边都试
        if (
          cartKeys.handles.has(t) ||
          cartKeys.variantIds.has(t) ||
          cartKeys.productIds.has(t)
        ) {
          hits.push(t);
        }
      }
    });

    return { matched: hits.length > 0, hits };
  }

  function giftInCart(gift, cartKeys) {
    const vid = gift.giftVariantId != null ? String(gift.giftVariantId) : null;
    const hid = gift.giftHandle != null ? String(gift.giftHandle) : null;
    const pid = gift.giftProductId != null ? String(gift.giftProductId) : null;
    return {
      inCart:
        (vid && cartKeys.variantIds.has(vid)) ||
        (hid && cartKeys.handles.has(hid)) ||
        (pid && cartKeys.productIds.has(pid)),
      variantId: vid,
      handle: hid,
      productId: pid,
    };
  }

  function enrichRules(config, cart) {
    const cartKeys = cartMatchKeys(cart);
    const rules = Array.isArray(config?.rules) ? config.rules : [];

    return rules.map((rule, index) => {
      const match = triggerMatched(rule, cartKeys);
      const gifts = (rule.gifts || []).map((g) => ({
        ...g,
        ...giftInCart(g, cartKeys),
      }));
      return {
        index,
        id: rule.id,
        label: rule.label,
        enabled: rule.enabled !== false,
        ruleType: rule.ruleType || 'buyXGetY',
        matchType: rule.matchType,
        giftMatchType: rule.giftMatchType,
        triggers: rule.triggers || [],
        requireLogin: Boolean(rule.requireLogin),
        gifts,
        triggerMatched: match.matched,
        triggerHits: match.hits,
        wouldApply: rule.enabled !== false && match.matched,
        giftCount: gifts.length,
        giftsInCart: gifts.filter((g) => g.inCart).length,
      };
    });
  }

  function buildReport(parsed, cart) {
    if (parsed.error) {
      return { error: parsed.error, collectedAt: new Date().toISOString() };
    }
    const config = parsed.data;
    const rules = enrichRules(config, cart);
    return {
      collectedAt: new Date().toISOString(),
      source: parsed.source,
      section: parsed.section,
      giftQtyLimit: config.giftQtyLimit ?? null,
      managedGiftVariantIds: config.managedGiftVariantIds || [],
      ruleCount: rules.length,
      enabledCount: rules.filter((r) => r.enabled).length,
      matchedCount: rules.filter((r) => r.wouldApply).length,
      cartItemCount: cart?.item_count ?? null,
      rules,
      raw: config,
    };
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
    .tb-filters {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 10px 14px; border-bottom: 1px solid #dde3d8; background: #f6f7f4;
    }
    button, .chip {
      appearance: none; border: 1px solid #dde3d8; background: #fff; color: #1b1f1a;
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font: 12px/1.2 inherit;
    }
    button:hover, .chip:hover { border-color: #3b82f6; }
    .chip.active {
      border-color: #3b82f6; background: #3b82f6; color: #fff; font-weight: 600;
    }
    input[type="search"] {
      flex: 1; min-width: 140px; border: 1px solid #dde3d8; border-radius: 8px;
      background: #fff; color: #1b1f1a; padding: 7px 10px; font: 12px/1.2 inherit;
    }
    input[type="search"]:focus { outline: none; border-color: #3b82f6; }
    .tb-body { padding: 12px 14px 14px; background: #f6f7f4; }
    .summary {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;
      margin-bottom: 12px; padding: 10px 12px; border-radius: 10px;
      background: #eff6ff; color: #1e3a8a; font-size: 12px;
    }
    .summary b { color: #1b1f1a; }
    .err { color: #b42318; padding: 8px 0; }
    .card {
      border: 1px solid #dde3d8; border-radius: 10px; padding: 12px;
      margin: 0 0 10px; background: #fff;
    }
    .card.matched {
      border-color: #93c5fd;
      box-shadow: inset 3px 0 0 #3b82f6;
    }
    .card.disabled { opacity: .55; }
    .card-hd {
      display: flex; gap: 8px; align-items: flex-start;
      margin-bottom: 10px; padding-bottom: 8px;
      border-bottom: 1px solid #eef2ea;
    }
    .card-hd .label {
      color: #1b1f1a; font-weight: 700; flex: 1; font-size: 13px; line-height: 1.35;
    }
    .pills { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
    .pill {
      display: inline-block; border-radius: 999px; padding: 2px 8px;
      font-size: 10px; font-weight: 700; border: 1px solid #dde3d8; color: #5c6658;
      white-space: nowrap; background: #f6f7f4;
    }
    .pill.on { color: #15803d; border-color: #bbf7d0; background: #f0fdf4; }
    .pill.off { color: #b42318; border-color: #fecaca; background: #fef3f2; }
    .pill.hit { color: #1e3a8a; border-color: #93c5fd; background: #eff6ff; }
    .flow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
      gap: 8px;
      align-items: stretch;
    }
    .box {
      display: flex; flex-direction: column;
      height: 100%; min-height: 100%;
      border: 1px solid #dde3d8; border-radius: 8px;
      padding: 8px 10px; background: #f6f7f4;
    }
    .box.trigger { border-color: #bfdbfe; background: #eff6ff; }
    .box.gift { border-color: #bbf7d0; background: #f0fdf4; }
    .box h5 {
      margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(27,31,26,.08);
      font-size: 10px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700;
    }
    .box.trigger h5 { color: #1e3a8a; }
    .box.gift h5 { color: #166534; }
    .box .list { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .box .item {
      color: #1b1f1a; word-break: break-word; line-height: 1.35;
      padding: 6px 8px; border-radius: 6px; background: #fff; border: 1px solid #e8eee4;
    }
    .box .item .name { font-weight: 600; font-size: 12px; }
    .box .item .sub {
      color: #5c6658; font-size: 11px; margin-top: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .box .item.hit {
      color: #1e3a8a; background: #dbeafe; border-color: #93c5fd;
    }
    .box .item.in-cart {
      color: #92400e; background: #fffbeb; border-color: #fcd34d;
    }
    .arrow {
      display: flex; align-items: center; justify-content: center;
      color: #3b82f6; font-size: 16px; font-weight: 700; align-self: stretch;
    }
    .meta {
      color: #5c6658; font-size: 11px; margin-top: 10px;
      padding-top: 8px; border-top: 1px solid #eef2ea; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .muted { color: #7a8576; }
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

  function filterRules(rules, filter, query) {
    let list = rules.slice();
    if (filter === 'matched') list = list.filter((r) => r.wouldApply);
    const q = String(query || '').trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.id,
          r.label,
          r.matchType,
          ...(r.triggers || []),
          ...(r.gifts || []).flatMap((g) => [g.giftHandle, g.giftVariantId, g.giftProductId]),
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }

  function ruleCard(rule) {
    const triggersHtml = (rule.triggers || [])
      .map((t) => {
        const hit = rule.triggerHits.includes(String(t));
        return `<div class="item${hit ? ' hit' : ''}">
          <div class="name">${escapeHtml(t)}${hit ? ' ✓' : ''}</div>
        </div>`;
      })
      .join('') || `<div class="muted">(无)</div>`;

    const giftsHtml = (rule.gifts || [])
      .map((g) => {
        const label = g.giftHandle || g.giftVariantId || g.giftProductId || '(?)';
        return `<div class="item${g.inCart ? ' in-cart' : ''}">
          <div class="name">${escapeHtml(label)}${g.inCart ? ' 🎁' : ''}</div>
          <div class="sub">vid ${escapeHtml(g.giftVariantId)}${
            g.giftProductId ? ` · pid ${escapeHtml(g.giftProductId)}` : ''
          }</div>
        </div>`;
      })
      .join('') || `<div class="muted">(无赠品)</div>`;

    return `
      <article class="card${rule.wouldApply ? ' matched' : ''}${rule.enabled ? '' : ' disabled'}">
        <div class="card-hd">
          <div class="label">${escapeHtml(rule.label || rule.id || '(unnamed)')}</div>
          <div class="pills">
            <span class="pill ${rule.enabled ? 'on' : 'off'}">${rule.enabled ? 'ON' : 'OFF'}</span>
            ${rule.wouldApply ? '<span class="pill hit">MATCH</span>' : ''}
          </div>
        </div>
        <div class="flow">
          <div class="box trigger">
            <h5>Trigger · ${escapeHtml(rule.matchType || '?')}</h5>
            <div class="list">${triggersHtml}</div>
          </div>
          <div class="arrow" aria-hidden="true">→</div>
          <div class="box gift">
            <h5>Gift · ${escapeHtml(rule.giftMatchType || '?')}</h5>
            <div class="list">${giftsHtml}</div>
          </div>
        </div>
        <div class="meta">
          ${escapeHtml(rule.id)} · ${escapeHtml(rule.ruleType)}
          ${rule.requireLogin ? ' · requireLogin' : ''}
          · gifts ${rule.giftCount}${rule.giftsInCart ? ` · in cart ${rule.giftsInCart}` : ''}
        </div>
      </article>`;
  }

  function renderList(root, report) {
    const { filter, query } = api.ui;
    const listEl = root.querySelector('[data-role="list"]');
    if (!listEl) return;

    const visible = filterRules(report.rules || [], filter, query);
    listEl.innerHTML = visible.length
      ? visible.map(ruleCard).join('')
      : `<p class="muted">没有符合筛选条件的规则</p>`;

    root.querySelectorAll('button[data-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
  }

  function renderPanel(report, ui = {}) {
    const root = getPanelRoot();
    const nextFilter = ui.filter || api.ui.filter || 'all';
    api.ui = {
      filter: nextFilter === 'matched' ? 'matched' : 'all',
      query: ui.query != null ? ui.query : api.ui.query || '',
    };
    const { filter, query } = api.ui;

    if (report.error) {
      root.innerHTML = `
        <style>${PANEL_CSS}</style>
        <div class="tb-root">
          <div class="tb-hd">
            <div class="tb-hd-main"><strong>Free Gift Rules</strong></div>
            <div class="tb-actions">
              <button type="button" data-act="refresh">刷新</button>
              <button type="button" data-act="hide">关闭</button>
            </div>
          </div>
          <div class="tb-body"><p class="err">${escapeHtml(report.error)}</p></div>
        </div>`;
      bindActions(root, report);
      return;
    }

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Free Gift Rules</strong>
            <span class="tb-badge">${report.enabledCount}/${report.ruleCount} on · ${report.matchedCount} match</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-filters">
          <button type="button" class="chip${filter === 'all' ? ' active' : ''}" data-filter="all">全部</button>
          <button type="button" class="chip${filter === 'matched' ? ' active' : ''}" data-filter="matched">命中购物车</button>
          <input type="search" placeholder="搜索 label / handle / id…" value="${escapeHtml(query)}" data-role="search" />
        </div>
        <div class="tb-body">
          <div class="summary">
            <div>source: <b>${escapeHtml(report.source)}</b></div>
            <div>qty limit: <b>${escapeHtml(report.giftQtyLimit)}</b></div>
            <div>cart items: <b>${escapeHtml(report.cartItemCount ?? '(n/a)')}</b></div>
            <div>managed gifts: <b>${(report.managedGiftVariantIds || []).length}</b></div>
          </div>
          <div data-role="list"></div>
        </div>
      </div>`;

    renderList(root, report);
    bindActions(root, report);
  }

  function bindActions(root, report) {
    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') await api.refresh();
        if (act === 'copy') await api.copy();
        if (act === 'hide') api.hide();
      });
    });

    root.querySelectorAll('button[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        api.ui.filter = btn.getAttribute('data-filter') || 'all';
        api.ui.query = root.querySelector('[data-role="search"]')?.value || '';
        renderList(root, report);
      });
    });

    const search = root.querySelector('[data-role="search"]');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        api.ui.query = search.value;
        clearTimeout(timer);
        // 只更新列表，不重建 input，避免失焦
        timer = setTimeout(() => renderList(root, report), 120);
      });
    }
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    if (report.error) {
      console.warn(report.error);
    } else {
      console.log(
        `${report.ruleCount} rules · ${report.enabledCount} enabled · ${report.matchedCount} cart-matched`
      );
      console.table(
        report.rules.map((r) => ({
          enabled: r.enabled,
          matched: r.wouldApply,
          label: r.label,
          matchType: r.matchType,
          triggers: (r.triggers || []).join(', '),
          gifts: (r.gifts || []).map((g) => g.giftHandle || g.giftVariantId).join(', '),
          id: r.id,
        }))
      );
      console.log('完整报告 → window.__toolbox.freeGiftRules.report');
      console.log(report);
    }
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
    ui: { filter: 'all', query: '' },
    async refresh(ui) {
      if (ui) {
        api.ui = {
          filter: ui.filter || api.ui.filter || 'all',
          query: ui.query != null ? ui.query : api.ui.query || '',
        };
      }
      const parsed = parseConfig();
      const cart = parsed.error ? null : await fetchCart();
      const report = buildReport(parsed, cart);
      api.report = report;
      renderPanel(report, api.ui);
      logReport(report);
      return report;
    },
    async copy() {
      const report = api.report || (await api.refresh());
      return copyText(JSON.stringify(report.raw || report, null, 2));
    },
    hide() {
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
