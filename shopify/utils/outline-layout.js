/**
 * =============================================================================
 * 脚本名称：outline-layout
 * 用途：给页面元素描边，快速发现溢出、重叠、意外宽高
 * 场景：横向滚动条排查、flex/grid 错位、第三方 app 撑破布局
 * 用法：运行后浮层控制；再次点「关闭描边」或面板关闭按钮
 *   __toolbox.outlineLayout.enable()
 *   __toolbox.outlineLayout.disable()
 *   __toolbox.outlineLayout.scanOverflow()
 *   __toolbox.outlineLayout.hide()
 * =============================================================================
 */
(function outlineLayout() {
  'use strict';

  const NS = 'outlineLayout';
  const PANEL_ID = 'toolbox-outline-layout-panel';
  const STYLE_ID = 'toolbox-outline-layout-style';
  const ROOT_CLASS = 'toolbox-outline-on';
  const OVERFLOW_CLASS = 'toolbox-overflow-x';
  const LOG = '%c[Toolbox] outline-layout';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const state = {
    mode: 'all', // all | sections | overflow
    enabled: false,
    overflowCount: 0,
    sectionCount: 0,
  };

  function ensurePageStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = `
      html.${ROOT_CLASS}[data-toolbox-outline="all"] body *:not(#${PANEL_ID}):not(#${PANEL_ID} *) {
        outline: 1px solid rgba(59, 130, 246, 0.28) !important;
      }
      html.${ROOT_CLASS}[data-toolbox-outline="all"] body *:not(#${PANEL_ID}):not(#${PANEL_ID} *):hover {
        outline: 2px solid #3b82f6 !important;
      }
      html.${ROOT_CLASS}[data-toolbox-outline="sections"] .shopify-section {
        outline: 2px solid rgba(59, 130, 246, 0.55) !important;
        outline-offset: -2px;
      }
      html.${ROOT_CLASS}[data-toolbox-outline="sections"] .shopify-section:hover {
        outline-color: #1e3a8a !important;
      }
      html.${ROOT_CLASS} .${OVERFLOW_CLASS} {
        outline: 3px solid #ea580c !important;
        outline-offset: 0 !important;
        background-color: rgba(234, 88, 12, 0.08) !important;
      }
      html.${ROOT_CLASS}[data-toolbox-outline="overflow"] body *:not(.${OVERFLOW_CLASS}):not(#${PANEL_ID}):not(#${PANEL_ID} *) {
        outline: none !important;
      }
    `;
  }

  function clearOverflowMarks() {
    document.querySelectorAll(`.${OVERFLOW_CLASS}`).forEach((el) => {
      el.classList.remove(OVERFLOW_CLASS);
    });
    state.overflowCount = 0;
  }

  function scanOverflow() {
    clearOverflowMarks();
    const docWidth = document.documentElement.clientWidth;
    let count = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.width > docWidth + 1 || rect.right > docWidth + 1 || rect.left < -1) {
        el.classList.add(OVERFLOW_CLASS);
        count += 1;
      }
    });
    state.overflowCount = count;
    state.sectionCount = document.querySelectorAll('.shopify-section').length;
    return count;
  }

  function enable(mode) {
    ensurePageStyle();
    if (mode) state.mode = mode;
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.setAttribute('data-toolbox-outline', state.mode);
    scanOverflow();
    state.enabled = true;
    renderPanel();
    console.group(LOG, LOG_STYLE);
    console.log('描边已开启，模式:', state.mode);
    console.log('疑似横向溢出:', state.overflowCount);
    console.log('Sections:', state.sectionCount);
    console.info('Elements 面板可筛 class=', OVERFLOW_CLASS);
    console.groupEnd();
  }

  function disable() {
    document.documentElement.classList.remove(ROOT_CLASS);
    document.documentElement.removeAttribute('data-toolbox-outline');
    clearOverflowMarks();
    document.getElementById(STYLE_ID)?.remove();
    state.enabled = false;
    renderPanel();
    console.info(LOG, LOG_STYLE, '已关闭布局描边');
  }

  function setMode(mode) {
    state.mode = mode;
    if (state.enabled) {
      document.documentElement.setAttribute('data-toolbox-outline', mode);
      if (mode === 'overflow') scanOverflow();
      renderPanel();
    } else {
      enable(mode);
    }
  }

  const PANEL_CSS = `
    :host {
      all: initial;
      display: block;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483646 !important;
      width: min(380px, calc(100vw - 24px));
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
    .tb-modes {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 10px 14px; border-bottom: 1px solid #dde3d8; background: #f6f7f4;
    }
    .tb-body { padding: 12px 14px 14px; background: #f6f7f4; }
    .card {
      background: #fff; border: 1px solid #dde3d8; border-radius: 10px;
      padding: 10px 12px; margin: 0 0 10px;
    }
    .row {
      display: flex; justify-content: space-between; gap: 8px;
      padding: 4px 0; border-bottom: 1px solid #eef2ea;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .row:last-child { border-bottom: 0; }
    .k { color: #5c6658; }
    .v { color: #1b1f1a; font-weight: 600; text-align: right; }
    .hint { color: #5c6658; font-size: 12px; margin: 0; }
    .legend { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .legend span {
      display: flex; align-items: center; gap: 8px; color: #5c6658; font-size: 12px;
    }
    .swatch {
      width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
      border: 2px solid #3b82f6; background: rgba(59,130,246,.12);
    }
    .swatch.warn { border-color: #ea580c; background: rgba(234,88,12,.12); }
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

  function renderPanel() {
    const root = getPanelRoot();
    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Outline Layout</strong>
            <span class="tb-badge">${state.enabled ? `ON · ${escapeHtml(state.mode)}` : 'OFF'}</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="toggle">${state.enabled ? '关闭描边' : '开启描边'}</button>
            <button type="button" data-act="rescan">重扫溢出</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-modes">
          <button type="button" class="chip${state.mode === 'all' ? ' active' : ''}" data-mode="all">全部元素</button>
          <button type="button" class="chip${state.mode === 'sections' ? ' active' : ''}" data-mode="sections">仅 Section</button>
          <button type="button" class="chip${state.mode === 'overflow' ? ' active' : ''}" data-mode="overflow">仅溢出</button>
        </div>
        <div class="tb-body">
          <div class="card">
            <div class="row"><span class="k">status</span><span class="v">${state.enabled ? 'enabled' : 'disabled'}</span></div>
            <div class="row"><span class="k">mode</span><span class="v">${escapeHtml(state.mode)}</span></div>
            <div class="row"><span class="k">overflow-x</span><span class="v">${state.overflowCount}</span></div>
            <div class="row"><span class="k">sections</span><span class="v">${state.sectionCount}</span></div>
          </div>
          <div class="card">
            <p class="hint">蓝色描边 = 布局轮廓；橙色描边 = 疑似横向溢出（class: ${OVERFLOW_CLASS}）。</p>
            <div class="legend">
              <span><i class="swatch"></i> 普通 / Section 描边</span>
              <span><i class="swatch warn"></i> 横向溢出候选</span>
            </div>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'toggle') {
          if (state.enabled) disable();
          else enable(state.mode);
        }
        if (act === 'rescan') {
          if (!state.enabled) enable(state.mode);
          else {
            scanOverflow();
            renderPanel();
            console.info(LOG, LOG_STYLE, '溢出重扫:', state.overflowCount);
          }
        }
        if (act === 'hide') api.hide();
      });
    });

    root.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.getAttribute('data-mode') || 'all');
      });
    });
  }

  const api = {
    enable,
    disable,
    setMode,
    scanOverflow,
    get state() {
      return { ...state };
    },
    hide() {
      disable();
      document.getElementById(PANEL_ID)?.remove();
    },
    off() {
      api.hide();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;

  // 默认开启「全部元素」描边并展示面板
  enable('all');
})();
