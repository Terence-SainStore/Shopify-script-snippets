/**
 * =============================================================================
 * 脚本名称：site-info
 * 用途：监测当前 Shopify 站点信息（店铺 / 主题 / 市场 / 页面 / 购物车 / 常见 App）
 * 场景：接手新店、核对线上环境、提 bug、对比多站点配置
 * 用法：在任意店铺前台运行；页面右上角浮层展示，Console 同步输出
 *   __toolbox.siteInfo.refresh()   刷新
 *   __toolbox.siteInfo.copy()      复制 JSON
 *   __toolbox.siteInfo.hide()      关闭浮层
 *   __toolbox.siteInfo.report      最近一次完整报告
 * =============================================================================
 */
(function siteInfo() {
  'use strict';

  const NS = 'siteInfo';
  const PANEL_ID = 'toolbox-site-info-panel';
  const STYLE_ID = 'toolbox-site-info-style';
  const LOG = '%c[Toolbox] site-info';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const pick = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return null;
    return keys.reduce((acc, key) => {
      if (obj[key] !== undefined) acc[key] = obj[key];
      return acc;
    }, {});
  };

  const safeJson = (value, fallback = null) => {
    try {
      if (typeof value === 'string') return JSON.parse(value);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const metaContent = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.content ||
    document.querySelector(`meta[property="${name}"]`)?.content ||
    null;

  const detectShopify = () => {
    const s = window.Shopify;
    const signals = {
      hasShopifyGlobal: Boolean(s),
      hasShopifyShop: Boolean(s?.shop),
      hasShopifySections: document.querySelectorAll('.shopify-section').length > 0,
      hasShopifyCdn: [...document.scripts].some((el) =>
        /cdn\.shopify\.com|shopifycloud\.com/i.test(el.src || '')
      ),
      hasShopifyMeta: Boolean(
        metaContent('shopify-digital-wallet') ||
          document.querySelector('link[href*="cdn.shopify.com"]')
      ),
    };
    const score = Object.values(signals).filter(Boolean).length;
    return {
      isLikelyShopify: score >= 2 || signals.hasShopifyShop,
      score,
      signals,
    };
  };

  const detectTemplate = () =>
    document.documentElement.dataset.template ||
    document.body?.dataset?.template ||
    document.querySelector('[data-template]')?.getAttribute('data-template') ||
    window.meta?.page?.pageType ||
    window.__st?.p ||
    null;

  const detectApps = () => {
    const sources = [
      ...document.scripts,
      ...document.querySelectorAll('link[rel="stylesheet"]'),
    ]
      .map((el) => el.src || el.href || '')
      .filter(Boolean);

    const rules = [
      { name: 'Google Analytics / gtag', re: /googletagmanager|google-analytics|gtag\/js/i },
      { name: 'Meta Pixel', re: /connect\.facebook\.net|fbevents\.js/i },
      { name: 'TikTok Pixel', re: /analytics\.tiktok\.com|ttq/i },
      { name: 'Klaviyo', re: /klaviyo|static\.klaviyo/i },
      { name: 'Judge.me', re: /judge\.me|judgeme/i },
      { name: 'Yotpo', re: /yotpo/i },
      { name: 'Recharge', re: /rechargeapps|rechargecdn/i },
      { name: 'Shopify Inbox', re: /shopifycloud\.com\/.*inbox|shopify-chat/i },
      { name: 'Hotjar', re: /static\.hotjar|hotjar/i },
      { name: 'Clarity', re: /clarity\.ms/i },
      { name: 'Shopify Web Pixels', re: /web-pixels-manager|shopify\.cloud\/.*web-pixel/i },
    ];

    return rules
      .filter((rule) => sources.some((src) => rule.re.test(src)))
      .map((rule) => rule.name);
  };

  const collectProductHint = () => {
    const fromMeta = window.meta?.product;
    if (fromMeta) {
      return pick(fromMeta, ['id', 'gid', 'vendor', 'type', 'handle']) || fromMeta;
    }

    const jsonEl =
      document.querySelector('script[type="application/ld+json"]') ||
      document.querySelector('script[data-product-json], #ProductJson-product-template, [id^="ProductJson"]');

    if (!jsonEl) return null;
    const data = safeJson(jsonEl.textContent);
    if (!data) return null;
    if (data['@type'] === 'Product' || data.name) {
      return {
        name: data.name,
        sku: data.sku,
        brand: data.brand?.name || data.brand,
      };
    }
    return pick(data, ['id', 'handle', 'title', 'vendor', 'type']) || null;
  };

  async function fetchCart() {
    try {
      const root = window.Shopify?.routes?.root || '/';
      const res = await fetch(`${root}cart.js`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const cart = await res.json();
      return {
        item_count: cart.item_count,
        total_price: cart.total_price,
        currency: cart.currency,
        token: cart.token ? `${String(cart.token).slice(0, 8)}…` : null,
        items: (cart.items || []).map((item) => ({
          key: item.key,
          id: item.id,
          title: item.product_title || item.title,
          quantity: item.quantity,
          variant_id: item.variant_id,
        })),
      };
    } catch (err) {
      return { error: String(err?.message || err) };
    }
  }

  async function buildReport() {
    const detection = detectShopify();
    const shopify = window.Shopify || null;

    const report = {
      collectedAt: new Date().toISOString(),
      page: {
        url: location.href,
        title: document.title,
        pathname: location.pathname,
        template: detectTemplate(),
        sectionCount: document.querySelectorAll('.shopify-section').length,
        lang: document.documentElement.lang || null,
      },
      detection,
      shop: {
        shop: shopify?.shop ?? null,
        permanentDomain: shopify?.shopPermanentDomain ?? null,
        locale: shopify?.locale ?? null,
        country: shopify?.country ?? null,
        currency: shopify?.currency ?? null,
        cdnHost: shopify?.cdnHost ?? null,
        designMode: Boolean(shopify?.designMode),
        routesRoot: shopify?.routes?.root ?? null,
      },
      theme: pick(shopify?.theme, [
        'name',
        'id',
        'schema_name',
        'schema_version',
        'theme_store_id',
        'role',
        'handle',
      ]),
      analytics: {
        meta: window.meta || null,
        __st: window.__st || null,
        hasShopifyAnalytics: Boolean(window.ShopifyAnalytics),
      },
      productHint: collectProductHint(),
      appsDetected: detectApps(),
      cart: await fetchCart(),
    };

    return report;
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
    .tb-hd .tb-badge { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; color: #5c6658; }
    .tb-actions { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; justify-content: flex-end; }
    button {
      appearance: none; border: 1px solid #dde3d8; background: #fff; color: #1b1f1a;
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font: 12px/1.2 inherit;
    }
    button:hover { border-color: #3b82f6; }
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
    .k, .v {
      vertical-align: top; padding: 5px 0;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .k { width: 34%; color: #5c6658; padding-right: 10px; }
    .v { color: #1b1f1a; word-break: break-word; white-space: pre-wrap; font-weight: 500; }
    .v.muted { color: #7a8576; font-weight: 400; }
    .ok { color: #15803d; }
    .bad { color: #b42318; }
  `;

  function formatCell(value) {
    if (value === undefined) return { text: '(undefined)', muted: true };
    if (value === null) return { text: '(null)', muted: true };
    if (typeof value === 'boolean') return { text: String(value), muted: false };
    if (typeof value === 'object') {
      const text = JSON.stringify(value);
      return { text: text === undefined ? '(unserializable)' : text, muted: false };
    }
    const text = String(value);
    return { text: text === '' ? '(empty)' : text, muted: text === '' };
  }

  function rowsFromObject(obj) {
    return Object.entries(obj || {}).map(([key, value]) => {
      const cell = formatCell(value);
      return { key, ...cell };
    });
  }

  function renderSection(title, obj, opts = {}) {
    const rows = rowsFromObject(obj);
    if (!rows.length && opts.emptyAsSkip) return '';
    const body = rows.length
      ? rows
          .map(
            (row) =>
              `<tr><td class="k">${escapeHtml(row.key)}</td><td class="v${row.muted ? ' muted' : ''}">${escapeHtml(row.text)}</td></tr>`
          )
          .join('')
      : `<tr><td class="v muted" colspan="2">${escapeHtml(opts.emptyText || '(无)')}</td></tr>`;
    return `<section class="tb-sec"><h4>${escapeHtml(title)}</h4><table>${body}</table></section>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPanelRoot() {
    let host = document.getElementById(PANEL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = PANEL_ID;
      document.documentElement.appendChild(host);
    }

    // 已存在的旧版（非 Shadow）面板先拆掉再重建
    if (!host.shadowRoot) {
      host.innerHTML = '';
      host.attachShadow({ mode: 'open' });
    }
    return host.shadowRoot;
  }

  function renderPanel(report) {
    // 清掉旧版全局 style（若上次运行过）
    document.getElementById(STYLE_ID)?.remove();

    const root = getPanelRoot();
    const okClass = report.detection.isLikelyShopify ? 'ok' : 'bad';
    const okText = report.detection.isLikelyShopify ? 'Likely Shopify' : 'Not Shopify?';

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Site Info</strong>
            <span class="tb-badge ${okClass}">${okText}</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          ${renderSection('Page', {
            title: report.page.title,
            url: report.page.url,
            template: report.page.template,
            sections: report.page.sectionCount,
            lang: report.page.lang,
          })}
          ${renderSection('Shop', report.shop)}
          ${renderSection('Theme', report.theme || {})}
          ${renderSection('Cart', {
            item_count: report.cart?.item_count,
            total_price: report.cart?.total_price,
            currency: report.cart?.currency,
            error: report.cart?.error,
            items: report.cart?.items,
          })}
          ${renderSection('Apps detected', {
            list: report.appsDetected.length ? report.appsDetected.join(', ') : '(未匹配常见 App)',
          })}
          ${renderSection('Product hint', report.productHint || {}, {
            emptyAsSkip: false,
            emptyText: '(非商品页或未找到)',
          })}
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') await api.refresh();
        if (act === 'copy') await api.copy();
        if (act === 'hide') api.hide();
      });
    });
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    console.log('完整报告 → window.__toolbox.siteInfo.report');
    console.table(
      rowsFromObject({
        isShopify: report.detection.isLikelyShopify,
        shop: report.shop.shop,
        theme: report.theme?.name,
        themeId: report.theme?.id,
        locale: report.shop.locale,
        country: report.shop.country,
        currency: report.shop.currency?.active || report.shop.currency,
        template: report.page.template,
        cartItems: report.cart?.item_count,
        apps: report.appsDetected.join(', ') || '(无)',
      }).map((row) => ({ key: row.key, value: row.text }))
    );
    console.log(report);
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
      const report = await buildReport();
      api.report = report;
      renderPanel(report);
      logReport(report);
      return report;
    },
    async copy() {
      const report = api.report || (await api.refresh());
      return copyText(JSON.stringify(report, null, 2));
    },
    hide() {
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;

  api.refresh();
})();
