/**
 * =============================================================================
 * 脚本名称：broken-images
 * 用途：高亮破损图片、空 src、懒加载未就绪 / 失败的图片
 * 场景：上线前扫图、排查 CDN / 懒加载 / 拼写错误导致的裂图
 * 用法：任意页面运行；点击列表可滚动定位
 *   __toolbox.brokenImages.refresh()
 *   __toolbox.brokenImages.copy()
 *   __toolbox.brokenImages.hide()
 *   __toolbox.brokenImages.report
 * =============================================================================
 */
(function brokenImages() {
  'use strict';

  const NS = 'brokenImages';
  const PANEL_ID = 'toolbox-broken-images-panel';
  const STYLE_ID = 'toolbox-broken-images-style';
  const MARK_CLASS = 'toolbox-broken-image';
  const LOG = '%c[Toolbox] broken-images';
  const LOG_STYLE = 'color:#3b82f6;font-weight:bold';

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function ensureMarkStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${MARK_CLASS} {
        outline: 3px solid #b42318 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(180, 35, 24, 0.15) !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function clearMarks() {
    document.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => {
      el.classList.remove(MARK_CLASS);
    });
  }

  function shortUrl(url) {
    if (!url) return '(empty)';
    try {
      const u = new URL(url, location.href);
      const path = u.pathname + u.search;
      return path.length > 72 ? `${path.slice(0, 69)}…` : path;
    } catch {
      return String(url).slice(0, 72);
    }
  }

  function classifyImg(img) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    const dataSrc =
      img.getAttribute('data-src') ||
      img.getAttribute('data-srcset') ||
      img.getAttribute('data-original') ||
      '';
    const srcset = img.getAttribute('srcset') || '';
    const complete = img.complete;
    const natural = img.naturalWidth;

    if (!src && !srcset && !dataSrc) {
      return { status: 'empty-src', detail: '无 src / srcset / data-src' };
    }
    if (!src && dataSrc) {
      return { status: 'lazy-pending', detail: `懒加载未应用 · ${shortUrl(dataSrc)}` };
    }
    if (complete && natural === 0) {
      return { status: 'broken', detail: shortUrl(src || srcset) };
    }
    if (!complete) {
      return { status: 'loading', detail: shortUrl(src || srcset) };
    }
    return null;
  }

  function collectIssues() {
    ensureMarkStyle();
    clearMarks();

    const images = [...document.images];
    const issues = [];

    images.forEach((img, index) => {
      const result = classifyImg(img);
      if (!result) return;

      img.classList.add(MARK_CLASS);
      const rect = img.getBoundingClientRect();
      issues.push({
        index,
        status: result.status,
        detail: result.detail,
        alt: img.alt || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
        src: img.currentSrc || img.getAttribute('src') || '',
        dataSrc:
          img.getAttribute('data-src') ||
          img.getAttribute('data-srcset') ||
          img.getAttribute('data-original') ||
          '',
      });
    });

    // background-image 无法可靠检测加载失败，这里只标空/无效 url 的常见写法
    const bgSuspects = [];
    document.querySelectorAll('[style*="background"]').forEach((el, i) => {
      const bg = getComputedStyle(el).backgroundImage || '';
      if (!bg || bg === 'none') return;
      if (/url\(\s*['"]?\s*['"]?\s*\)/i.test(bg) || /url\(\s*undefined|null|\)/i.test(bg)) {
        el.classList.add(MARK_CLASS);
        bgSuspects.push({
          index: `bg-${i}`,
          status: 'empty-bg',
          detail: bg.slice(0, 80),
          alt: el.className || el.tagName,
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height),
          top: Math.round(el.getBoundingClientRect().top + window.scrollY),
          src: '',
          dataSrc: '',
        });
      }
    });

    return {
      collectedAt: new Date().toISOString(),
      url: location.href,
      totalImages: images.length,
      issueCount: issues.length + bgSuspects.length,
      broken: issues.filter((x) => x.status === 'broken').length,
      emptySrc: issues.filter((x) => x.status === 'empty-src').length,
      lazyPending: issues.filter((x) => x.status === 'lazy-pending').length,
      loading: issues.filter((x) => x.status === 'loading').length,
      emptyBg: bgSuspects.length,
      issues: [...issues, ...bgSuspects],
    };
  }

  function scrollToIssue(issue) {
    // 优先按当前 DOM 再匹配
    const imgs = [...document.images];
    let el = null;
    if (typeof issue.index === 'number') el = imgs[issue.index];
    if (!el && issue.src) {
      el = imgs.find((img) => (img.currentSrc || img.getAttribute('src')) === issue.src);
    }
    if (!el) {
      el = document.querySelector(`.${MARK_CLASS}`);
    }
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add(MARK_CLASS);
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
    .title { font-weight: 700; color: #1b1f1a; }
    .meta {
      margin-top: 3px; color: #5c6658; font-size: 11px; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .pill {
      display: inline-block; border-radius: 999px; padding: 1px 7px; margin-right: 6px;
      font-size: 10px; font-weight: 700; border: 1px solid #fecaca;
      color: #b42318; background: #fef3f2;
    }
    .pill.lazy { border-color: #fcd34d; color: #92400e; background: #fffbeb; }
    .pill.loading { border-color: #bfdbfe; color: #1e3a8a; background: #eff6ff; }
    .pill.empty { border-color: #dde3d8; color: #5c6658; background: #f6f7f4; }
    .ok { color: #15803d; padding: 10px 0; }
    .hint { color: #5c6658; font-size: 12px; margin: 8px 0 0; }
  `;

  function statusPill(status) {
    if (status === 'broken') return '<span class="pill">broken</span>';
    if (status === 'lazy-pending') return '<span class="pill lazy">lazy</span>';
    if (status === 'loading') return '<span class="pill loading">loading</span>';
    if (status === 'empty-src') return '<span class="pill empty">empty-src</span>';
    if (status === 'empty-bg') return '<span class="pill empty">empty-bg</span>';
    return `<span class="pill empty">${escapeHtml(status)}</span>`;
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
    const list = report.issues.length
      ? report.issues
          .map(
            (issue, i) => `
        <button type="button" class="row" data-issue="${i}">
          <div class="title">${statusPill(issue.status)}${escapeHtml(issue.alt || '(no alt)')}</div>
          <div class="meta">${escapeHtml(issue.detail)}</div>
          <div class="meta">${issue.width}×${issue.height} · top ${issue.top}px</div>
        </button>`
          )
          .join('')
      : `<p class="ok">未发现破损 / 空 src 图片 🎉</p>`;

    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="tb-root">
        <div class="tb-hd">
          <div class="tb-hd-main">
            <strong>Broken Images</strong>
            <span class="tb-badge">${report.issueCount} issues / ${report.totalImages} imgs</span>
          </div>
          <div class="tb-actions">
            <button type="button" data-act="refresh">刷新</button>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="clear">去高亮</button>
            <button type="button" data-act="hide">关闭</button>
          </div>
        </div>
        <div class="tb-body">
          <div class="summary">
            <div>broken: <b>${report.broken}</b></div>
            <div>empty-src: <b>${report.emptySrc}</b></div>
            <div>lazy-pending: <b>${report.lazyPending}</b></div>
            <div>loading: <b>${report.loading}</b></div>
          </div>
          <div class="card">${list}</div>
          <p class="hint">红色描边为问题图片；点击列表可滚动定位。懒加载图若稍后加载成功，再点刷新即可。</p>
        </div>
      </div>
    `;

    root.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'refresh') await api.refresh();
        if (act === 'copy') await api.copy();
        if (act === 'clear') {
          clearMarks();
          console.info(LOG, LOG_STYLE, '已清除高亮');
        }
        if (act === 'hide') api.hide();
      });
    });

    root.querySelectorAll('button[data-issue]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-issue'));
        const issue = api.report?.issues?.[i];
        if (issue) scrollToIssue(issue);
      });
    });
  }

  function logReport(report) {
    console.group(LOG, LOG_STYLE);
    console.log(
      `${report.issueCount} issues / ${report.totalImages} images · broken ${report.broken}`
    );
    if (report.issues.length) console.table(report.issues);
    else console.log('未发现破损图片');
    console.log('完整报告 → window.__toolbox.brokenImages.report');
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
      // 给仍在加载的图片一点时间再判一次
      await new Promise((r) => setTimeout(r, 50));
      const report = collectIssues();
      api.report = report;
      renderPanel(report);
      logReport(report);
      return report;
    },
    async copy() {
      const report = api.report || (await api.refresh());
      return copyText(JSON.stringify(report, null, 2));
    },
    clearMarks,
    hide() {
      clearMarks();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(PANEL_ID)?.remove();
    },
    off() {
      api.hide();
    },
  };

  window.__toolbox = window.__toolbox || {};
  window.__toolbox[NS] = api;
  api.refresh();
})();
