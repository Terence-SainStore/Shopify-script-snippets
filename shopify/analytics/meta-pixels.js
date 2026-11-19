/**
 * =============================================================================
 * 脚本名称：meta-pixels
 * 用途：检测页面上的 GTM / GA4 / Meta / TikTok / Klaviyo 等埋点与像素
 * 场景：核对追踪是否加载、对比多站埋点差异、上线前扫像素
 * 用法：任意页面运行
 *   __toolbox.metaPixels.refresh()
 *   __toolbox.metaPixels.copy()
 *   __toolbox.metaPixels.hide()
 *   __toolbox.metaPixels.report
 * =============================================================================
 */
(function metaPixels() {
  'use strict';

  const NS = 'metaPixels';
  const PANEL_ID = 'toolbox-meta-pixels-panel';
  const LOG = '%c[Toolbox] meta-pixels';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const DETECTORS = [
    {
      id: 'gtm',
      name: 'Google Tag Manager',
      globals: ['google_tag_manager', 'dataLayer'],
      scriptRe: /googletagmanager\.com\/gtm\.js|gtm\.js\?id=GTM-/i,
      idRe: /GTM-[A-Z0-9]+/i,
    },
    {
      id: 'ga4',
      name: 'Google Analytics 4 / gtag',
      globals: ['gtag', 'gaGlobal', 'google_tag_data'],
      scriptRe: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\/collect|gtag\/js\?id=G-/i,
      idRe: /\bG-[A-Z0-9]+\b|\bUA-\d+-\d+\b/i,
    },
    {
      id: 'meta',
      name: 'Meta Pixel (Facebook)',
      globals: ['fbq', '_fbq'],
      scriptRe: /connect\.facebook\.net\/.*\/fbevents\.js|facebook\.com\/tr\?/i,
      idRe: /fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/i,
    },
    {
      id: 'tiktok',
      name: 'TikTok Pixel',
      globals: ['ttq'],
      scriptRe: /analytics\.tiktok\.com|tiktok.*pixel|ttq\.load/i,
      idRe: /ttq\.load\(\s*['"]([A-Z0-9]+)['"]/i,
    },
    {
      id: 'klaviyo',
      name: 'Klaviyo',
      globals: ['_learnq', 'klaviyo'],
      scriptRe: /static\.klaviyo\.com|klaviyo\.com\/media\/js|klaviyo\.js/i,
      idRe: /klaviyo\.com\/.*company_id=([A-Z0-9]+)|_learnq\.push/i,
    },
    {
      id: 'pinterest',
      name: 'Pinterest Tag',
      globals: ['pintrk'],
      scriptRe: /s\.pinimg\.com\/ct\/core\.js|pintrk\(/i,
      idRe: /pintrk\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/i,
    },
    {
      id: 'snap',
      name: 'Snapchat Pixel',
      globals: ['snaptr'],
      scriptRe: /sc-static\.net\/scevent\.min\.js|snaptr\(/i,
      idRe: /snaptr\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]+)['"]/i,
    },
    {
      id: 'clarity',
      name: 'Microsoft Clarity',
      globals: ['clarity'],
      scriptRe: /clarity\.ms\/tag\//i,
      idRe: /clarity\.ms\/tag\/([a-z0-9]+)/i,
    },
    {
      id: 'hotjar',
      name: 'Hotjar',
      globals: ['hj', 'hjSiteSettings'],
      scriptRe: /static\.hotjar\.com|hotjar-/i,
      idRe: /static\.hotjar\.com\/c\/hotjar-(\d+)/i,
    },
    {
      id: 'shopifyWebPixels',
      name: 'Shopify Web Pixels',
      globals: ['Shopify', 'webPixelsManager'],
      scriptRe: /web-pixels-manager|shopifycloud\.com\/.*web-pixel|cdn\.shopify\.com\/.*web-pixels/i,
      idRe: null,
    },
    {
      id: 'elevar',
      name: 'Elevar',
      globals: ['ElevarDataLayer', 'ElevarEvents'],
      scriptRe: /elevar|getelevar\.com/i,
      idRe: null,
    },
  ];

  function collectScriptSources() {
    return [...document.scripts]
      .map((el) => ({
        src: el.src || '',
        inline: !el.src ? (el.textContent || '').slice(0, 4000) : '',
      }))
      .filter((s) => s.src || s.inline);
  }

  function detectOne(det, scripts) {
    const globalHits = (det.globals || []).filter((g) => {
      try {
        return typeof window[g] !== 'undefined' && window[g] != null;
      } catch {
        return false;
      }
    });

    const scriptHits = [];
    const ids = new Set();

    scripts.forEach((s) => {
      const blob = `${s.src}\n${s.inline}`;
      if (det.scriptRe && det.scriptRe.test(blob)) {
        scriptHits.push(s.src || '(inline script)');
        if (det.idRe) {
          const m = blob.match(det.idRe);
          if (m) ids.add(m[1] || m[0]);
        }
      }
      // 也从整页 HTML 轻量扫 id（限前段，避免太慢）
    });

    // gtag/GTM ids from dataLayer-ish config
    if (det.id === 'gtm' || det.id === 'ga4') {
      const html = document.documentElement.innerHTML.slice(0, 200000);
      const re = det.id === 'gtm' ? /GTM-[A-Z0-9]+/g : /\bG-[A-Z0-9]+\b/g;
      const matches = html.match(re) || [];
      matches.forEach((id) => ids.add(id));
    }

    if (det.id === 'meta' && typeof window.fbq === 'function') {
      try {
        // fbq.queue / instance may expose pixels depending on version
        const q = window.fbq?.queue || [];
        q.forEach((item) => {
          if (Array.isArray(item) && item[0] === 'init' && item[1]) ids.add(String(item[1]));
        });
      } catch {
        /* ignore */
      }
    }

    const present = globalHits.length > 0 || scriptHits.length > 0 || ids.size > 0;
    return {
      id: det.id,
      name: det.name,
      present,
      globals: globalHits,
      scripts: [...new Set(scriptHits)].slice(0, 8),
      ids: [...ids],
    };
  }

  function buildReport() {
    const scripts = collectScriptSources();
    const pixels = DETECTORS.map((d) => detectOne(d, scripts));
    const found = pixels.filter((p) => p.present);

    // dataLayer 粗看长度
    let dataLayerCount = null;
    try {
      dataLayerCount = Array.isArray(window.dataLayer) ? window.dataLayer.length : null;
    } catch {
      dataLayerCount = null;
    }

    return {
      collectedAt: new Date().toISOString(),
      url: location.href,
      shop: window.Shopify?.shop || null,
      dataLayerCount,
      foundCount: found.length,
      checkedCount: pixels.length,
      pixels,
      found,
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
    .summary {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;
      margin-bottom: 10px; padding: 10px 12px; border-radius: 10px;
      background: #eff6ff; color: #1e3a8a; font-size: 12px;
    }
    .summary b { color: #1b1f1a; }
    .card {
      background: #fff; border: 1px solid #dde3d8; border-radius: 10px;
      padding: 10px 12px; margin: 0 0 8px;
    }
    .card.off { opacity: .55; }
    .name { font-weight: 700; color: #1b1f1a; }
    .pill {
      display: inline-block; margin-left: 6px; border-radius: 999px; padding: 1px 7px;
      font-size: 10px; font-weight: 700; border: 1px solid #bbf7d0; color: #15803d; background: #f0fdf4;
    }
    .pill.miss { border-color: #dde3d8; color: #5c6658; background: #f6f7f4; }
    .meta {
      margin-top: 4px; color: #5c6658; font-size: 11px; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
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

  function pixelCard(p) {
    return `
      <div class="card${p.present ? '' : ' off'}">
        <div class="name">
          ${escapeHtml(p.name)}
          <span class="pill${p.present ? '' : ' miss'}">${p.present ? 'FOUND' : 'MISS'}</span>
        </div>
        ${
          p.ids?.length
            ? `<div class="meta">ids: ${escapeHtml(p.ids.join(', '))}</div>`
            : ''
        }
        ${
          p.globals?.length
            ? `<div class="meta">globals: ${escapeHtml(p.globals.join(', '))}</div>`
            : ''
        }
        ${
          p.scripts?.length
            ? `<div class="meta">scripts: ${escapeHtml(p.scripts.join(' | '))}</div>`
            : ''
        }
      </div>`;
  }

  function renderPanel(report) {
    const root = getPanelRoot();
    // 默认把 found 放前面
    const ordered = [...report.pixels].sort((a, b) => Number(b.present) - Number(a.present));

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Meta Pixels</strong>
            <span class="tb-badge">${report.foundCount}/${report.checkedCount} found</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          <div class="summary">
            <div>found: <b>${report.foundCount}</b></div>
            <div>dataLayer: <b>${report.dataLayerCount ?? '(n/a)'}</b></div>
            <div>shop: <b>${escapeHtml(report.shop || '(n/a)')}</b></div>
            <div>checked: <b>${report.checkedCount}</b></div>
          </div>
          ${ordered.map(pixelCard).join('')}
          <p class="hint">基于 script / 全局变量 / 常见 ID 模式探测，异步晚加载的像素可再点刷新。</p>
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') api.refresh();
        if (act === 'copy') await api.copy();
        if (act === 'hide') api.hide();
      });
    });
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    console.table(
      report.pixels.map((p) => ({
        present: p.present,
        name: p.name,
        ids: p.ids.join(', '),
        globals: p.globals.join(', '),
      }))
    );
    console.log('完整报告 → window.__toolbox.metaPixels.report');
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
    refresh() {
      const report = buildReport();
      api.report = report;
      renderPanel(report);
      logReport(report);
      return report;
    },
    async copy() {
      const report = api.report || api.refresh();
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
