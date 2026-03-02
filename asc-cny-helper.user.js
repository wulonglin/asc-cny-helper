// ==UserScript==
// @name         AppStoreConnect 汇率时间助手
// @namespace    https://wulonglin.xyz/
// @version      1.0.1
// @author       wulonglin
// @description  AppStoreConnect 趋势页面 USD 自动转 CNY（实时汇率），UTC 时间转北京时间（+8小时），英文日期转中文格式
// @homepageURL  https://github.com/wulonglin/asc-cny-helper
// @supportURL   https://github.com/wulonglin/asc-cny-helper/issues
// @updateURL    https://raw.githubusercontent.com/wulonglin/asc-cny-helper/main/asc-cny-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/wulonglin/asc-cny-helper/main/asc-cny-helper.user.js
// @match        https://appstoreconnect.apple.com/trends/*
// @match        https://appstoreconnect.apple.com/analytics/*
// @icon         https://appstoreconnect.apple.com/favicon.ico
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.frankfurter.app
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  const CFG = {
    enableFX: true,
    enableKMBExpand: true,
    enable24hAxis: true,
    fallbackUsdCny: 7.20,
    cnyDigits: 2,
    kmbDigits: 0,
    hoverDebounceMs: 120,
    markAttr: "data-asc-money-fixed",
    showStamp: true,
  };

  function stamp(text) {
    if (!CFG.showStamp) return;
    let el = document.getElementById("asc_tzfx_stamp");
    if (!el) {
      el = document.createElement("div");
      el.id = "asc_tzfx_stamp";
      el.style.cssText =
        "position:fixed;right:10px;bottom:10px;z-index:2147483647;" +
        "font:12px/1.2 -apple-system,system-ui;opacity:.55;" +
        "background:#000;color:#fff;padding:4px 6px;border-radius:6px;pointer-events:none";
      (document.documentElement || document.body).appendChild(el);
    }
    el.textContent = text;
  }

  let FX_RATE = CFG.fallbackUsdCny;

  function formatCN(n, digits) {
    if (!Number.isFinite(n)) return null;
    return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  async function getUsdCnyRate() {
    const key = "asc_fx_usdcny_cache_final_plus_v1";
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (obj?.rate && obj?.ts && Date.now() - obj.ts < 6 * 3600 * 1000) return obj.rate;
      } catch {}
    }
    try {
      const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=CNY", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const rate = j?.rates?.CNY;
        if (typeof rate === "number" && Number.isFinite(rate)) {
          localStorage.setItem(key, JSON.stringify({ rate, ts: Date.now() }));
          return rate;
        }
      }
    } catch {}
    return CFG.fallbackUsdCny;
  }

  function expandKMBInString(s) {
    if (!CFG.enableKMBExpand || !s) return s;
    if (!/[KMB]\b/.test(s)) return s;

    const re = /([¥$])?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.(\d+))?\s*([KMB])\b/g;
    return s.replace(re, (m0, sym, intPart, fracPart, unit) => {
      const numStr = (intPart || "0").replace(/,/g, "") + (fracPart ? "." + fracPart : "");
      const base = parseFloat(numStr);
      if (!Number.isFinite(base)) return m0;
      const mul = unit === "K" ? 1e3 : unit === "M" ? 1e6 : 1e9;
      const out = formatCN(base * mul, CFG.kmbDigits);
      return out ? `${sym || ""}${out}` : m0;
    });
  }

  function ampmTo24h(text) {
    if (!CFG.enable24hAxis || !text) return null;
    const re = /(\d{1,2})\s*([ap])\.?m\.?/i;
    const m = text.match(re);
    if (!m) return null;

    let h = parseInt(m[1], 10);
    const ap = m[2].toLowerCase();
    if (ap === "p" && h !== 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    h = (h + 8) % 24;

    return text.replace(re, `${String(h).padStart(2, "0")}:00`);
  }

  const shiftedTimeMark = new WeakSet();
  function shift24hTime(text, node) {
    if (!text) return null;
    if (shiftedTimeMark.has(node)) return null;

    const re = /\b(\d{1,2}):(\d{2})\b/g;
    let changed = false;

    const out = text.replace(re, (m0, hh, mm) => {
      let h = parseInt(hh, 10);
      if (!Number.isFinite(h) || h < 0 || h > 23) return m0;
      // 只转换 0-16 点（UTC时间），避免重复转换已经转换过的时间（8-23点）
      if (h >= 8 && h <= 23) return m0;
      h = (h + 8) % 24;
      changed = true;
      return `${String(h).padStart(2, "0")}:${mm}`;
    });

    if (changed) shiftedTimeMark.add(node);
    return changed ? out : null;
  }

  const SHIFT_HOURS = 8;
  const MONTH_MAP = {
    "jan": 0, "feb": 1, "mar": 2, "apr": 3, "may": 4, "jun": 5,
    "jul": 6, "aug": 7, "sep": 8, "sept": 8, "oct": 9, "nov": 10, "dec": 11
  };

  function parseEnglishDateTime(s) {
    const re = /\b([A-Za-z]{3,4})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)\b/i;
    const m = s.match(re);
    if (!m) return null;

    const monthStr = m[1].toLowerCase();
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    let hour = parseInt(m[4], 10);
    const minute = m[5] ? parseInt(m[5], 10) : 0;
    const ap = m[6].toLowerCase().startsWith("p") ? "pm" : "am";

    const month = MONTH_MAP[monthStr];
    if (month === undefined) return null;

    if (ap === "pm" && hour !== 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;

    return { year, month, day, hour, minute, fullMatch: m[0] };
  }

  function formatChineseDateTime(dt) {
    const date = new Date(Date.UTC(dt.year, dt.month, dt.day, dt.hour, dt.minute));
    date.setUTCHours(date.getUTCHours() + SHIFT_HOURS);

    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const h = String(date.getUTCHours()).padStart(2, "0");
    const min = String(date.getUTCMinutes()).padStart(2, "0");

    return `${m}月${d}日 ${h}:${min}`;
  }

  function convertEnglishDateTimeToChinese(s) {
    const dt = parseEnglishDateTime(s);
    if (!dt) return null;
    const chinese = formatChineseDateTime(dt);
    return s.replace(dt.fullMatch, chinese);
  }

  function usdNumFromText(s) {
    const x = parseFloat(String(s || "").trim().replace(/,/g, ""));
    return Number.isFinite(x) ? x : null;
  }

  function fixChartDetailSplitUsd(root) {
    const blocks = root.querySelectorAll(".chart-detail-container .MeasureDisplay .total-container");
    blocks.forEach(block => {
      const curEl = block.querySelector(".currency");
      const totalEl = block.querySelector(".total");
      if (!curEl || !totalEl) return;
      if ((curEl.textContent || "").trim() !== "$") return;
      if (block.getAttribute(CFG.markAttr) === "1") return;

      const usd = usdNumFromText(totalEl.textContent);
      if (usd === null) return;

      block.setAttribute(CFG.markAttr, "1");
      curEl.textContent = "¥";
      totalEl.textContent = formatCN(usd * FX_RATE, CFG.cnyDigits);
    });
  }

  function fixTooltipGroupSplitUsd(root) {
    const items = root.querySelectorAll(".tooltip-group-container .tooltip-items");
    items.forEach(item => {
      const curEl = item.querySelector(".default-currency");
      const valEl = item.querySelector(".value");
      if (!curEl || !valEl) return;
      if ((curEl.textContent || "").trim() !== "$") return;
      if (item.getAttribute(CFG.markAttr) === "1") return;

      const usd = usdNumFromText(valEl.textContent);
      if (usd === null) return;

      item.setAttribute(CFG.markAttr, "1");
      curEl.textContent = "¥";
      valEl.textContent = formatCN(usd * FX_RATE, CFG.cnyDigits);
    });
  }

  const REVENUE_TITLES = ["收入", "销售额"];
  function isRevenueChartYAxis(node) {
    const titleEl = document.querySelector(".measure-title-container");
    if (!titleEl) return false;
    const titleText = titleEl.textContent.trim();
    if (!REVENUE_TITLES.includes(titleText)) return false;

    const p = node.parentElement;
    if (!p) return false;
    if (p.tagName && p.tagName.toLowerCase() === "text") {
      let ancestor = p.parentElement;
      while (ancestor) {
        if (ancestor.classList && ancestor.classList.contains("rv-Chart__axis_left")) {
          return true;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return false;
  }

  const origText = new WeakMap();
  function patchTextNode(node) {
    const p = node.parentElement;
    if (!p) return;
    const tag = (p.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "textarea" || tag === "input") return;

    const cur = node.nodeValue || "";
    const hasDatePattern = /\b[A-Za-z]{3,4}\s+\d{1,2},?\s+\d{4}\b/.test(cur);
    const isYAxisNumber = isRevenueChartYAxis(node) && /^\s*[0-9]+(?:\.[0-9]+)?\s*$/.test(cur);
    const hasTimePattern = /\b\d{1,2}:\d{2}\b/.test(cur);
    const hasAmPmPattern = /\d{1,2}\s*[ap]\.?m\.?/i.test(cur);
    const hasPreviousPattern = /Previous\s+\d+\s+(Hours|Days)/i.test(cur);
    if (!cur.includes("$") && !/[KMB]\b/.test(cur) && !hasAmPmPattern && !hasDatePattern && !isYAxisNumber && !hasTimePattern && !hasPreviousPattern) return;

    if (!origText.has(node)) origText.set(node, cur);
    const orig = origText.get(node);

    let out = orig;
    out = expandKMBInString(out);

    if (CFG.enableFX && isYAxisNumber) {
      const num = parseFloat(cur.trim());
      if (Number.isFinite(num)) {
        out = `¥${formatCN(num * FX_RATE, 0)}`;
      }
    }

    if (CFG.enableFX && /US\s*\$/.test(out)) {
      const re = /US\s*\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/gi;
      out = out.replace(re, (m0, n) => {
        const usd = usdNumFromText(n);
        if (usd === null) return m0;
        return `¥${formatCN(usd * FX_RATE, CFG.cnyDigits)}`;
      });
    }

    if (CFG.enableFX && out.includes("$") && !out.includes("US¥")) {
      const re = /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/g;
      out = out.replace(re, (m0, n) => {
        const usd = usdNumFromText(n);
        if (usd === null) return m0;
        return `¥${formatCN(usd * FX_RATE, CFG.cnyDigits)}`;
      });
    }

    const dtResult = convertEnglishDateTimeToChinese(out);
    if (dtResult) out = dtResult;

    const ax = ampmTo24h(out);
    if (ax) out = ax;

    const shifted = shift24hTime(out, node);
    if (shifted) out = shifted;

    // 汉化常见英文文本
    out = out.replace(/Previous 24 Hours/g, "过去24小时");
    out = out.replace(/Previous 7 Days/g, "过去7天");
    out = out.replace(/Previous 30 Days/g, "过去30天");

    if (out !== cur) node.nodeValue = out;
  }

  function processSubtree(root) {
    if (!root || root.nodeType !== 1) return;

    if (CFG.enableFX) {
      fixChartDetailSplitUsd(root);
      fixTooltipGroupSplitUsd(root);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n, count = 0;
    while ((n = walker.nextNode())) {
      patchTextNode(n);
      if (++count > 900) break;
    }
  }

  async function start() {
    await new Promise(res => {
      const tick = () => (document.documentElement ? res() : requestAnimationFrame(tick));
      tick();
    });

    FX_RATE = CFG.enableFX ? await getUsdCnyRate() : CFG.fallbackUsdCny;
    stamp(`USD/CNY=${FX_RATE.toFixed(2)}`);

    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (node.nodeType === 1) processSubtree(node);
          else if (node.nodeType === 3) patchTextNode(node);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    const init = () => {
      if (document.body) processSubtree(document.body);
      else requestAnimationFrame(init);
    };
    init();

    let t = null;
    window.addEventListener("mousemove", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        document.querySelectorAll(".chart-detail-container, .tooltip-group-container, svg, table")
          .forEach(processSubtree);
      }, CFG.hoverDebounceMs);
    }, { passive: true });
  }

  start();
})();
