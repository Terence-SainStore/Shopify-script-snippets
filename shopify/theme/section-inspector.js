/**
 * =============================================================================
 * 脚本名称：section-inspector
 * 用途：列出当前页所有 Shopify Section，点击滚动定位并高亮
 * 场景：改某个区块样式却找不到 DOM / section id；排查 Section 重复渲染
 * 用法：任意前台页面运行；右上角浮层可点选定位
 *   __toolbox.sectionInspector.refresh()
 *   __toolbox.sectionInspector.scrollTo(idOrIndex)
 *   __toolbox.sectionInspector.hide()
 *   __toolbox.sectionInspector.sections
 * =============================================================================
 */
(function sectionInspector() {
  'use strict';

  const NS = 'sectionInspector';
  const PANEL_ID = 'toolbox-section-inspector-panel';
  const FLASH_STYLE_ID = 'toolbox-section-flash-style';
  const LOG = '%c[Toolbox] section-inspector';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function ensureFlashStyle() {
    if (document.getElementById(FLASH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FLASH_STYLE_ID;
    style.textContent = `
      .toolbox-section-flash {
        outline: 3px solid #3b82f6 !important;
        outline-offset: 4px !important;
        transition: outline-color .2s ease;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function collectSections() {
    return [...document.querySelectorAll('.shopify-section')].map((el, index) => {
      const id = el.id || '';
      const sectionId = id.replace(/^shopify-section-/, '') || null;
      const typeHint =
        [...el.classList]
          .find((c) => c.startsWith('shopify-section-') && c !== 'shopify-section')
          ?.replace(/^shopify-section-/, '') || null;
      const heading =
        el.querySelector('h1, h2, h3, .h1, .h2, .h3')?.textContent?.trim()?.slice(0, 80) ||
        '';

      return {
        index,
        id,
        sectionId,
        typeHint,
        heading,
        childCount: el.children.length,
        top: Math.round(el.getBoundingClientRect().top + window.scrollY),
        height: Math.round(el.getBoundingClientRect().height),
      };
    });
  }

  function scrollToSection(idOrIndex) {
    ensureFlashStyle();
    const sections = [...document.querySelectorAll('.shopify-section')];
    let el = null;

    if (typeof idOrIndex === 'number') {
      el = sections[idOrIndex];
    } else {
      const key = String(idOrIndex);
      el =
        document.getElementById(key) ||
        document.getElementById(`shopify-section-${key}`) ||
        document.querySelector(`#shopify-section-${CSS.escape(key)}`);
    }

    if (!el) {
      console.warn(LOG, LOG_STYLE, '未找到 section:', idOrIndex);
      return null;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('toolbox-section-flash');
    setTimeout(() => el.classList.remove('toolbox-section-flash'), 2500);
    console.log(LOG, LOG_STYLE, '已定位:', el.id || el, el);
    return el;
  }

  const PANEL_CSS = `
    :host {
      all: initial;
      display: block;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483646 !important;
      width: min(440px, calc(100vw - 24px));
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
    .tb-body { padding: 8px 10px 12px; background: #f6f7f4; }
    .row {
      display: block; width: 100%; text-align: left;
      border: 1px solid #dde3d8; border-radius: 10px;
      background: #fff; color: inherit; padding: 10px 12px;
      margin: 0 0 6px; cursor: pointer; font: inherit;
    }
    .row:hover { border-color: #3b82f6; background: #eff6ff; }
    .row .title { color: #1b1f1a; font-weight: 600; }
    .row .meta {
      color: #5c6658; font-size: 11px; margin-top: 2px; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .muted { color: #7a8576; padding: 8px; }
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

  function renderPanel(sections) {
    const root = getPanelRoot();
    const list = sections.length
      ? sections
          .map(
            (s) => `
        <button type="button" class="row" data-index="${s.index}">
          <div class="title">#${s.index} ${escapeHtml(s.sectionId || s.id || '(no id)')}</div>
          <div class="meta">
            ${s.heading ? escapeHtml(s.heading) + ' · ' : ''}
            top=${s.top}px · h=${s.height}px · children=${s.childCount}
            ${s.typeHint ? ` · ${escapeHtml(s.typeHint)}` : ''}
          </div>
        </button>`
          )
          .join('')
      : `<p class="muted">未找到 .shopify-section</p>`;

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Section Inspector</strong>
            <span class="tb-badge">${sections.length} sections</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">${list}</div>
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

    root.querySelectorAll('button.row[data-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        api.scrollTo(Number(btn.getAttribute('data-index')));
      });
    });
  }

  function logSections(sections) {
    console.group(LOG, LOG_STYLE);
    console.log(`共 ${sections.length} 个 .shopify-section`);
    console.table(sections);
    console.info(
      '定位: __toolbox.sectionInspector.scrollTo(0) 或 scrollTo("header")'
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
    sections: [],
    refresh() {
      const sections = collectSections();
      api.sections = sections;
      renderPanel(sections);
      logSections(sections);
      return sections;
    },
    scrollTo: scrollToSection,
    async copy() {
      const sections = api.sections.length ? api.sections : api.refresh();
      return copyText(JSON.stringify(sections, null, 2));
    },
    hide() {
      document.querySelectorAll('.toolbox-section-flash').forEach((el) => {
        el.classList.remove('toolbox-section-flash');
      });
      document.getElementById(FLASH_STYLE_ID)?.remove();
      document.getElementById(PANEL_ID)?.remove();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
