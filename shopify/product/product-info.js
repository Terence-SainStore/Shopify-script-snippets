/**
 * =============================================================================
 * 脚本名称：product-info
 * 用途：提取当前商品 / 变体 / 选中状态 / 价格库存信息
 * 场景：核对 variant id、排查库存显示、确认卖价与 compare_at
 * 用法：在商品详情页运行；右上角浮层展示，Console 同步输出
 *   __toolbox.productInfo.refresh()
 *   __toolbox.productInfo.copy()
 *   __toolbox.productInfo.hide()
 *   __toolbox.productInfo.report
 * =============================================================================
 */
(function productInfo() {
  'use strict';

  const NS = 'productInfo';
  const PANEL_ID = 'toolbox-product-info-panel';
  const LOG = '%c[Toolbox] product-info';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const money = (cents, currency) => {
    if (cents == null) return '(null)';
    const n = Number(cents) / 100;
    const code = currency || window.Shopify?.currency?.active || 'USD';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${code}`;
    }
  };

  function parseJsonScript(selectors) {
    for ( const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el?.textContent?.trim()) continue;
      try {
        return { source: sel, data: JSON.parse(el.textContent) };
      } catch (e) {
        console.warn(LOG, LOG_STYLE, 'JSON 解析失败:', sel, e);
      }
    }
    return null;
  }

  function getHandle() {
    const fromPath = location.pathname.match(/\/products\/([^/?#]+)/);
    if (fromPath) return decodeURIComponent(fromPath[1]);
    return null;
  }

  function getSelectedVariantId() {
    const form = document.querySelector('form[action*="/cart/add"]');
    const input =
      form?.querySelector('[name="id"]:checked') ||
      form?.querySelector('[name="id"]');
    if (input?.value) return Number(input.value) || input.value;

    const match = location.search.match(/[?&]variant=(\d+)/);
    if (match) return Number(match[1]);
    return null;
  }

  async function fetchProductJson(handle) {
    if (!handle) return null;
    const root = window.Shopify?.routes?.root || '/';
    const res = await fetch(`${root}products/${handle}.js`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return res.json();
  }

  function normalizeProduct(product, source) {
    if (!product || typeof product !== 'object') return null;
    // 有些主题 JSON 只是 variants 数组
    if (Array.isArray(product)) {
      return {
        source,
        id: null,
        title: document.querySelector('h1')?.textContent?.trim() || null,
        handle: getHandle(),
        variants: product,
      };
    }
    return {
      source,
      id: product.id ?? null,
      title: product.title ?? document.querySelector('h1')?.textContent?.trim() ?? null,
      handle: product.handle ?? getHandle(),
      vendor: product.vendor ?? null,
      type: product.type ?? null,
      tags: product.tags ?? null,
      options: product.options ?? null,
      variants: Array.isArray(product.variants) ? product.variants : [],
      raw: product,
    };
  }

  async function collectProduct() {
    const handle = getHandle();
    const selectedVariantId = getSelectedVariantId();

    const parsed = parseJsonScript([
      'script[type="application/json"][data-product-json]',
      '#ProductJson-product-template',
      '[id^="ProductJson"]',
      'script[type="application/json"].product-json',
      'product-info script[type="application/json"]',
      'variant-selects script[type="application/json"]',
      'variant-radios script[type="application/json"]',
    ]);

    let product = normalizeProduct(parsed?.data, parsed?.source || null);

    // Dawn 等主题：variant-selects 里常常只有 variants 数组
    if (!product?.variants?.length && parsed?.data && Array.isArray(parsed.data)) {
      product = normalizeProduct(parsed.data, parsed.source);
    }

    if (!product?.variants?.length) {
      const remote = await fetchProductJson(handle);
      if (remote) {
        product = normalizeProduct(remote, `/products/${handle}.js`);
      }
    }

    const variants = product?.variants || [];
    const selected =
      variants.find((v) => String(v.id) === String(selectedVariantId)) ||
      variants.find((v) => v.available) ||
      variants[0] ||
      null;

    const currency = window.Shopify?.currency?.active || null;

    return {
      collectedAt: new Date().toISOString(),
      url: location.href,
      isProductPage: Boolean(handle),
      handle: product?.handle || handle,
      productId: product?.id,
      title: product?.title,
      vendor: product?.vendor,
      type: product?.type,
      tags: product?.tags,
      options: product?.options,
      jsonSource: product?.source || null,
      selectedVariantId,
      selectedVariant: selected
        ? {
            id: selected.id,
            title: selected.title,
            sku: selected.sku,
            barcode: selected.barcode,
            price: selected.price,
            price_fmt: money(selected.price, currency),
            compare_at_price: selected.compare_at_price,
            compare_at_price_fmt: money(selected.compare_at_price, currency),
            available: selected.available,
            inventory_quantity: selected.inventory_quantity,
            option1: selected.option1,
            option2: selected.option2,
            option3: selected.option3,
          }
        : null,
      variantCount: variants.length,
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        price: v.price,
        price_fmt: money(v.price, currency),
        compare_at_price: v.compare_at_price,
        available: v.available,
        inventory_quantity: v.inventory_quantity,
      })),
      raw: product?.raw || product || null,
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
    .k { width: 36%; color: #5c6658; padding-right: 10px; }
    .v { color: #1b1f1a; word-break: break-word; white-space: pre-wrap; font-weight: 500; }
    .muted { color: #7a8576; }
    .ok { color: #15803d; }
    .bad { color: #b42318; }
    .variant { border-bottom: 1px solid #eef2ea; padding: 8px 0; }
    .variant:last-child { border-bottom: 0; }
    .variant .meta { color: #5c6658; font-size: 11px; margin-top: 2px; }
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

  function variantsHtml(report) {
    if (!report.variants?.length) {
      return `<p class="muted">未找到 variants。请确认当前是商品页，或主题是否输出 product JSON。</p>`;
    }
    return report.variants
      .map((v) => {
        const selected = String(v.id) === String(report.selectedVariantId);
        const avail = v.available ? 'ok' : 'bad';
        return `
          <div class="variant">
            <div>
              ${selected ? '▶ ' : ''}<strong>${escapeHtml(v.title || v.id)}</strong>
              <span class="${avail}">${v.available ? 'available' : 'sold out'}</span>
            </div>
            <div class="meta">
              id=${escapeHtml(v.id)} · ${escapeHtml(v.price_fmt)}
              ${v.sku ? ` · sku=${escapeHtml(v.sku)}` : ''}
              ${
                v.inventory_quantity != null
                  ? ` · qty=${escapeHtml(v.inventory_quantity)}`
                  : ''
              }
            </div>
          </div>`;
      })
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

  function renderPanel(report) {
    const root = getPanelRoot();
    const badge = report.isProductPage
      ? `${report.variantCount} variants`
      : 'Not a product page?';

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Product Info</strong>
            <span class="tb-badge">${escapeHtml(badge)}</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          <section class="tb-sec"><h4>Product</h4><table>${rowsHtml({
            title: report.title,
            handle: report.handle,
            productId: report.productId,
            vendor: report.vendor,
            type: report.type,
            jsonSource: report.jsonSource,
          })}</table></section>
          <section class="tb-sec"><h4>Selected variant</h4><table>${rowsHtml(
            report.selectedVariant || { info: '(未选中 / 未找到)' }
          )}</table></section>
          <section class="tb-sec"><h4>Variants</h4>${variantsHtml(report)}</section>
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
    console.log('完整报告 → window.__toolbox.productInfo.report');
    console.log('选中变体:', report.selectedVariant);
    if (report.variants?.length) console.table(report.variants);
    console.log(report);
    if (!report.variants?.length) {
      console.warn('未找到商品 JSON。请确认当前是商品页，或主题是否输出 product JSON。');
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
    async refresh() {
      const report = await collectProduct();
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
