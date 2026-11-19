/**
 * =============================================================================
 * 脚本名称：cart-info
 * 用途：查看当前购物车摘要、行项目、折扣与金额
 * 场景：调试 Ajax Cart、核对折扣后金额、导出购物车 JSON
 * 用法：任意前台页面运行；右上角浮层展示，Console 同步输出
 *   __toolbox.cartInfo.refresh()
 *   __toolbox.cartInfo.copy()
 *   __toolbox.cartInfo.clear()
 *   __toolbox.cartInfo.setQty(lineOrKey, quantity)
 *   __toolbox.cartInfo.hide()
 *   __toolbox.cartInfo.report
 * =============================================================================
 */
(function cartInfo() {
  'use strict';

  const NS = 'cartInfo';
  const PANEL_ID = 'toolbox-cart-info-panel';
  const LOG = '%c[Toolbox] cart-info';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const rootUrl = () => window.Shopify?.routes?.root || '/';

  const money = (cents, currency) => {
    if (cents == null) return '(null)';
    const n = Number(cents) / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD',
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency || ''}`.trim();
    }
  };

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  async function fetchCart() {
    const res = await fetch(`${rootUrl()}cart.js`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`获取购物车失败: HTTP ${res.status}`);
    return res.json();
  }

  async function clearCart() {
    const res = await fetch(`${rootUrl()}cart/clear.js`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`清空购物车失败: HTTP ${res.status}`);
    return res.json();
  }

  async function setQty(lineOrKey, quantity) {
    const body =
      typeof lineOrKey === 'number' || /^\d+$/.test(String(lineOrKey))
        ? { line: Number(lineOrKey), quantity: Number(quantity) }
        : { id: String(lineOrKey), quantity: Number(quantity) };

    const res = await fetch(`${rootUrl()}cart/change.js`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`修改数量失败: HTTP ${res.status}`);
    return res.json();
  }

  function buildReport(cart) {
    return {
      collectedAt: new Date().toISOString(),
      url: location.href,
      item_count: cart.item_count,
      item_count_unique: (cart.items || []).length,
      total_price: cart.total_price,
      total_price_fmt: money(cart.total_price, cart.currency),
      original_total_price: cart.original_total_price,
      total_discount: cart.total_discount,
      total_discount_fmt: money(cart.total_discount, cart.currency),
      currency: cart.currency,
      token: cart.token || null,
      note: cart.note || null,
      attributes: cart.attributes || {},
      cart_level_discount_applications: cart.cart_level_discount_applications || [],
      items: (cart.items || []).map((item, index) => ({
        line: index + 1,
        key: item.key,
        id: item.id,
        variant_id: item.variant_id,
        product_id: item.product_id,
        title: item.product_title || item.title,
        variant: item.variant_title,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        price_fmt: money(item.price, cart.currency),
        line_price: item.line_price,
        line_price_fmt: money(item.line_price, cart.currency),
        final_line_price: item.final_line_price,
        final_line_price_fmt: money(item.final_line_price, cart.currency),
        url: item.url,
        properties: item.properties || {},
        discounts: item.discounts || [],
      })),
      raw: cart,
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
      width: min(460px, calc(100vw - 24px));
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
    button {
      appearance: none; border: 1px solid #dde3d8; background: #fff; color: #1b1f1a;
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font: 12px/1.2 inherit;
    }
    button:hover { border-color: #3b82f6; }
    button.danger { border-color: #fecaca; color: #b42318; }
    button.danger:hover { border-color: #b42318; background: #fef3f2; }
    .tb-body { padding: 12px 14px 14px; background: #f6f7f4; }
    .tb-sec {
      margin: 0 0 10px; padding: 10px 12px; background: #fff;
      border: 1px solid #dde3d8; border-radius: 10px;
    }
    .tb-sec h4 {
      margin: 0 0 8px; color: #5c6658; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .04em;
    }
    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px solid #eef2ea; }
    tr:last-child { border-bottom: 0; }
    .k, .v, .item td {
      vertical-align: top; padding: 5px 0;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .k { width: 36%; color: #5c6658; padding-right: 10px; }
    .v { color: #1b1f1a; word-break: break-word; white-space: pre-wrap; font-weight: 500; }
    .item td { color: #1b1f1a; padding: 6px 0; }
    .item .meta { color: #5c6658; font-size: 11px; margin-top: 2px; }
    .muted { color: #7a8576; }
    .err { color: #b42318; }
  `;

  function rowsHtml(obj) {
    return Object.entries(obj)
      .map(
        ([k, v]) =>
          `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(
            v == null ? '(null)' : String(v)
          )}</td></tr>`
      )
      .join('');
  }

  function itemsHtml(items) {
    if (!items?.length) {
      return `<p class="muted">购物车为空</p>`;
    }
    return items
      .map(
        (item) => `
      <div class="item" style="border-bottom:1px solid #eef2ea;padding:6px 0;">
        <div><strong>#${item.line}</strong> ${escapeHtml(item.title || '')}</div>
        <div class="meta">
          variant: ${escapeHtml(item.variant || '(default)')} · qty ${item.quantity}
          · ${escapeHtml(item.final_line_price_fmt || item.line_price_fmt)}
        </div>
        <div class="meta">
          variant_id=${escapeHtml(item.variant_id)} · key=${escapeHtml(item.key)}
          ${item.sku ? ` · sku=${escapeHtml(item.sku)}` : ''}
        </div>
      </div>`
      )
      .join('');
  }

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

  function renderPanel(report, error) {
    const root = getPanelRoot();
    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Cart Info</strong>
            <span class="tb-badge">${
              error
                ? 'Error'
                : `${report.item_count} items · ${escapeHtml(report.total_price_fmt)}`
            }</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="clear" class="danger">清空</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          ${
            error
              ? `<p class="err">${escapeHtml(error)}</p>`
              : `
            <section class="tb-sec"><h4>Summary</h4><table>${rowsHtml({
              item_count: report.item_count,
              lines: report.item_count_unique,
              total_price: report.total_price_fmt,
              total_discount: report.total_discount_fmt,
              currency: report.currency,
              token: report.token ? `${String(report.token).slice(0, 10)}…` : null,
              note: report.note || '(none)',
            })}</table></section>
            <section class="tb-sec"><h4>Items</h4>${itemsHtml(report.items)}</section>
          `
          }
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') await api.refresh();
        if (act === 'copy') await api.copy();
        if (act === 'clear') {
          if (confirm('确认清空购物车？')) await api.clear();
        }
        if (act === 'hide') api.hide();
      });
    });
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    console.log('完整报告 → window.__toolbox.cartInfo.report');
    console.table(
      report.items.map((item) => ({
        line: item.line,
        title: item.title,
        variant: item.variant,
        qty: item.quantity,
        line_price: item.final_line_price_fmt || item.line_price_fmt,
        variant_id: item.variant_id,
        key: item.key,
      }))
    );
    console.log(report);
    console.info(
      'API: __toolbox.cartInfo.refresh / copy / clear / setQty(lineOrKey, qty) / hide'
    );
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
    async refresh() {
      try {
        const cart = await fetchCart();
        const report = buildReport(cart);
        api.report = report;
        renderPanel(report);
        logReport(report);
        return report;
      } catch (err) {
        const message = String(err?.message || err);
        renderPanel(null, message);
        console.error(LOG, LOG_STYLE, message);
        throw err;
      }
    },
    async copy() {
      const report = api.report || (await api.refresh());
      return copyText(JSON.stringify(report.raw || report, null, 2));
    },
    async clear() {
      const cart = await clearCart();
      const report = buildReport(cart);
      api.report = report;
      renderPanel(report);
      logReport(report);
      return report;
    },
    async setQty(lineOrKey, quantity) {
      const cart = await setQty(lineOrKey, quantity);
      const report = buildReport(cart);
      api.report = report;
      renderPanel(report);
      logReport(report);
      return report;
    },
    hide() {
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
