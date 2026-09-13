/**
 * Asemic Vein — 沿 asemic 橢圓弧跑 MixVein.paint；鉛筆描變形／線斷後的折線
 * 新種子／Space 重抽 · S 存 PNG · U 面板
 */
"use strict";

const ASE_W = 1000;
const ASE_H = 1000;
const ASE_ROWS = 4; // 幾行
const ASE_COLS = 4; // 幾列
const ASE_MARGIN = 80; // 離畫布邊緣
const ASE_LENMIN = 0.5; // 最短（格子邊長倍率）
const ASE_LENMAX = 1.5; // 最長（格子邊長倍率）
const ASE_ARCS = 3; // 每個位置畫幾條弧
//--------------------------------
const ASE_RINGS = 4; // concentric：幾層圓
const ASE_RING_GAP = 150; // concentric：每層距離
const ASE_HOBBS = 0.5; // concentric：Hobbs 變形幅度
const ASE_RING_COPIES = 3; // concentric：每層複本上限，實際 int(random(1, max+1))
const ASE_RING_SCALE = 0.4; // concentric：整體大小，1＝現況 
//--------------------------------
const ASE_BARS = 40; // barcode：中央直線條數
const ASE_BAR_H = 380; // barcode：基準高度
const ASE_BAR_TILT = 0.14; // barcode：離垂直的斜度（弧度）
const ASE_BAR_NOISE = 16; // barcode：Perlin 橫向振幅
//--------------------------------
const ASE_BRANCH_SEEDS = 20; // branch：中心往外的主枝
const ASE_BRANCH_MAX = 80; // branch：同時活著上限
const ASE_BRANCH_STEP = 3; // branch：每步長
const ASE_BRANCH_NOISE = 0.04; // branch：Perlin 座標縮放
const ASE_BRANCH_DEPTH = 3; // branch：主枝＋二層＋三層
//--------------------------------
const ASE_STAR_MIN = 7; // stars：亂數中心下限
const ASE_STAR_MAX = 12; // stars：亂數中心上限
const ASE_STAR_LEN = 120; // stars：放射線基準長
const ASE_STAR_STEP = 4; // stars：每步長
const ASE_STAR_NOISE = 0.025; // stars：Perlin 座標縮放
//--------------------------------
const ASE_THREAD_LEN = 2200; // thread：一條棉線總長
const ASE_THREAD_STEP = 3.0; // thread：每步長
const ASE_THREAD_NOISE = 0.3; // thread：轉向雜訊
//--------------------------------
const ASE_KLEE_PAD = 14; // klee：短撇基準 margin
const ASE_KLEE_LONG = 0.52; // klee：長弧佔比
const ASE_KLEE_STEP = 5; // klee：長弧步長
const ASE_KLEE_BOX_W = 500; // klee：置中畫框寬
const ASE_KLEE_BOX_H = 500; // klee：置中畫框高
//--------------------------------
const ASE_LAYOUT_N = 40; // 線條數量預設，滑桿 2–70
const ASE_PENCIL_DENS = 3; // 鉛筆 texZoom，原滑桿下限
const ASE_PAPER = [246, 236, 214];
const ASE_INK_PALETTE = [
  [0, 0, 0],
  [255, 255, 255],
  [0xf9, 0xb8, 0x29],
  [0xe5, 0x2d, 0x10],
  [0x9e, 0xb3, 0xbf],
  [0x70, 0xbc, 0x28],
  [0x1e, 0x70, 0x58],
  [0xef, 0xd0, 0x78],
  [0xf4, 0xca, 0xb2],
  [0x31, 0x97, 0xcd],
];
const ASE_PD = 2;
const ASE_LS_KEY = "vein-asemic-op-v1";

const ASE_LAB = Object.assign({}, MixVein.DEFAULTS, {
  randPath: false,
  pencil: false,
  live: true,
  nonlinear: false,
  brush: true,
  gridT: 1,
  concT: 0,
  barT: 0,
  branchT: 0,
  starT: 0,
  threadT: 0,
  kleeT: 0,
  lineN: ASE_LAYOUT_N,
  white: true,
  randColor: false,
});

let aseSeed = 1;
let texProgram;
let strokeProgram;
let img;
let hw;
let hh;
let tempPg;
let strokePg;
let asePencilReady = false;
let aseBake = null;
let aseBakePaths = null;
let aseHudDrag = null;
let aseHudHover = false;
let aseHudPress = false;
let aseHudThumbHover = null;
let aseMorphCache = null;

function aseClamp(n, lo, hi, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

function aseLayoutN() {
  return Math.round(aseClamp(ASE_LAB.lineN, 2, 70, ASE_LAYOUT_N));
}

/** 把 total 條分給 buckets 個位置，多的隨機攤。 */
function aseShareCounts(total, buckets) {
  const n = Math.max(1, Math.floor(buckets));
  const t = Math.max(0, Math.floor(total));
  const counts = new Array(n).fill(0);
  if (!t) return counts;
  const base = Math.floor(t / n);
  let left = t - base * n;
  for (let i = 0; i < n; i++) counts[i] = base;
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random(i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (let k = 0; k < left; k++) counts[order[k % n]]++;
  return counts;
}

function aseApplyPreset(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (o.leafShare != null) ASE_LAB.leafShare = aseClamp(o.leafShare, 0, 1, 0.5);
  if (o.gapFill != null) ASE_LAB.gapFill = aseClamp(o.gapFill, 2, 60, 30);
  if (o.leafLen != null) ASE_LAB.leafLen = aseClamp(o.leafLen, 0.05, 5, 1);
  if (o.leafWid != null) ASE_LAB.leafWid = aseClamp(o.leafWid, 1, 3, 1);
  if (o.leafVein != null) ASE_LAB.leafVein = aseClamp(o.leafVein, 0, 1, 0);
  if (o.leafTri != null) ASE_LAB.leafTri = aseClamp(o.leafTri, 0, 1, 0);
  if (o.leafPad != null) ASE_LAB.leafPad = aseClamp(o.leafPad, 0, 1, 1);
  if (o.leafDens != null) ASE_LAB.leafDens = aseClamp(o.leafDens, 1, 2, 1);
  if (o.leafOff != null) ASE_LAB.leafOff = aseClamp(o.leafOff, -1, 1, 0);
  if (o.leafSw != null) ASE_LAB.leafSw = aseClamp(o.leafSw, 0.5, 6, 1);
  if (o.lineSw != null) ASE_LAB.lineSw = aseClamp(o.lineSw, 0.5, 6, 1);
  if (o.swMul != null) ASE_LAB.swMul = aseClamp(o.swMul, 0.5, 5, 1);
  if (typeof o.showPath === "boolean") ASE_LAB.showPath = o.showPath;
  if (typeof o.randPath === "boolean") ASE_LAB.randPath = o.randPath;
  if (typeof o.pencil === "boolean") ASE_LAB.pencil = o.pencil;
  if (typeof o.live === "boolean") ASE_LAB.live = o.live;
  if (typeof o.white === "boolean") ASE_LAB.white = o.white;
  if (typeof o.randColor === "boolean") ASE_LAB.randColor = o.randColor;
  if (typeof o.nonlinear === "boolean") ASE_LAB.nonlinear = o.nonlinear;
  if (typeof o.brush === "boolean") ASE_LAB.brush = o.brush;
  if (o.lineN != null) ASE_LAB.lineN = Math.round(aseClamp(o.lineN, 2, 70, ASE_LAYOUT_N));
  if (
    o.gridT != null ||
    o.concT != null ||
    o.barT != null ||
    o.branchT != null ||
    o.starT != null ||
    o.threadT != null ||
    o.kleeT != null
  ) {
    if (o.gridT != null) ASE_LAB.gridT = aseClamp(o.gridT, 0, 1, 1);
    if (o.concT != null) ASE_LAB.concT = aseClamp(o.concT, 0, 1, 0);
    if (o.barT != null) ASE_LAB.barT = aseClamp(o.barT, 0, 1, 0);
    if (o.branchT != null) ASE_LAB.branchT = aseClamp(o.branchT, 0, 1, 0);
    if (o.starT != null) ASE_LAB.starT = aseClamp(o.starT, 0, 1, 0);
    if (o.threadT != null) ASE_LAB.threadT = aseClamp(o.threadT, 0, 1, 0);
    if (o.kleeT != null) ASE_LAB.kleeT = aseClamp(o.kleeT, 0, 1, 0);
  } else if (o.layoutT != null) {
    const t = aseClamp(o.layoutT, 0, 1, 0);
    ASE_LAB.gridT = 1 - t;
    ASE_LAB.concT = t;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "concentric") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 1;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "grid") {
    ASE_LAB.gridT = 1;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "barcode" || o.layout === "bar") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 1;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "branch") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 1;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "star" || o.layout === "stars") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 1;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "thread" || o.layout === "yarn") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 1;
    ASE_LAB.kleeT = 0;
  } else if (o.layout === "klee") {
    ASE_LAB.gridT = 0;
    ASE_LAB.concT = 0;
    ASE_LAB.barT = 0;
    ASE_LAB.branchT = 0;
    ASE_LAB.starT = 0;
    ASE_LAB.threadT = 0;
    ASE_LAB.kleeT = 1;
  }
  return true;
}

function aseHashSeed(a, b) {
  let x = (a >>> 0) ^ Math.imul((Number(b) * 1000) | 0, 0x9e3779b9);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0 || 1;
}

function aseRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function aseRandStep(lo, hi, step, rng) {
  const roll = rng || random;
  const n = Math.round((hi - lo) / step);
  const v = lo + Math.floor(roll() * (n + 1)) * step;
  return +v.toFixed(step >= 1 ? 0 : 2);
}

/** 葉子／直線線寬：60% 低於 2.5，30% 2.5–4.5，10% 4.5–6 */
function aseRandStrokeSw(rng) {
  const roll = rng || random;
  const r = roll();
  if (r < 0.6) return aseRandStep(0.5, 2.5, 0.05, roll);
  if (r < 0.9) return aseRandStep(2.5, 4.5, 0.05, roll);
  return aseRandStep(4.5, 6, 0.05, roll);
}

function aseLabOpts(salt) {
  return {
    leafShare: ASE_LAB.leafShare,
    gapFill: ASE_LAB.gapFill,
    leafLen: ASE_LAB.leafLen,
    leafWid: ASE_LAB.leafWid,
    leafVein: ASE_LAB.leafVein,
    leafTri: ASE_LAB.leafTri,
    leafPad: ASE_LAB.leafPad,
    leafDens: ASE_LAB.leafDens,
    leafOff: ASE_LAB.leafOff,
    leafSw: ASE_LAB.leafSw,
    lineSw: ASE_LAB.lineSw,
    swMul: ASE_LAB.swMul == null ? 1 : ASE_LAB.swMul,
    showPath: !!ASE_LAB.showPath,
    salt: salt || 0,
  };
}

/** 開「每條不同參數」時，此路徑另抽一套滑桿範圍，不改面板數值。 */
function asePathOpts(salt) {
  const o = aseLabOpts(salt);
  if (!ASE_LAB.randPath) return o;
  const rng = aseRng(aseHashSeed(aseSeed, salt || 0));
  o.leafShare = aseRandStep(0, 1, 0.01, rng);
  o.gapFill = aseRandStep(2, 60, 1, rng);
  o.leafLen = aseRandStep(0.05, 5, 0.05, rng);
  o.leafWid = aseRandStep(1, 3, 0.05, rng);
  o.leafDens = aseRandStep(1, 2, 0.05, rng);
  o.leafSw = aseRandStrokeSw(rng);
  o.lineSw = aseRandStrokeSw(rng);
  o.leafVein = aseRandStep(0, 1, 0.01, rng);
  o.leafTri = aseRandStep(0, 1, 0.01, rng);
  o.leafOff = aseRandStep(-1, 1, 0.01, rng);
  o.leafPad = aseRandStep(0, 1, 0.01, rng);
  return o;
}

function asePresetObject() {
  return {
    v: 1,
    leafShare: +Number(ASE_LAB.leafShare).toFixed(2),
    gapFill: Math.round(ASE_LAB.gapFill),
    leafLen: +Number(ASE_LAB.leafLen).toFixed(2),
    leafWid: +Number(ASE_LAB.leafWid).toFixed(2),
    leafVein: +Number(ASE_LAB.leafVein).toFixed(2),
    leafTri: +Number(ASE_LAB.leafTri).toFixed(2),
    leafPad: +Number(ASE_LAB.leafPad).toFixed(2),
    leafDens: +Number(ASE_LAB.leafDens).toFixed(2),
    leafOff: +Number(ASE_LAB.leafOff).toFixed(2),
    leafSw: +Number(ASE_LAB.leafSw).toFixed(2),
    lineSw: +Number(ASE_LAB.lineSw).toFixed(2),
    swMul: +Number(ASE_LAB.swMul == null ? 1 : ASE_LAB.swMul).toFixed(2),
    gridT: +Number(ASE_LAB.gridT || 0).toFixed(2),
    concT: +Number(ASE_LAB.concT || 0).toFixed(2),
    barT: +Number(ASE_LAB.barT || 0).toFixed(2),
    branchT: +Number(ASE_LAB.branchT || 0).toFixed(2),
    starT: +Number(ASE_LAB.starT || 0).toFixed(2),
    threadT: +Number(ASE_LAB.threadT || 0).toFixed(2),
    kleeT: +Number(ASE_LAB.kleeT || 0).toFixed(2),
    lineN: aseLayoutN(),
    nonlinear: !!ASE_LAB.nonlinear,
    brush: ASE_LAB.brush !== false,
  };
}

function aseSyncSliders() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  };
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("lab-leaf-share", ASE_LAB.leafShare);
  setText("lab-leaf-share-v", Number(ASE_LAB.leafShare).toFixed(2));
  setText("lab-share-line", Math.round((1 - ASE_LAB.leafShare) * 100) + "%");
  setText("lab-share-leaf", Math.round(ASE_LAB.leafShare * 100) + "%");
  set("lab-gap-fill", ASE_LAB.gapFill);
  setText("lab-gap-fill-v", String(Math.round(ASE_LAB.gapFill)));
  set("lab-leaf-len", ASE_LAB.leafLen);
  setText("lab-leaf-len-v", Number(ASE_LAB.leafLen).toFixed(2));
  set("lab-leaf-wid", ASE_LAB.leafWid);
  setText("lab-leaf-wid-v", Number(ASE_LAB.leafWid).toFixed(2));
  set("lab-leaf-dens", ASE_LAB.leafDens);
  setText("lab-leaf-dens-v", Number(ASE_LAB.leafDens).toFixed(2));
  set("lab-leaf-sw", ASE_LAB.leafSw);
  setText("lab-leaf-sw-v", Number(ASE_LAB.leafSw).toFixed(2));
  set("lab-line-sw", ASE_LAB.lineSw);
  setText("lab-line-sw-v", Number(ASE_LAB.lineSw).toFixed(2));
  set("lab-sw-mul", ASE_LAB.swMul == null ? 1 : ASE_LAB.swMul);
  setText("lab-sw-mul-v", Number(ASE_LAB.swMul == null ? 1 : ASE_LAB.swMul).toFixed(2));
  set("lab-leaf-vein", ASE_LAB.leafVein);
  set("lab-leaf-tri", ASE_LAB.leafTri);
  set("lab-leaf-off", ASE_LAB.leafOff);
  setText("lab-leaf-off-v", Number(ASE_LAB.leafOff).toFixed(2));
  set("lab-leaf-pad", ASE_LAB.leafPad);
  const pathEl = document.getElementById("lab-path");
  if (pathEl) pathEl.checked = !!ASE_LAB.showPath;
  const randEl = document.getElementById("lab-rand-path");
  if (randEl) randEl.checked = !!ASE_LAB.randPath;
  const pencilEl = document.getElementById("lab-pencil");
  if (pencilEl) pencilEl.checked = !!ASE_LAB.pencil;
  const nonlinearEl = document.getElementById("lab-nonlinear");
  if (nonlinearEl) nonlinearEl.checked = !!ASE_LAB.nonlinear;
  const brushEl = document.getElementById("lab-brush");
  if (brushEl) brushEl.checked = ASE_LAB.brush !== false;
  const liveEl = document.getElementById("lab-live");
  if (liveEl) liveEl.checked = ASE_LAB.live !== false;
  const whiteEl = document.getElementById("lab-white");
  if (whiteEl) whiteEl.checked = ASE_LAB.white !== false;
  const randColorEl = document.getElementById("lab-rand-color");
  if (randColorEl) randColorEl.checked = !!ASE_LAB.randColor;
  set("lab-grid", ASE_LAB.gridT || 0);
  setText("lab-grid-v", Number(ASE_LAB.gridT || 0).toFixed(2));
  set("lab-conc", ASE_LAB.concT || 0);
  setText("lab-conc-v", Number(ASE_LAB.concT || 0).toFixed(2));
  set("lab-bar", ASE_LAB.barT || 0);
  setText("lab-bar-v", Number(ASE_LAB.barT || 0).toFixed(2));
  set("lab-branch", ASE_LAB.branchT || 0);
  setText("lab-branch-v", Number(ASE_LAB.branchT || 0).toFixed(2));
  set("lab-star", ASE_LAB.starT || 0);
  setText("lab-star-v", Number(ASE_LAB.starT || 0).toFixed(2));
  set("lab-thread", ASE_LAB.threadT || 0);
  setText("lab-thread-v", Number(ASE_LAB.threadT || 0).toFixed(2));
  set("lab-klee", ASE_LAB.kleeT || 0);
  setText("lab-klee-v", Number(ASE_LAB.kleeT || 0).toFixed(2));
  set("lab-line-n", aseLayoutN());
  setText("lab-line-n-v", String(aseLayoutN()));
}

function aseCopyFallback(text, done, fail) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) done();
    else fail();
  } catch (_) {
    fail();
  }
}

function aseCopyPreset() {
  const text = JSON.stringify(asePresetObject(), null, 2) + "\n";
  const btn = document.getElementById("lab-copy");
  const done = function () {
    if (btn) {
      btn.textContent = "已複製";
      setTimeout(function () {
        btn.textContent = "複製";
      }, 1400);
    }
  };
  const fail = function () {
    if (btn) {
      btn.textContent = "複製失敗";
      setTimeout(function () {
        btn.textContent = "複製";
      }, 1600);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () {
      aseCopyFallback(text, done, fail);
    });
    return;
  }
  aseCopyFallback(text, done, fail);
}

function aseFlashLoadBtn(btn, ok) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = ok ? "已載入" : "失敗";
  setTimeout(function () {
    btn.textContent = prev;
  }, 1200);
}

function aseLoadPresetJsonText(text, btn) {
  try {
    const o = JSON.parse(text);
    if (!aseApplyPreset(o)) throw new Error("bad");
    aseSyncSliders();
    aseSaveLs();
    redraw();
    aseFlashLoadBtn(btn, true);
  } catch (_) {
    aseFlashLoadBtn(btn, false);
  }
}

function aseSaveLs() {
  try {
    localStorage.setItem(
      ASE_LS_KEY,
      JSON.stringify(
        Object.assign(asePresetObject(), {
          showPath: !!ASE_LAB.showPath,
          randPath: !!ASE_LAB.randPath,
          pencil: !!ASE_LAB.pencil,
          live: ASE_LAB.live !== false,
          white: ASE_LAB.white !== false,
          randColor: !!ASE_LAB.randColor,
          nonlinear: !!ASE_LAB.nonlinear,
          brush: ASE_LAB.brush !== false,
        })
      )
    );
  } catch (_) {}
}

function aseLoadLs() {
  try {
    const raw = localStorage.getItem(ASE_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return;
    aseApplyPreset(o);
  } catch (_) {}
}

/** 即時開：滑桿立刻重畫。關閉：只改數值與存檔，不重算 MixVein／鉛筆。 */
function aseMaybeRedraw() {
  if (ASE_LAB.live === false) return;
  redraw();
}

function aseParseUrlSeed() {
  try {
    const raw = new URLSearchParams(window.location.search).get("seed");
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const s = n >>> 0;
    return s === 0 ? 1 : s;
  } catch (_) {
    return null;
  }
}

function aseWriteUrlSeed(s) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(s));
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch (_) {}
}

function aseNewSeed(explicit) {
  if (explicit != null && Number.isFinite(explicit)) {
    aseSeed = explicit >>> 0;
    if (aseSeed === 0) aseSeed = 1;
  } else {
    aseSeed = (Math.floor(Math.random() * 1e9) % 2147483646) + 1;
  }
  aseWriteUrlSeed(aseSeed);
  aseMorphCache = null;
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
}

function asePolar(cx, cy, r, ang) {
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
}

function aseCubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function aseCubicLen(p0, p1, p2, p3) {
  return (
    Math.hypot(p1.x - p0.x, p1.y - p0.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(p3.x - p2.x, p3.y - p2.y)
  );
}

/** 立方貝茲抽點，給 MixVein.paint 當開放路徑。 */
function aseCubicPts(p0, p1, p2, p3) {
  const approx = aseCubicLen(p0, p1, p2, p3);
  if (approx < 8) return [];
  const n = Math.max(12, Math.ceil(approx / 3.5));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    pts.push(aseCubicAt(p0, p1, p2, p3, i / n));
  }
  return pts;
}

function aseMakeArc(x, y, w, h) {
  const rx = Math.max(1, Number(w) * 0.5);
  const ry = Math.max(1, Number(h) * 0.5);
  const reach = Math.min(rx, ry);
  const a0 = random(TWO_PI);
  const turn = random(0.4, 1.35) * PI * (random() < 0.5 ? -1 : 1);
  const a1 = a0 + turn;
  const p0 = asePolar(x, y, random(0.25, 1) * reach, a0);
  const p3 = asePolar(x, y, random(0.25, 1) * reach, a1);
  const sCurve = random() < 0.5;
  const mag = random(0.55, 1.55) * reach;
  const mid = (a0 + a1) * 0.5;
  const n0 = mid + HALF_PI;
  const n1 = sCurve ? mid - HALF_PI : mid + HALF_PI;
  const p1 = {
    x: lerp(p0.x, p3.x, 0.32) + Math.cos(n0) * mag,
    y: lerp(p0.y, p3.y, 0.32) + Math.sin(n0) * mag,
  };
  const p2 = {
    x: lerp(p0.x, p3.x, 0.68) + Math.cos(n1) * mag * random(0.55, 1.2),
    y: lerp(p0.y, p3.y, 0.68) + Math.sin(n1) * mag * random(0.55, 1.2),
  };
  const first = aseCubicPts(p0, p1, p2, p3);
  if (first.length < 2) return [];
  if (random() >= 0.4) return first;
  const hookA = a1 + turn * random(0.35, 0.8);
  const p6 = asePolar(x, y, random(0.2, 0.85) * reach, hookA);
  const hookMag = random(0.35, 1.1) * reach;
  const p4 = {
    x: p3.x + Math.cos(n1) * hookMag,
    y: p3.y + Math.sin(n1) * hookMag,
  };
  const p5 = {
    x: lerp(p3.x, p6.x, 0.55) + Math.cos(hookA + HALF_PI) * hookMag * 0.7,
    y: lerp(p3.y, p6.y, 0.55) + Math.sin(hookA + HALF_PI) * hookMag * 0.7,
  };
  const hook = aseCubicPts(p3, p4, p5, p6);
  if (hook.length < 2) return first;
  return first.concat(hook.slice(1));
}

function sNoise(v) {
  return noise(v) * 2.0 - 1.0;
}

function colorToUniformArray(c) {
  return [red(c) / 255.0, green(c) / 255.0, blue(c) / 255.0];
}

function aseEnsurePencil() {
  if (strokePg && texProgram && strokeProgram) return true;
  hw = ASE_W * 0.5;
  hh = ASE_H * 0.5;
  try {
    if (!tempPg) {
      tempPg = createGraphics(ASE_W, ASE_H, WEBGL);
      tempPg.pixelDensity(ASE_PD);
      tempPg.noStroke();
    }
    if (!strokePg) {
      strokePg = createGraphics(ASE_W, ASE_H, WEBGL);
      strokePg.pixelDensity(ASE_PD);
      strokePg.noStroke();
    }
    texProgram = tempPg.createShader(vert, texFrag);
    strokeProgram = strokePg.createShader(vert, strokeFrag);
  } catch (err) {
    console.error(err);
    return false;
  }
  return !!(texProgram && strokeProgram);
}

function aseToGl(p) {
  return createVector(p.x - hw, hh - p.y);
}

/** 2D 等同 WEBGL 的 scale(1, -1, 1)，鋼筆／紅線跟鉛筆同一套 Y。 */
function aseFlip2D() {
  translate(0, ASE_H);
  scale(1, -1);
}

function aseGlFrame(pg, flipY) {
  pg.resetMatrix();
  pg.ortho(-hw, hw, -hh, hh, -10000, 10000);
  if (flipY) pg.scale(1, -1, 1);
}

function aseNearestTex(pg) {
  const gl = pg && pg.drawingContext;
  if (!gl) return;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

function aseNoSmooth(ctx) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  if (ctx.mozImageSmoothingEnabled != null) ctx.mozImageSmoothingEnabled = false;
  if (ctx.webkitImageSmoothingEnabled != null) ctx.webkitImageSmoothingEnabled = false;
  if (ctx.msImageSmoothingEnabled != null) ctx.msImageSmoothingEnabled = false;
}

function aseBeginPencil() {
  if (!aseEnsurePencil()) return false;
  aseGlFrame(tempPg, false);
  tempPg.shader(texProgram);
  texProgram.setUniform("resolution", [ASE_W * ASE_PD, ASE_H * ASE_PD]);
  tempPg.rect(-hw, -hh, ASE_W, ASE_H);
  tempPg.resetShader();
  img = tempPg.get();
  strokePg.background(ASE_PAPER[0], ASE_PAPER[1], ASE_PAPER[2]);
  strokePg.noStroke();
  strokePg.fill(255);
  if (strokePg.textureWrap) strokePg.textureWrap(REPEAT);
  const gl = strokePg.drawingContext;
  if (gl) gl.disable(gl.DEPTH_TEST);
  return true;
}

function aseTaperWeight(i, n, thin, thick) {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const env = t < 0.5 ? t * 2 : (1 - t) * 2;
  return lerp(thin, thick, env);
}

function aseMarkTaper(strokes) {
  if (!strokes) return;
  for (let i = 0; i < strokes.length; i++) {
    const st = strokes[i];
    if (!st) continue;
    const sw = Number(st.sw);
    if (!Number.isFinite(sw) || sw < 3) {
      st.taper = false;
      continue;
    }
    const id =
      (Number(st.pathSalt) || 0) * 17 +
      i * 1.37 +
      (st.kind === "leaf" ? 8.3 : 2.1);
    st.taper = aseRng(aseHashSeed(aseSeed, id + 91.7))() < 0.2;
  }
}

function aseStrokeTaperOpen(pts, thin, thick) {
  if (!pts || pts.length < 2) return;
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    strokeWeight(aseTaperWeight(i, n, thin, thick));
    line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }
}

function drawStroke(pts, width, tex, color, dens, widths) {
  if (!pts || pts.length < 2) return;
  const sides = [[], []];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    length += pts[i].dist(pts[i + 1]);
  }
  if (!(length > 0.5)) return;
  pts.forEach((p, i) => {
    const wi =
      widths && Number.isFinite(widths[i]) ? widths[i] : width;
    const half = wi * 0.5;
    const ia = max(0, i - 1);
    const ib = min(pts.length - 1, i + 1);
    const dir = p5.Vector.sub(pts[ib], pts[ia]);
    let perp;
    if (dir.magSq() < 1e-8) {
      perp = createVector(half, 0);
    } else {
      perp = createVector(dir.y, -dir.x).setMag(half);
    }
    sides[0].push(pts[i].copy().sub(perp));
    sides[1].push(pts[i].copy().add(perp));
  });

  // size.y 至少 48，否則原作 edge() 兩端各淡 4px，短弧整條被吃掉
  const fadeLen = Math.max(length, 48);
  const last = pts.length - 1;
  strokePg.fill(255);
  strokePg.noStroke();
  strokePg.shader(strokeProgram);
  aseGlFrame(strokePg, true);
  const zoom = constrain(
    Number.isFinite(Number(dens)) ? Number(dens) : ASE_PENCIL_DENS,
    3,
    6
  );
  strokeProgram.setUniform("tex0", tex);
  strokeProgram.setUniform("size", [width, fadeLen]);
  strokeProgram.setUniform("strokeColor", colorToUniformArray(color));
  strokeProgram.setUniform("texZoom", zoom);
  aseNearestTex(strokePg);
  const glw = strokePg.drawingContext;
  if (glw) glw.texParameteri(glw.TEXTURE_2D, glw.TEXTURE_WRAP_S, glw.REPEAT);
  if (glw) glw.texParameteri(glw.TEXTURE_2D, glw.TEXTURE_WRAP_T, glw.REPEAT);
  strokePg.beginShape(TRIANGLE_STRIP);
  for (let i = 0; i <= last; i++) {
    strokePg.vertex(sides[0][i].x, sides[0][i].y, 0);
    strokePg.vertex(sides[1][i].x, sides[1][i].y, 0);
  }
  const geom =
    strokePg._renderer &&
    strokePg._renderer.immediateMode &&
    strokePg._renderer.immediateMode.geometry;
  if (geom && geom.uvs) {
    geom.uvs.length = 0;
  for (let i = 0; i <= last; i++) {
    const v = i / last;
      geom.uvs.push(0, v, 1, v);
    }
  }
  strokePg.endShape();
}

function aseEndPencil() {
  if (!strokePg) return;
  background(ASE_PAPER[0], ASE_PAPER[1], ASE_PAPER[2]);
  aseNoSmooth(drawingContext);
  const snap = strokePg.get();
  aseNoSmooth(drawingContext);
  push();
  translate(0, ASE_H);
  scale(1, -1);
  image(snap, 0, 0, ASE_W, ASE_H);
  pop();
}

function aseHobbsNoise(a, salt, freq) {
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const n1 = noise(nx * freq + salt, ny * freq, salt * 0.2);
  const n2 = noise(nx * freq * 2.15 + salt + 19, ny * freq * 2.15, salt * 0.51);
  return (n1 - 0.5) * 1.35 + (n2 - 0.5) * 0.5;
}

/** 圓／橢圓與 Hobbs 變形做 blend，閉合週期噪音所以首尾相接。 */
function aseHobbsCircle(cx, cy, rx, ry, rot, salt) {
  const n = Math.max(28, Math.ceil((Math.PI * (rx + ry)) / 3.5));
  const blend = random(0.4, 1);
  const amp = ASE_HOBBS * blend;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + amp * aseHobbsNoise(a, salt, 1.75);
    const lx = Math.cos(a) * rx * wob;
    const ly = Math.sin(a) * ry * wob;
    pts.push({
      x: cx + lx * cr - ly * sr,
      y: cy + lx * sr + ly * cr,
    });
  }
  return pts;
}

function aseCapPaths(paths, n) {
  n = Math.max(1, Math.floor(n));
  if (!paths || paths.length <= n) return paths || [];
  const ranked = paths.map((p, i) => ({
    p,
    i,
    len: asePathLen(p.pts, !!p.closed),
  }));
  ranked.sort((a, b) => b.len - a.len || a.i - b.i);
  return ranked.slice(0, n).map((x) => x.p);
}

function aseCollectGridPaths() {
  const need = aseLayoutN();
  const paths = [];
  const rows = Math.max(1, Math.floor(ASE_ROWS));
  const cols = Math.max(1, Math.floor(ASE_COLS));
  const margin = Math.max(0, ASE_MARGIN);
  const innerW = Math.max(1, ASE_W - margin * 2);
  const innerH = Math.max(1, ASE_H - margin * 2);
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const span = Math.min(cellW, cellH);
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        row,
        col,
        x: margin + (col + 0.5) * cellW,
        y: margin + (row + 0.5) * cellH,
      });
    }
  }
  const counts = aseShareCounts(need, cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    for (let k = 0; k < counts[i]; k++) {
      const len = span * random(ASE_LENMIN, ASE_LENMAX);
      const pts = aseMakeArc(c.x, c.y, len, len);
      if (pts.length >= 2) {
        paths.push({
          pts,
          salt: c.row * 17.3 + c.col * 0.41 + k * 3.1,
          closed: false,
          hub: { x: c.x, y: c.y },
        });
      }
    }
  }
  return aseCapPaths(paths, need);
}

/** 一圈拆成 1–4 段開放弧，避免一筆畫到底。 */
function aseSplitRing(pts, salt) {
  if (!pts || pts.length < 8) return [{ pts, closed: true, salt }];
  const segs = 1 + Math.floor(random(4));
  if (segs <= 1) return [{ pts, closed: true, salt }];
  const n = pts.length;
  const origin = Math.floor(random(n));
  const out = [];
  let cursor = 0;
  for (let s = 0; s < segs; s++) {
    const remain = segs - s;
    const left = n - cursor;
    let take =
      s === segs - 1
        ? left
        : Math.round(left / remain + random(-n * 0.06, n * 0.06));
    take = Math.max(4, Math.min(left - (remain - 1) * 4, take));
    const gap = s < segs - 1 ? Math.min(4, Math.max(1, Math.floor(random(1, 4)))) : 0;
    const slice = [];
    const keep = Math.max(2, take - gap);
    for (let i = 0; i < keep; i++) {
      slice.push(pts[(origin + cursor + i) % n]);
    }
    cursor += take;
    if (slice.length >= 2) {
      out.push({ pts: slice, closed: false, salt: salt + s * 0.73 });
    }
  }
  return out.length ? out : [{ pts, closed: true, salt }];
}

function aseCollectConcentricPaths() {
  const need = aseLayoutN();
  const paths = [];
  const cx = ASE_W * 0.5 + random(-100, 100);
  const cy = ASE_H * 0.5 + random(-100, 100);
  const scale = Math.max(0.05, Number(ASE_RING_SCALE) || 1);
  const gap = Math.max(8, ASE_RING_GAP);
  const copiesMax = Math.max(
    1,
    Math.round(ASE_RING_COPIES * Math.sqrt(need / ASE_LAYOUT_N))
  );
  const rings = Math.max(1, Math.round(ASE_RINGS * (need / ASE_LAYOUT_N)));
  for (let i = 1; i <= rings; i++) {
    const baseR = i * gap * scale;
    const copies = 1 + Math.floor(random(copiesMax));
    for (let k = 0; k < copies; k++) {
      const r = baseR * random(0.96, 1.05);
      const ox = random(-gap * 0.28, gap * 0.28) * scale;
      const oy = random(-gap * 0.28, gap * 0.28) * scale;
      const aspect = random() < 0.32 ? random(0.92, 1.08) : random(0.62, 1.38);
      const rot = random(Math.PI * 2);
      const salt = i * 4.17 + k * 2.63;
      const pts = aseHobbsCircle(cx + ox, cy + oy, r, r * aspect, rot, salt);
      if (pts.length < 2) continue;
      const bits = aseSplitRing(pts, salt);
      for (let b = 0; b < bits.length; b++) {
        bits[b].hub = { x: cx, y: cy };
        paths.push(bits[b]);
      }
    }
  }
  let extra = 0;
  while (paths.length < need && extra < need * 4) {
    const i = 1 + Math.floor(random(rings));
    const baseR = i * gap * scale;
    const r = baseR * random(0.96, 1.05);
    const ox = random(-gap * 0.28, gap * 0.28) * scale;
    const oy = random(-gap * 0.28, gap * 0.28) * scale;
    const aspect = random() < 0.32 ? random(0.92, 1.08) : random(0.62, 1.38);
    const rot = random(Math.PI * 2);
    const salt = 90 + extra * 2.63;
    const pts = aseHobbsCircle(cx + ox, cy + oy, r, r * aspect, rot, salt);
    extra++;
    if (pts.length < 2) continue;
    const bits = aseSplitRing(pts, salt);
    for (let b = 0; b < bits.length; b++) {
      bits[b].hub = { x: cx, y: cy };
      paths.push(bits[b]);
    }
  }
  return aseCapPaths(paths, need);
}

/** 畫面中央一排斜線，Perlin 微彎，間隔聚散像條碼。 */
function aseCollectBarcodePaths() {
  const paths = [];
  const n = aseLayoutN();
  const margin = Math.max(40, ASE_MARGIN * 0.55);
  const innerW = Math.max(1, ASE_W - margin * 2);
  const cy = ASE_H * 0.5;
  const h0 = Math.max(40, ASE_BAR_H);
  const tiltMax = Math.max(0, ASE_BAR_TILT);
  const amp = Math.max(0, ASE_BAR_NOISE);
  const gaps = [];
  for (let i = 0; i < n - 1; i++) {
    const u = random();
    if (u < 0.4) gaps.push(random(0.12, 0.38));
    else if (u < 0.74) gaps.push(random(0.65, 1.35));
    else gaps.push(random(2.1, 4.6));
  }
  let gapSum = 0;
  for (let i = 0; i < gaps.length; i++) gapSum += gaps[i];
  const xs = [margin];
  let xWalk = margin;
  for (let i = 0; i < gaps.length; i++) {
    xWalk += (gaps[i] / gapSum) * innerW;
    xs.push(xWalk);
  }
    for (let i = 0; i < n; i++) {
    const x = xs[i];
    const tall = random() < 0.14;
    const hi = h0 * (tall ? random(1.18, 1.55) : random(0.78, 1.06));
    const tilt = random(-tiltMax, tiltMax);
    const salt = 110 + i * 2.17;
    const steps = Math.max(18, Math.ceil(hi / 10));
    const dx = Math.sin(tilt);
    const dy = Math.cos(tilt);
    const px = dy;
    const py = -dx;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const t = u - 0.5;
      const n1 = noise(i * 0.31 + salt, u * 1.7, salt * 0.2);
      const n2 = noise(i * 0.73 + salt + 9, u * 3.4, salt * 0.51);
      const wob = ((n1 - 0.5) * 1.35 + (n2 - 0.5) * 0.5) * amp;
      pts.push({
        x: x + dx * t * hi + px * wob,
        y: cy + dy * t * hi + py * wob,
      });
    }
      if (pts.length >= 2) {
        paths.push({
          pts,
          closed: false,
          salt,
          hub: { x, y: cy },
        });
      }
    }
  return aseCapPaths(paths, n);
}

function aseAngWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 中心往外長：主枝均勻占角度，Perlin 只做微彎，避免全擠一邊。 */
function aseCollectBranchPaths() {
  const need = aseLayoutN();
  const cx = ASE_W * 0.5 + random(-100, 100);
  const cy = ASE_H * 0.5 + random(-100, 100);
  const freq = Math.max(0.005, ASE_BRANCH_NOISE);
  const step = Math.max(0.5, ASE_BRANCH_STEP);
  const liveMax = Math.max(
    3,
    Math.round(ASE_BRANCH_MAX * (need / ASE_LAYOUT_N))
  );
  const seeds = Math.max(
    2,
    Math.min(need, Math.round(ASE_BRANCH_SEEDS * (need / ASE_LAYOUT_N)))
  );
  const spin = random(Math.PI * 2);
  const busy = Math.floor(random(seeds));
  const live = [];
  for (let i = 0; i < seeds; i++) {
    const home = spin + (i / seeds) * Math.PI * 2 + random(-0.12, 0.12);
    const reach = random(6, 14);
    const x = cx + Math.cos(home) * reach;
    const y = cy + Math.sin(home) * reach;
    live.push({
      x,
      y,
      dir: home + random(-0.1, 0.1),
      home,
      family: i,
      gen: 0,
      budget: i === busy ? 5 + Math.floor(random(4)) : 1 + Math.floor(random(3)),
      size: random(5, 8),
      age: 0,
      life: 52 + Math.floor(random(44)),
      pts: [{ x, y }],
    });
  }
  const depth = Math.max(1, Math.floor(ASE_BRANCH_DEPTH));
  const done = [];
  const maxSteps = 280;
  for (let s = 0; s < maxSteps && live.length; s++) {
    const born = [];
    for (let i = 0; i < live.length; i++) {
      const d = live[i];
      const forkAge = 10 + d.gen * 6;
      if (
        d.budget > 0 &&
        d.gen < depth - 1 &&
        d.age > forkAge &&
        live.length + born.length < liveMax &&
        random() < 0.07 + (d.family === busy ? 0.04 : 0)
      ) {
        const side = random() < 0.5 ? -1 : 1;
        const kick = side * (0.72 + d.gen * 0.32 + random(0, 0.28));
        const home = d.home + kick;
        const nextGen = d.gen + 1;
        born.push({
          x: d.x,
          y: d.y,
          dir: d.dir + kick,
          home,
          family: d.family,
          gen: nextGen,
          budget:
            nextGen < depth - 1
              ? 1 + Math.floor(random(nextGen === 1 && d.family === busy ? 3 : 2))
              : 0,
          size: Math.max(2, d.size * 0.72),
          age: 0,
          life: 40 + Math.floor(random(36)) - nextGen * 4,
          pts: [{ x: d.x, y: d.y }],
        });
        d.budget--;
      }
    }
    for (let i = 0; i < born.length; i++) live.push(born[i]);
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i];
      const away = Math.atan2(d.y - cy, d.x - cx);
      const wob = (noise(d.x * freq, d.y * freq, d.family * 0.37) - 0.5) * 0.4;
      d.dir += random(-0.16, 0.16) + wob;
      d.dir += aseAngWrap(d.home - d.dir) * (d.gen > 0 ? 0.16 : 0.1);
      d.dir += aseAngWrap(away - d.dir) * (d.gen > 0 ? 0.14 : 0.24);
      d.x += step * Math.cos(d.dir);
      d.y += step * Math.sin(d.dir);
      d.age++;
      d.pts.push({ x: d.x, y: d.y });
      if (d.age > d.life) {
        if (d.pts.length >= 2) done.push(d);
        live.splice(i, 1);
      }
    }
  }
  for (let i = 0; i < live.length; i++) {
    if (live[i].pts.length >= 2) done.push(live[i]);
  }
  const paths = [];
  for (let i = 0; i < done.length; i++) {
    paths.push({
      pts: done[i].pts,
      closed: false,
      salt: 220 + i * 2.17,
      hub: { x: cx, y: cy },
    });
  }
  let pad = 0;
  while (paths.length < need && pad < need) {
    const home = spin + (paths.length / need) * Math.PI * 2 + random(-0.1, 0.1);
    let x = cx + Math.cos(home) * 8;
    let y = cy + Math.sin(home) * 8;
    let dir = home;
    const pts = [{ x, y }];
    const life = 36 + Math.floor(random(32));
    for (let k = 0; k < life; k++) {
      dir += random(-0.16, 0.16);
      dir += (noise(x * freq, y * freq, pad * 0.2) - 0.5) * 0.4;
      dir += aseAngWrap(home - dir) * 0.12;
      x += step * Math.cos(dir);
      y += step * Math.sin(dir);
      pts.push({ x, y });
    }
    paths.push({
      pts,
      closed: false,
      salt: 220 + paths.length * 2.17,
      hub: { x: cx, y: cy },
    });
    pad++;
  }
  return aseCapPaths(paths, need);
}

/** 滿天星：星數隨線數縮放，每點往外放射，總條數對齊 aseLayoutN。 */
function aseScatterStars(count) {
  const margin = Math.max(90, ASE_MARGIN * 0.65);
  const minDist = 88;
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries < count * 80) {
    tries++;
    const p = {
      x: random(margin, ASE_W - margin),
      y: random(margin, ASE_H - margin),
    };
    let ok = true;
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(p.x - pts[i].x, p.y - pts[i].y) < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) pts.push(p);
  }
  while (pts.length < count) {
    pts.push({
      x: random(margin, ASE_W - margin),
      y: random(margin, ASE_H - margin),
    });
  }
  return pts;
}

function aseCollectStarPaths() {
  const need = aseLayoutN();
  const lo = Math.max(
    1,
    Math.min(need, Math.round(ASE_STAR_MIN * (need / ASE_LAYOUT_N)))
  );
  const hi = Math.max(
    lo,
    Math.min(need, Math.round(ASE_STAR_MAX * (need / ASE_LAYOUT_N)))
  );
  const n = lo + Math.floor(random(hi - lo + 1));
  const centers = aseScatterStars(n);
  const counts = aseShareCounts(need, n);
  const freq = Math.max(0.004, ASE_STAR_NOISE);
  const step = Math.max(0.5, ASE_STAR_STEP);
  const baseLen = Math.max(24, ASE_STAR_LEN);
  const paths = [];
  for (let i = 0; i < n; i++) {
    const c = centers[i];
    const rays = counts[i];
    if (rays < 1) continue;
    const spin = random(Math.PI * 2);
    for (let j = 0; j < rays; j++) {
      const home = spin + (j / rays) * Math.PI * 2 + random(-0.18, 0.18);
      const reach = baseLen * random(0.5, 1.5);
      const life = Math.max(8, Math.round(reach / step));
      let x = c.x + Math.cos(home) * 3;
      let y = c.y + Math.sin(home) * 3;
      let dir = home;
      const pts = [{ x: c.x, y: c.y }];
      for (let k = 0; k < life; k++) {
        const wob = (noise(x * freq, y * freq, i * 0.41 + j * 0.17) - 0.5) * 0.38;
        dir += random(-0.12, 0.12) + wob;
        dir += aseAngWrap(home - dir) * 0.22;
        x += step * Math.cos(dir);
        y += step * Math.sin(dir);
        pts.push({ x, y });
      }
      paths.push({
        pts,
        closed: false,
        salt: 330 + paths.length * 2.17,
        hub: { x: c.x, y: c.y },
      });
    }
  }
  return aseCapPaths(paths, need);
}

/** 這一段屬於哪個打結：先看圓圈重疊，否則就近。 */
function asePickSliceHub(knots, i0, i1, slice, fallback) {
  if (!knots || !knots.length) return { x: fallback.x, y: fallback.y };
  let best = null;
  let bestOv = 0;
  for (let i = 0; i < knots.length; i++) {
    const a = Math.max(i0, knots[i].i0);
    const b = Math.min(i1, knots[i].i1);
    const ov = b - a;
    if (ov > bestOv) {
      bestOv = ov;
      best = knots[i];
    }
  }
  if (best) return { x: best.x, y: best.y };
  let sx = 0;
  let sy = 0;
  const m = slice && slice.length ? slice.length : 0;
  for (let i = 0; i < m; i++) {
    sx += slice[i].x;
    sy += slice[i].y;
  }
  const cx = m ? sx / m : fallback.x;
  const cy = m ? sy / m : fallback.y;
  let near = knots[0];
  let bestD = Infinity;
  for (let i = 0; i < knots.length; i++) {
    const d = Math.hypot(cx - knots[i].x, cy - knots[i].y);
    if (d < bestD) {
      bestD = d;
      near = knots[i];
    }
  }
  return { x: near.x, y: near.y };
}

/** 一條開折線依長度切成 n 段，段與段共一個端點。 */
function aseSplitOpenPolyline(pts, n, hub, salt0, knots) {
  const paths = [];
  if (!pts || pts.length < 2 || n < 1) return paths;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    );
  }
  const total = cum[cum.length - 1];
  if (total < 1) return paths;
  const atLen = (L) => {
    L = Math.max(0, Math.min(total, L));
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < L) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = pts[i - 1];
    const b = pts[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (L - cum[i - 1]) / seg;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      idx: i,
    };
  };
  for (let s = 0; s < n; s++) {
    const a = atLen((s / n) * total);
    const b = atLen(((s + 1) / n) * total);
    const slice = [{ x: a.x, y: a.y }];
    for (let i = a.idx; i < b.idx; i++) slice.push(pts[i]);
    const last = slice[slice.length - 1];
    if (!last || Math.hypot(last.x - b.x, last.y - b.y) > 0.02) {
      slice.push({ x: b.x, y: b.y });
    }
    if (slice.length < 2) {
      slice.push({ x: b.x + 0.4, y: b.y + 0.4 });
    }
    paths.push({
      pts: slice,
      closed: false,
      salt: salt0 + s * 2.17,
      hub: asePickSliceHub(knots, a.idx, b.idx, slice, hub),
    });
  }
  return paths;
}

/** 棉線：一半上到下掉落，一半左到右；海龜走步＋就地繞圈。 */
function aseCollectThreadPaths() {
  const margin = Math.max(70, ASE_MARGIN * 0.48);
  const step = Math.max(1.2, ASE_THREAD_STEP);
  const target = Math.max(800, ASE_THREAD_LEN);
  const across = aseRng(aseHashSeed(aseSeed, 8.17))() < 0.5;
  const home = across ? 0 : Math.PI * 0.5;
  let x = across
    ? random(margin * 0.45, ASE_W * 0.22)
    : random(ASE_W * 0.32, ASE_W * 0.68);
  let y = across
    ? random(ASE_H * 0.32, ASE_H * 0.68)
    : random(margin * 0.45, ASE_H * 0.22);
  let dir = home + random(-0.85, 0.85);
  const hub = { x, y };
  const pts = [{ x, y }];
  const knots = [];
  let walked = 0;
  let cool = 36;
  let i = 0;
  const floorY = ASE_H - margin;
  const wallX = ASE_W - margin;
  while (walked < target && i < 5600) {
    i++;
    cool--;
    if (cool < 0 && walked > 70 && random() < 0.04) {
      const tight = random() < 0.8;
      const turns = tight ? random(1.35, 3.35) : random(0.72, 1.42);
      const rad = tight ? random(6, 20) : random(24, 54);
      const side = random() < 0.5 ? -1 : 1;
      const n = Math.max(10, Math.round((turns * Math.PI * 2 * rad) / step));
      const cx = x + Math.cos(dir + side * Math.PI * 0.5) * rad;
      const cy = y + Math.sin(dir + side * Math.PI * 0.5) * rad;
      const a0 = Math.atan2(y - cy, x - cx);
      const i0 = pts.length - 1;
      for (let k = 1; k <= n; k++) {
        const a = a0 + side * (k / n) * turns * Math.PI * 2;
        const rr = rad * (0.86 + 0.2 * noise(k * 0.07, i * 0.03));
        x = cx + Math.cos(a) * rr;
        y = cy + Math.sin(a) * rr;
        x = Math.max(margin * 0.45, Math.min(ASE_W - margin * 0.45, x));
        y = Math.max(margin * 0.35, Math.min(ASE_H - margin * 0.35, y));
        pts.push({ x, y });
        walked += step;
      }
      knots.push({ x: cx, y: cy, i0, i1: pts.length - 1 });
      dir = a0 + side * turns * Math.PI * 2 + side * Math.PI * 0.5;
      cool = 14 + Math.floor(random(8, 28));
      continue;
    }
    const wob = (noise(x * 0.01, y * 0.01, i * 0.015) - 0.5) * ASE_THREAD_NOISE;
    dir += wob + random(-0.09, 0.09);
    dir += 0.05 * Math.sin(i * 0.023);
    dir += aseAngWrap(home - dir) * 0.03;
    if (across) {
      if (y < margin) dir += aseAngWrap(Math.PI * 0.5 - dir) * 0.4;
      if (y > ASE_H - margin) dir += aseAngWrap(-Math.PI * 0.5 - dir) * 0.4;
      if (x < margin) dir += aseAngWrap(0 - dir) * 0.38;
      if (x > wallX) {
        x = wallX;
        dir = Math.PI + random(-1.05, 1.05);
      }
    } else {
      if (x < margin) dir += aseAngWrap(0 - dir) * 0.38;
      if (x > ASE_W - margin) dir += aseAngWrap(Math.PI - dir) * 0.38;
      if (y < margin) dir += aseAngWrap(Math.PI * 0.5 - dir) * 0.4;
      if (y > floorY) {
        y = floorY;
        dir = -Math.PI * 0.5 + random(-1.05, 1.05);
      }
    }
    x += step * Math.cos(dir);
    y += step * Math.sin(dir);
    x = Math.max(margin * 0.4, Math.min(ASE_W - margin * 0.4, x));
    y = Math.max(margin * 0.3, Math.min(ASE_H - margin * 0.28, y));
    pts.push({ x, y });
    walked += step;
  }
  if (!knots.length) knots.push({ x: hub.x, y: hub.y, i0: 0, i1: pts.length - 1 });
  return aseSplitOpenPolyline(pts, aseLayoutN(), hub, 440, knots);
}

function aseQtMake(x, y, w, h) {
  return { x, y, w, h, items: [], kids: null };
}

function aseQtOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function aseQtFits(n, box) {
  return (
    box.x >= n.x &&
    box.y >= n.y &&
    box.x + box.w <= n.x + n.w &&
    box.y + box.h <= n.y + n.h
  );
}

function aseQtInsert(n, item) {
  if (n.kids) {
    for (let i = 0; i < 4; i++) {
      if (aseQtFits(n.kids[i], item.box)) {
        aseQtInsert(n.kids[i], item);
        return;
      }
    }
  }
  n.items.push(item);
  if (!n.kids && n.items.length > 6 && n.w > 48 && n.h > 48) {
    const hw = n.w * 0.5;
    const hh = n.h * 0.5;
    n.kids = [
      aseQtMake(n.x, n.y, hw, hh),
      aseQtMake(n.x + hw, n.y, hw, hh),
      aseQtMake(n.x, n.y + hh, hw, hh),
      aseQtMake(n.x + hw, n.y + hh, hw, hh),
    ];
    const keep = n.items;
    n.items = [];
    for (let i = 0; i < keep.length; i++) aseQtInsert(n, keep[i]);
  }
}

function aseQtQuery(n, box, out) {
  if (!aseQtOverlap({ x: n.x, y: n.y, w: n.w, h: n.h }, box)) return out;
  for (let i = 0; i < n.items.length; i++) {
    if (aseQtOverlap(n.items[i].box, box)) out.push(n.items[i]);
  }
  if (n.kids) {
    for (let i = 0; i < 4; i++) aseQtQuery(n.kids[i], box, out);
  }
  return out;
}

function aseKleeBox(pts, pad) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    x0 = Math.min(x0, pts[i].x);
    y0 = Math.min(y0, pts[i].y);
    x1 = Math.max(x1, pts[i].x);
    y1 = Math.max(y1, pts[i].y);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function asePointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function aseOrient(ax, ay, bx, by, cx, cy) {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
}

function aseSegHit(a, b, c, d) {
  const o1 = aseOrient(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = aseOrient(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = aseOrient(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = aseOrient(c.x, c.y, d.x, d.y, b.x, b.y);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function aseKleeCross(ptsA, ptsB, minDist) {
  for (let i = 0; i < ptsA.length - 1; i++) {
    for (let j = 0; j < ptsB.length - 1; j++) {
      const a = ptsA[i];
      const b = ptsA[i + 1];
      const c = ptsB[j];
      const d = ptsB[j + 1];
      if (aseSegHit(a, b, c, d)) return true;
      if (asePointSeg(a.x, a.y, c.x, c.y, d.x, d.y) < minDist) return true;
      if (asePointSeg(b.x, b.y, c.x, c.y, d.x, d.y) < minDist) return true;
      if (asePointSeg(c.x, c.y, a.x, a.y, b.x, b.y) < minDist) return true;
      if (asePointSeg(d.x, d.y, a.x, a.y, b.x, b.y) < minDist) return true;
    }
  }
  return false;
}

function aseKleeSign(pts) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = asePathLen(pts, false);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let curve = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    curve = Math.max(
      curve,
      Math.hypot(pts[i].x - (a.x + dx * t), pts[i].y - (a.y + dy * t))
    );
  }
  return [
    Math.round(len / 22),
    Math.round(((ang + Math.PI) / (Math.PI * 2)) * 10),
    Math.round(curve / 10),
  ].join("|");
}

function aseKleeBounds() {
  const w = ASE_KLEE_BOX_W;
  const h = ASE_KLEE_BOX_H;
  return { x: (ASE_W - w) * 0.5, y: (ASE_H - h) * 0.5, w, h };
}

function aseKleeInBox(pts, b, inset) {
  const x0 = b.x + inset;
  const y0 = b.y + inset;
  const x1 = b.x + b.w - inset;
  const y1 = b.y + b.h - inset;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].x < x0 || pts[i].x > x1 || pts[i].y < y0 || pts[i].y > y1) return false;
  }
  return true;
}

function aseKleeDir(pts) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function aseKleeParallel(a, b) {
  let d = Math.abs(aseAngWrap(aseKleeDir(a) - aseKleeDir(b)));
  if (d > Math.PI * 0.5) d = Math.PI - d;
  return d < 0.32;
}

function aseKleeFamilyDir(u, v) {
  if (v > 0.76) return random(-0.16, 0.16);
  if (v < 0.22) return -Math.PI * 0.5 + random(-0.22, 0.22);
  if (u < 0.28) return -0.58 + random(-0.18, 0.18);
  if (u > 0.72) return 0.58 + random(-0.18, 0.18);
  return (Math.floor(u * 4 + v * 3) % 2 ? 0.38 : -0.95) + random(-0.14, 0.14);
}

function aseKleeClosest(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = 0;
  if (l2 > 1e-8) t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

function aseKleeAhead(px, py, dir, items, warn) {
  if (!items || !items.length) return null;
  const hx = Math.cos(dir);
  const hy = Math.sin(dir);
  let best = null;
  for (let i = 0; i < items.length; i++) {
    const pts = items[i].pts;
    if (!pts || pts.length < 2) continue;
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j];
      const c = pts[j + 1];
      const hit = aseKleeClosest(px, py, a.x, a.y, c.x, c.y);
      if (hit.d > warn) continue;
      const ahead = (hit.x - px) * hx + (hit.y - py) * hy;
      if (ahead < -6) continue;
      const score = hit.d - ahead * 0.18;
      if (!best || score < best.score) {
        best = { d: hit.d, x: hit.x, y: hit.y, score };
      }
    }
  }
  return best;
}

function aseKleeWalk(x0, y0, dir0, len, bendFn, ctx) {
  const step = Math.max(2.5, ASE_KLEE_STEP);
  const n = Math.max(4, Math.round(len / step));
  const pts = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const b = ctx && ctx.b;
  const inset = (ctx && ctx.inset) || 20;
  const warn = (ctx && ctx.warn) || 20;
  const xMin = b ? b.x + inset : 0;
  const yMin = b ? b.y + inset : 0;
  const xMax = b ? b.x + b.w - inset : ASE_W;
  const yMax = b ? b.y + b.h - inset : ASE_H;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    let d = dir0 + (bendFn ? bendFn(u) : 0) + (noise(x * 0.02, y * 0.02, dir0) - 0.5) * 0.16;
    if (x < xMin + 20) d += aseAngWrap(0 - d) * 0.5;
    if (x > xMax - 20) d += aseAngWrap(Math.PI - d) * 0.5;
    if (y < yMin + 20) d += aseAngWrap(Math.PI * 0.5 - d) * 0.5;
    if (y > yMax - 20) d += aseAngWrap(-Math.PI * 0.5 - d) * 0.5;
    if (ctx && ctx.qt && ctx.steer !== false) {
      const pad = warn + 16;
      const near = aseQtQuery(ctx.qt, { x: x - pad, y: y - pad, w: pad * 2, h: pad * 2 }, []);
      const hit = aseKleeAhead(x, y, d, near, warn);
      if (hit) {
        const away = Math.atan2(y - hit.y, x - hit.x);
        const t = Math.max(0, 1 - hit.d / warn);
        d += aseAngWrap(away - d) * (0.42 + 0.58 * t);
      }
    }
    const nx = x + step * Math.cos(d);
    const ny = y + step * Math.sin(d);
    if (nx < xMin || nx > xMax || ny < yMin || ny > yMax) break;
    x = nx;
    y = ny;
    pts.push({ x, y });
  }
  return pts;
}

function aseKleeSimplify(pts) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.25) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function aseKleeCurve(x0, y0, dir, len, bendFn, ctx) {
  return aseKleeWalk(x0, y0, dir, len, bendFn, ctx);
}

function aseKleeTick(x0, y0, dir, len, ctx) {
  return aseKleeWalk(x0, y0, dir, Math.max(12, len), null, ctx);
}

function aseKleePetalArc(cx, cy, a0, sweep, rMin, rMax) {
  const r = Math.max(rMin, rMax);
  const n = Math.max(10, Math.round(Math.abs(sweep) * r / Math.max(2.5, ASE_KLEE_STEP)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = a0 + sweep * u;
    const rr = rMin + (rMax - rMin) * Math.sin(u * Math.PI);
    const wob = (noise(Math.cos(a) * 3.1, Math.sin(a) * 3.1, cx * 0.01) - 0.5) * 7;
    pts.push({
      x: cx + Math.cos(a) * (rr + wob),
      y: cy + Math.sin(a) * (rr + wob),
    });
  }
  return pts;
}

function aseKleeNearTangent(x, y, plants, maxD) {
  let best = null;
  for (let p = 0; p < plants.length; p++) {
    const pts = plants[p].pts;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      const hit = aseKleeClosest(x, y, a.x, a.y, c.x, c.y);
      if (hit.d > maxD) continue;
      if (best && hit.d >= best.d) continue;
      best = {
        d: hit.d,
        ang: Math.atan2(c.y - a.y, c.x - a.x),
      };
    }
  }
  return best;
}

function aseKleeBend(kind, side) {
  if (kind === 0) return (u) => side * Math.sin(u * Math.PI) * (1.25 + random(0.55));
  if (kind === 1) return (u) => side * Math.sin(u * Math.PI * 2) * (0.55 + random(0.4));
  if (kind === 2) return (u) => side * (u < 0.5 ? u * 3.0 : (1 - u) * 2.5);
  return (u) => side * Math.sin(u * Math.PI) * (0.32 + random(0.28));
}

/** 克力：800×500 框內排 C／S／U 長弧＋中段＋短撇；重曲線、節奏 margin、分區排版。 */
function aseCollectKleePaths() {
  const need = aseLayoutN();
  const b = aseKleeBounds();
  const inset = 18;
  const longN = Math.max(10, Math.min(32, Math.round(need * ASE_KLEE_LONG)));
  const rest = Math.max(0, need - longN);
  const midN = Math.max(4, Math.round(rest * 0.55));
  const shortN = Math.max(0, need - longN - midN);
  const paths = [];
  const longs = [];
  const qt = aseQtMake(b.x, b.y, b.w, b.h);
  const padLong = 14;
  const padHug = 9;
  const padShort = 7.5;
  const padPara = 12;
  const ctxArc = { qt, b, inset, warn: 0, steer: false };
  const ctxMark = { qt, b, inset, warn: 10, steer: true };

  const gapFor = (pts, isLong, other) => {
    if (isLong && other.long) return padLong;
    if (isLong || other.long) return padHug;
    return aseKleeParallel(pts, other.pts) ? padPara : padShort;
  };

  const accept = (pts, isLong) => {
    pts = aseKleeSimplify(pts);
    if (!pts || pts.length < 2 || !aseKleeInBox(pts, b, inset * 0.45)) return false;
    const pad = isLong ? padLong : padShort;
    const box = aseKleeBox(pts, pad);
    const near = aseQtQuery(qt, box, []);
    for (let i = 0; i < near.length; i++) {
      if (aseKleeCross(pts, near[i].pts, gapFor(pts, isLong, near[i]))) return false;
    }
    const hub = pts[pts.length >> 1];
    const path = {
      pts,
      closed: false,
      klee: true,
      salt: 520 + paths.length * 2.11,
      hub: { x: hub.x, y: hub.y },
    };
    paths.push(path);
    if (isLong) longs.push(path);
    aseQtInsert(qt, { box, pts, long: !!isLong });
    return true;
  };

  const tryPut = (isLong, make) => {
    for (let k = 0; k < 16; k++) {
      if (accept(make(), isLong)) return true;
    }
    return false;
  };

  const colsL = 3;
  const rowsL = 2;
  const cwL = b.w / colsL;
  const chL = b.h / rowsL;
  const regionLoad = new Array(colsL * rowsL).fill(0);
  const pickRegion = () => {
    let best = 0;
    let bestN = Infinity;
    for (let i = 0; i < regionLoad.length; i++) {
      if (regionLoad[i] < bestN) {
        bestN = regionLoad[i];
        best = i;
      }
    }
    return best;
  };

  for (let n = 0; n < longN; n++) {
    const ri = pickRegion();
    const col = ri % colsL;
    const row = Math.floor(ri / colsL);
    const placed = tryPut(true, () => {
      const kind = n % 4;
      const u0 = (col + random(0.18, 0.82)) / colsL;
      const v0 = (row + random(0.18, 0.82)) / rowsL;
      const x = b.x + u0 * b.w;
      const y = b.y + v0 * b.h;
      const dir = aseKleeFamilyDir(u0, v0) + random(-0.35, 0.35);
      const side = random() < 0.5 ? -1 : 1;
      if (kind === 0 && random() < 0.45) {
        return aseKleePetalArc(
          x,
          y,
          dir - 0.4 + random(-0.2, 0.2),
          (0.85 + random(1.0)) * side,
          32 + random(16),
          72 + random(48)
        );
      }
      return aseKleeCurve(
        x,
        y,
        dir,
        kind === 2 ? random(150, 230) : random(110, 200),
        aseKleeBend(kind, side),
        ctxArc
      );
    });
    if (placed) regionLoad[ri]++;
  }

  const markDir = (x, y) => {
    const tan = aseKleeNearTangent(x, y, longs, 56);
    if (tan && tan.d < 36) return tan.ang + random(-0.14, 0.14);
    return aseKleeFamilyDir((x - b.x) / b.w, (y - b.y) / b.h);
  };

  let midGot = 0;
  const midCap = midN + Math.max(0, longN - longs.length);
  for (let t = 0; t < need * 90 && midGot < midCap && paths.length < need; t++) {
    const x = random(b.x + inset, b.x + b.w - inset);
    const y = random(b.y + inset, b.y + b.h - inset);
    const side = random() < 0.5 ? -1 : 1;
    if (
      accept(
        aseKleeCurve(
          x,
          y,
          markDir(x, y),
          random(58, 130),
          (u) => side * Math.sin(u * Math.PI) * (0.18 + random(0.32)),
          ctxMark
        ),
        false
      )
    ) {
      midGot++;
    }
  }

  let shortGot = 0;
  const cols = 10;
  const rows = 5;
  const cw = b.w / cols;
  const ch = b.h / rows;
  for (let row = 0; row < rows && shortGot < shortN && paths.length < need; row++) {
    for (let col = 0; col < cols && shortGot < shortN && paths.length < need; col++) {
      const cell = { x: b.x + col * cw, y: b.y + row * ch, w: cw, h: ch };
      if (aseQtQuery(qt, cell, []).length >= 6) continue;
      const px = cell.x + cw * random(0.18, 0.82);
      const py = cell.y + ch * random(0.18, 0.82);
      if (accept(aseKleeTick(px, py, markDir(px, py), random(14, 40), ctxMark), false)) {
        shortGot++;
      }
    }
  }

  for (let pass = 0; pass < 3 && shortGot < shortN && paths.length < need; pass++) {
    const lo = pass < 1 ? 16 : 12;
    const hi = pass < 1 ? 42 : 28;
    for (let t = 0; t < need * 40 && shortGot < shortN && paths.length < need; t++) {
      const x = random(b.x + inset, b.x + b.w - inset);
      const y = random(b.y + inset, b.y + b.h - inset);
      if (accept(aseKleeTick(x, y, markDir(x, y), random(lo, hi), ctxMark), false)) {
        shortGot++;
      }
    }
  }

  for (let t = 0; t < need * 80 && paths.length < need; t++) {
    const ri = pickRegion();
    const col = ri % colsL;
    const row = Math.floor(ri / colsL);
    const kind = paths.length % 4;
    const u0 = (col + random(0.18, 0.82)) / colsL;
    const v0 = (row + random(0.18, 0.82)) / rowsL;
    const x = b.x + u0 * b.w;
    const y = b.y + v0 * b.h;
    const dir = aseKleeFamilyDir(u0, v0) + random(-0.35, 0.35);
    const side = random() < 0.5 ? -1 : 1;
    if (
      accept(
        aseKleeCurve(
          x,
          y,
          dir,
          kind === 2 ? random(150, 230) : random(110, 200),
          aseKleeBend(kind, side),
          ctxArc
        ),
        true
      )
    ) {
      regionLoad[ri]++;
    }
  }

  return aseCapPaths(paths, need);
}

const ASE_MORPH_N = 48;

function asePathCentroid(pts) {
  if (!pts || !pts.length) return { x: ASE_W * 0.5, y: ASE_H * 0.5 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i++) {
    sx += pts[i].x;
    sy += pts[i].y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

function asePathsCentroid(paths) {
  if (!paths || !paths.length) return { x: ASE_W * 0.5, y: ASE_H * 0.5 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < paths.length; i++) {
    const c = asePathCentroid(paths[i].pts);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / paths.length, y: sy / paths.length };
}

function asePackHub(paths) {
  if (!paths || !paths.length) return { x: ASE_W * 0.5, y: ASE_H * 0.5 };
  let sx = 0;
  let sy = 0;
  let n = 0;
  let first = null;
  let same = true;
  for (let i = 0; i < paths.length; i++) {
    const h = paths[i] && paths[i].hub;
    if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
    if (!first) first = h;
    else if (Math.hypot(h.x - first.x, h.y - first.y) > 1) same = false;
    sx += h.x;
    sy += h.y;
    n++;
  }
  if (n && same) return { x: first.x, y: first.y };
  if (n) return { x: sx / n, y: sy / n };
  return asePathsCentroid(paths);
}

function asePathHub(path, fallback) {
  const h = path && path.hub;
  if (h && Number.isFinite(h.x) && Number.isFinite(h.y)) {
    return { x: h.x, y: h.y };
  }
  return fallback || { x: ASE_W * 0.5, y: ASE_H * 0.5 };
}

function asePathLen(pts, closed) {
  if (!pts || pts.length < 2) return 0;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function aseAngDiff(a, b) {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function asePathFeat(p) {
  const c = asePathCentroid(p.pts);
  const dx = c.x - ASE_W * 0.5;
  const dy = c.y - ASE_H * 0.5;
  return {
    p,
    ang: Math.atan2(dy, dx),
    rad: Math.hypot(dx, dy),
    len: asePathLen(p.pts, !!p.closed),
  };
}

function aseMatchCost(a, b, maxLen, diag) {
  const dLen = Math.abs(a.len - b.len) / maxLen;
  const dAng = aseAngDiff(a.ang, b.ang) / Math.PI;
  const dRad = Math.abs(a.rad - b.rad) / diag;
  return dLen * 1.8 + dAng * 0.8 + dRad * 0.35;
}

function aseBestUnused(anchor, feats, used, maxLen, diag) {
  let best = -1;
  let bestC = Infinity;
  for (let j = 0; j < feats.length; j++) {
    if (used[j]) continue;
    const cost = aseMatchCost(anchor, feats[j], maxLen, diag);
    if (cost < bestC) {
      bestC = cost;
      best = j;
    }
  }
  return best;
}

/** 先鎖長線：A→B 配對，多的那端之後縮進重心。 */
function aseMatchTwo(listA, listB) {
  const A = listA.map(asePathFeat).sort((a, b) => b.len - a.len || a.ang - b.ang);
  const B = listB.map(asePathFeat);
  const used = new Array(B.length).fill(false);
  const pairs = [];
  const diag = Math.hypot(ASE_W, ASE_H) || 1;
  let maxLen = 1;
  for (let i = 0; i < A.length; i++) if (A[i].len > maxLen) maxLen = A[i].len;
  for (let j = 0; j < B.length; j++) if (B[j].len > maxLen) maxLen = B[j].len;
  for (let i = 0; i < A.length; i++) {
    const j = aseBestUnused(A[i], B, used, maxLen, diag);
    if (j >= 0) {
      used[j] = true;
      pairs.push({ a: A[i].p, b: B[j].p });
    } else {
      pairs.push({ a: A[i].p, b: null });
    }
  }
  for (let j = 0; j < B.length; j++) {
    if (!used[j]) pairs.push({ a: null, b: B[j].p });
  }
  return pairs;
}

function aseBlankBundle() {
  return {
    grid: null,
    conc: null,
    bar: null,
    branch: null,
    star: null,
    thread: null,
    klee: null,
  };
}

function aseBundleAnchor(b) {
  return b.grid || b.conc || b.bar || b.branch || b.star || b.thread || b.klee;
}

function aseAttachSide(bundles, key, paths) {
  const feats = paths.map(asePathFeat);
  const used = new Array(feats.length).fill(false);
  const diag = Math.hypot(ASE_W, ASE_H) || 1;
  let maxLen = 1;
  for (let i = 0; i < bundles.length; i++) {
    const p = aseBundleAnchor(bundles[i]);
    if (p) {
      const L = asePathLen(p.pts, !!p.closed);
      if (L > maxLen) maxLen = L;
    }
  }
  for (let j = 0; j < feats.length; j++) {
    if (feats[j].len > maxLen) maxLen = feats[j].len;
  }
  const out = [];
  for (let i = 0; i < bundles.length; i++) {
    const next = Object.assign(aseBlankBundle(), bundles[i]);
    const anchor = aseBundleAnchor(next);
    const j = anchor
      ? aseBestUnused(asePathFeat(anchor), feats, used, maxLen, diag)
      : -1;
    if (j >= 0) {
      used[j] = true;
      next[key] = feats[j].p;
    }
    out.push(next);
  }
  for (let j = 0; j < feats.length; j++) {
    if (!used[j]) {
      const extra = aseBlankBundle();
      extra[key] = feats[j].p;
      out.push(extra);
    }
  }
  return out;
}

/** 七套造型同一條身份，長線對長線。 */
function aseMatchBundles(grid, conc, bars, branches, stars, threads, klees) {
  let bundles = aseMatchTwo(grid, conc).map((p) => ({
    grid: p.a,
    conc: p.b,
    bar: null,
    branch: null,
    star: null,
    thread: null,
    klee: null,
  }));
  bundles = aseAttachSide(bundles, "bar", bars);
  bundles = aseAttachSide(bundles, "branch", branches);
  bundles = aseAttachSide(bundles, "star", stars);
  bundles = aseAttachSide(bundles, "thread", threads);
  bundles = aseAttachSide(bundles, "klee", klees);
  return bundles;
}

function aseResamplePts(pts, closed, count) {
  if (!pts || pts.length < 2 || count < 2) return null;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const lens = new Array(segs);
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    lens[i] = d;
    total += d;
  }
  const out = [];
  if (total < 1e-6) {
    for (let k = 0; k < count; k++) out.push({ x: pts[0].x, y: pts[0].y });
    return out;
  }
  for (let k = 0; k < count; k++) {
    const target = closed
      ? (k / count) * total
      : (k / (count - 1)) * total;
    let acc = 0;
    let placed = false;
    for (let i = 0; i < segs; i++) {
      const next = acc + lens[i];
      if (target <= next + 1e-9 || i === segs - 1) {
        const span = lens[i] > 1e-9 ? lens[i] : 1;
        const u = Math.max(0, Math.min(1, (target - acc) / span));
        const a = pts[i];
        const b = pts[(i + 1) % n];
        out.push({
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
        });
        placed = true;
        break;
      }
      acc = next;
    }
    if (!placed) out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
  }
  return out;
}

function aseRotateNearest(pts, target) {
  if (!pts || !pts.length || !target) return pts;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - target.x;
    const dy = pts[i].y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  if (bestI === 0) return pts;
  return pts.slice(bestI).concat(pts.slice(0, bestI));
}

function aseAlignPts(pts, closed, target) {
  if (!pts || !pts.length || !target) return pts;
  if (closed) return aseRotateNearest(pts, target);
  const a = pts[0];
  const b = pts[pts.length - 1];
  const d0 = (a.x - target.x) * (a.x - target.x) + (a.y - target.y) * (a.y - target.y);
  const d1 = (b.x - target.x) * (b.x - target.x) + (b.y - target.y) * (b.y - target.y);
  return d1 < d0 ? pts.slice().reverse() : pts;
}

function aseFlatPts(c, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: c.x, y: c.y });
  return out;
}

function aseSampleSide(path, closed, center) {
  if (!path) return aseFlatPts(center, ASE_MORPH_N);
  return aseResamplePts(path.pts, !!closed, ASE_MORPH_N);
}

/** 中段慢：0.3–0.7 多停在混合態，避免過 0.5 一次跳到另一邊。 */
function aseEaseMid(t) {
  t = aseClamp(t, 0, 1, 0);
  const u = 2 * t - 1;
  const mid = 0.5 + 0.5 * u * u * u;
  return t * 0.4 + mid * 0.6;
}

function aseMorphMap(key) {
  return aseEaseMid(aseLayoutWeight(key));
}

function aseMorphWeights() {
  let wG = aseMorphMap("gridT");
  let wC = aseMorphMap("concT");
  let wB = aseMorphMap("barT");
  let wR = aseMorphMap("branchT");
  let wS = aseMorphMap("starT");
  let wT = aseMorphMap("threadT");
  let wK = aseMorphMap("kleeT");
  let sum = wG + wC + wB + wR + wS + wT + wK;
  if (sum <= 1e-6)
    return { wG: 0, wC: 0, wB: 0, wR: 0, wS: 0, wT: 0, wK: 0, wRest: 1, sum: 0 };
  if (sum > 1) {
    wG /= sum;
    wC /= sum;
    wB /= sum;
    wR /= sum;
    wS /= sum;
    wT /= sum;
    wK /= sum;
    sum = 1;
  }
  return { wG, wC, wB, wR, wS, wT, wK, wRest: 1 - sum, sum };
}

function aseMorphBundles(bundles, pack, weights) {
  const list = bundles || [];
  if (!list.length) return [];
  const gridHub0 = asePackHub(pack.grid);
  const concHub0 = asePackHub(pack.conc);
  const barHub0 = asePackHub(pack.bars);
  const branchHub0 = asePackHub(pack.branches);
  const starHub0 = asePackHub(pack.stars);
  const threadHub0 = asePackHub(pack.threads);
  const kleeHub0 = asePackHub(pack.klees);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const g = list[i].grid;
    const c = list[i].conc;
    const b = list[i].bar;
    const r = list[i].branch;
    const s = list[i].star;
    const th = list[i].thread;
    const kl = list[i].klee;
    const gHub = asePathHub(g, gridHub0);
    const cHub = asePathHub(c, concHub0);
    const bHub = asePathHub(b, barHub0);
    const rHub = asePathHub(r, branchHub0);
    const sHub = asePathHub(s, starHub0);
    const tHub = asePathHub(th, threadHub0);
    const kHub = asePathHub(kl, kleeHub0);
    let pg = aseSampleSide(g, g && g.closed, gHub);
    let pc = aseSampleSide(c, c && c.closed, cHub);
    let pb = aseSampleSide(b, b && b.closed, bHub);
    let pr = aseSampleSide(r, r && r.closed, rHub);
    let ps = aseSampleSide(s, s && s.closed, sHub);
    let pt = aseSampleSide(th, th && th.closed, tHub);
    let pk = aseSampleSide(kl, kl && kl.closed, kHub);
    if (!pg || !pc || !pb || !pr || !ps || !pt || !pk) continue;
    const ref = g
      ? pg[0]
      : c
        ? pc[0]
        : b
          ? pb[0]
          : r
            ? pr[0]
            : s
              ? ps[0]
              : th
                ? pt[0]
                : pk[0];
    if (c) pc = aseAlignPts(pc, !!c.closed, ref);
    if (b) pb = aseAlignPts(pb, !!b.closed, ref);
    if (r) pr = aseAlignPts(pr, !!r.closed, ref);
    if (s) ps = aseAlignPts(ps, !!s.closed, ref);
    if (th) pt = aseAlignPts(pt, !!th.closed, ref);
    if (kl) pk = aseAlignPts(pk, !!kl.closed, ref);
    const live = [
      { pts: pg, w: weights.wG, hub: gHub },
      { pts: pc, w: weights.wC, hub: cHub },
      { pts: pb, w: weights.wB, hub: bHub },
      { pts: pr, w: weights.wR, hub: rHub },
      { pts: ps, w: weights.wS, hub: sHub },
      { pts: pt, w: weights.wT, hub: tHub },
      { pts: pk, w: weights.wK, hub: kHub },
    ];
    let hx = 0;
    let hy = 0;
    let hw = 0;
    for (let s = 0; s < live.length; s++) {
      if (live[s].w <= 1e-6) continue;
      hx += live[s].hub.x * live[s].w;
      hy += live[s].hub.y * live[s].w;
      hw += live[s].w;
    }
    const H =
      hw > 1e-6
        ? { x: hx / hw, y: hy / hw }
        : { x: ASE_W * 0.5, y: ASE_H * 0.5 };
    const energy =
      1 -
      (weights.wG * weights.wG +
        weights.wC * weights.wC +
        weights.wB * weights.wB +
        weights.wR * weights.wR +
        weights.wS * weights.wS +
        weights.wT * weights.wT +
        weights.wK * weights.wK +
        weights.wRest * weights.wRest);
    const pulse = Math.sin(Math.max(0, energy) * Math.PI);
    const salt =
      Number(
        g && g.salt != null
          ? g.salt
          : c && c.salt != null
            ? c.salt
            : b && b.salt != null
              ? b.salt
              : r && r.salt != null
                ? r.salt
                : s && s.salt != null
                  ? s.salt
                  : th && th.salt != null
                    ? th.salt
                    : kl && kl.salt
      ) || i;
    const pts = [];
    for (let k = 0; k < ASE_MORPH_N; k++) {
      if (!ASE_LAB.nonlinear) {
        let x = 0;
        let y = 0;
        for (let s = 0; s < live.length; s++) {
          const w = live[s].w;
          if (w <= 1e-6) continue;
          const src = live[s].pts[k];
          x += src.x * w;
          y += src.y * w;
        }
        x += H.x * weights.wRest;
        y += H.y * weights.wRest;
        pts.push({ x, y });
        continue;
      }
      let refA = null;
      let sr = 0;
      let cs = 0;
      let sn = 0;
      for (let s = 0; s < live.length; s++) {
        const w = live[s].w;
        if (w <= 1e-6) continue;
        const src = live[s].pts[k];
        const hub = live[s].hub;
        const dx = src.x - hub.x;
        const dy = src.y - hub.y;
        const rad = Math.hypot(dx, dy);
        let ang = Math.atan2(dy, dx);
        if (refA == null) refA = ang;
        else ang = refA + aseAngWrap(ang - refA);
        sr += rad * w;
        cs += Math.cos(ang) * w;
        sn += Math.sin(ang) * w;
      }
      const u = ASE_MORPH_N > 1 ? k / (ASE_MORPH_N - 1) : 0;
      const wave = Math.sin(u * Math.PI * 3 + salt * 0.71);
      const late = Math.sin((u * 0.85 + 0.08) * Math.PI);
      let rad = sr;
      let ang = Math.atan2(sn, cs);
      rad *= 1 + energy * pulse * 0.8 * (0.11 + 0.09 * wave);
      ang += energy * pulse * 0.8 * (0.2 * wave + 0.1 * late * Math.sin(salt * 0.33 + u * 7));
      pts.push({
        x: H.x + Math.cos(ang) * rad,
        y: H.y + Math.sin(ang) * rad,
      });
    }
    out.push({
      pts,
      closed: false,
      salt:
        g && g.salt != null
          ? g.salt
          : c && c.salt != null
            ? c.salt
            : b && b.salt != null
              ? b.salt
              : r && r.salt != null
                ? r.salt
                : s && s.salt != null
                  ? s.salt
                  : th && th.salt != null
                    ? th.salt
                    : kl && kl.salt,
      accent:
        !!(g && g.accent) ||
        !!(c && c.accent) ||
        !!(b && b.accent) ||
        !!(r && r.accent) ||
        !!(s && s.accent) ||
        !!(th && th.accent) ||
        !!(kl && kl.accent),
    });
  }
  return out;
}

function aseMorphCacheKey() {
  return [
    aseSeed,
    ASE_W,
    ASE_H,
    ASE_ROWS,
    ASE_COLS,
    ASE_MARGIN,
    ASE_LENMIN,
    ASE_LENMAX,
    ASE_ARCS,
    ASE_RINGS,
    ASE_RING_GAP,
    ASE_HOBBS,
    ASE_RING_COPIES,
    ASE_RING_SCALE,
    ASE_BARS,
    ASE_BAR_H,
    ASE_BAR_TILT,
    ASE_BAR_NOISE,
    ASE_BRANCH_SEEDS,
    ASE_BRANCH_MAX,
    ASE_BRANCH_STEP,
    ASE_BRANCH_NOISE,
    ASE_BRANCH_DEPTH,
    ASE_STAR_MIN,
    ASE_STAR_MAX,
    ASE_STAR_LEN,
    ASE_STAR_STEP,
    ASE_STAR_NOISE,
    ASE_THREAD_LEN,
    ASE_THREAD_STEP,
    ASE_THREAD_NOISE,
    ASE_KLEE_PAD,
    ASE_KLEE_LONG,
    ASE_KLEE_STEP,
    ASE_KLEE_BOX_W,
    ASE_KLEE_BOX_H,
    aseLayoutN(),
  ].join("|");
}

function aseMarkLongLayout(grid) {
  const feats = grid.map((p) => ({
    p,
    len: asePathLen(p.pts, !!p.closed),
  }));
  feats.sort((a, b) => b.len - a.len);
  const k = Math.max(1, Math.round(grid.length * 0.1));
  for (let i = 0; i < feats.length; i++) feats[i].p.accent = i < k;
}

function aseStampBundleSalts(bundles) {
  for (let i = 0; i < bundles.length; i++) {
    const g = bundles[i].grid;
    const c = bundles[i].conc;
    const b = bundles[i].bar;
    const r = bundles[i].branch;
    const s = bundles[i].star;
    const th = bundles[i].thread;
    const kl = bundles[i].klee;
    const salt =
      g && g.salt != null
        ? g.salt
        : c && c.salt != null
          ? c.salt
          : b && b.salt != null
            ? b.salt
            : r && r.salt != null
              ? r.salt
              : s && s.salt != null
                ? s.salt
                : th && th.salt != null
                  ? th.salt
                  : kl && kl.salt != null
                    ? kl.salt
                    : i * 1.37;
    const accent = !!(g && g.accent);
    if (g) g.salt = salt;
    if (c) {
      c.salt = salt;
      c.accent = accent;
    }
    if (b) {
      b.salt = salt;
      b.accent = accent;
    }
    if (r) {
      r.salt = salt;
      r.accent = accent;
    }
    if (s) {
      s.salt = salt;
      s.accent = accent;
    }
    if (th) {
      th.salt = salt;
      th.accent = accent;
    }
    if (kl) kl.salt = salt;
  }
}

function aseEnsureMorphCache() {
  const key = aseMorphCacheKey();
  if (aseMorphCache && aseMorphCache.key === key) return aseMorphCache;
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const grid = aseCollectGridPaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const conc = aseCollectConcentricPaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const bars = aseCollectBarcodePaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const branches = aseCollectBranchPaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const stars = aseCollectStarPaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const threads = aseCollectThreadPaths();
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  const klees = aseCollectKleePaths();
  aseMarkLongLayout(grid);
  const bundles = aseMatchBundles(grid, conc, bars, branches, stars, threads, klees);
  aseStampBundleSalts(bundles);
  aseMorphCache = { key, grid, conc, bars, branches, stars, threads, klees, bundles };
  return aseMorphCache;
}

function aseLayoutWeight(key) {
  return aseClamp(ASE_LAB[key], 0, 1, 0);
}

/** 同一條線在七套造型間插值；只開一端則用該端原路徑。 */
function aseCollectPaths() {
  const pack = aseEnsureMorphCache();
  const wG = aseLayoutWeight("gridT");
  const wC = aseLayoutWeight("concT");
  const wB = aseLayoutWeight("barT");
  const wR = aseLayoutWeight("branchT");
  const wS = aseLayoutWeight("starT");
  const wT = aseLayoutWeight("threadT");
  const wK = aseLayoutWeight("kleeT");
  const live =
    (wG > 1e-6 ? 1 : 0) +
    (wC > 1e-6 ? 1 : 0) +
    (wB > 1e-6 ? 1 : 0) +
    (wR > 1e-6 ? 1 : 0) +
    (wS > 1e-6 ? 1 : 0) +
    (wT > 1e-6 ? 1 : 0) +
    (wK > 1e-6 ? 1 : 0);
  if (live === 0) return [];
  if (live === 1 && wG >= 1) return pack.grid;
  if (live === 1 && wC >= 1) return pack.conc;
  if (live === 1 && wB >= 1) return pack.bars;
  if (live === 1 && wR >= 1) return pack.branches;
  if (live === 1 && wS >= 1) return pack.stars;
  if (live === 1 && wT >= 1) return pack.threads;
  if (live === 1 && wK >= 1) return pack.klees;
  return aseMorphBundles(pack.bundles, pack, aseMorphWeights());
}

function aseLayoutCaption() {
  const bits = [];
  if (aseLayoutWeight("gridT") > 0) {
    bits.push("grid " + aseLayoutWeight("gridT").toFixed(2));
  }
  if (aseLayoutWeight("concT") > 0) {
    bits.push("conc " + aseLayoutWeight("concT").toFixed(2));
  }
  if (aseLayoutWeight("barT") > 0) {
    bits.push("bar " + aseLayoutWeight("barT").toFixed(2));
  }
  if (aseLayoutWeight("branchT") > 0) {
    bits.push("branch " + aseLayoutWeight("branchT").toFixed(2));
  }
  if (aseLayoutWeight("starT") > 0) {
    bits.push("star " + aseLayoutWeight("starT").toFixed(2));
  }
  if (aseLayoutWeight("threadT") > 0) {
    bits.push("thread " + aseLayoutWeight("threadT").toFixed(2));
  }
  if (aseLayoutWeight("kleeT") > 0) {
    bits.push("klee " + aseLayoutWeight("kleeT").toFixed(2));
  }
  if (!bits.length) return "none";
  return bits.length > 1 ? "morph " + bits.join(" · ") : bits[0];
}

function aseScalePts(pts, mul) {
  if (!pts || pts.length < 2) return pts;
  const ox = pts[0].x;
  const oy = pts[0].y;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push({
      x: ox + (pts[i].x - ox) * mul,
      y: oy + (pts[i].y - oy) * mul,
    });
  }
  return out;
}

function aseStrokeLen(st) {
  const pts = st && st.pts;
  if (!pts || pts.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return n;
}

function aseMarkAccent(strokes) {
  if (!strokes || !strokes.length) return;
  for (let i = 0; i < strokes.length; i++) strokes[i].accent = false;
  const groups = {};
  for (let i = 0; i < strokes.length; i++) {
    const st = strokes[i];
    if (!st || !st.pathAccent) continue;
    const key = String(st.pathSalt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(st);
  }
  const keys = Object.keys(groups);
  for (let i = 0; i < keys.length; i++) {
    const bits = groups[keys[i]];
    let best = bits[0];
    let bestL = aseStrokeLen(best);
    for (let j = 1; j < bits.length; j++) {
      const L = aseStrokeLen(bits[j]);
      if (L > bestL) {
        best = bits[j];
        bestL = L;
      }
    }
    if (best) {
      best.accent = true;
      best.pts = aseScalePts(best.pts, 2);
    }
  }
}

function asePickInkPalette(u) {
  const n = ASE_INK_PALETTE.length;
  if (n < 2) return ASE_INK_PALETTE[0];
  const t = ((Number(u) || 0) % 1 + 1) % 1;
  if (t < 0.4) return ASE_INK_PALETTE[0];
  const rest = n - 1;
  const i = 1 + Math.min(rest - 1, Math.floor(((t - 0.4) / 0.6) * rest));
  return ASE_INK_PALETTE[i];
}

function aseInkColor(stroke) {
  if (ASE_LAB.randColor) {
    const salt = Number(stroke && stroke.pathSalt);
    const id = Number.isFinite(salt) ? salt : Number(stroke && stroke.sw) || 0;
    const c = asePickInkPalette(aseRng(aseHashSeed(aseSeed, id + 11.3))());
    return color(c[0], c[1], c[2]);
  }
  if (stroke && stroke.accent && ASE_LAB.white !== false) return color(255);
  if (ASE_LAB.pencil) {
    const salt = Number(stroke && stroke.pathSalt);
    const id = Number.isFinite(salt) ? salt : Number(stroke && stroke.sw) || 0;
    const mul = 0.5 + aseRng(aseHashSeed(aseSeed, id + 4.9))() * 0.5;
    return color(30 * mul, 110 * mul, 230 * mul);
  }
  return color(50);
}

function asePaintPencilPath(stroke) {
  const pts = stroke && stroke.pts ? stroke.pts : stroke;
  if (!pts || pts.length < 2) return null;
  const glPts = [];
  for (let i = 0; i < pts.length; i++) {
    glPts.push(aseToGl(pts[i]));
  }
  const sw = Number(stroke && stroke.sw);
  const w = Number.isFinite(sw) ? Math.max(0.45, sw) : 2.4;
  const dens = Number(stroke && stroke.dens);
  const ink = aseInkColor(stroke);
  let widths = null;
  if (stroke && stroke.taper) {
    widths = [];
    for (let i = 0; i < glPts.length; i++) {
      widths.push(aseTaperWeight(i, glPts.length, 1, w));
    }
  }
  drawStroke(glPts, w, img, ink, dens, widths);
  const hold = aseRng(aseHashSeed(aseSeed, w * 13 + (Number.isFinite(dens) ? dens : 0) * 7));
  if (glPts.length < 3 || hold() >= 0.2 * 0.7) return null;
  const n = glPts.length;
  const keep = Math.max(2, Math.round(n * (0.15 + hold() * 0.55)));
  const start = Math.floor(hold() * (n - keep + 1));
  return { pts: glPts.slice(start, start + keep), w, dens, ink };
}

function asePaintInkAccents(strokes) {
  if (!strokes || !strokes.length) return;
  push();
  aseFlip2D();
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < strokes.length; i++) {
    const st = strokes[i];
    if (!st || !st.accent || !st.pts || st.pts.length < 2) continue;
    stroke(aseInkColor(st));
    const sw = Number(st.sw);
    const w = Number.isFinite(sw) ? Math.max(0.45, sw) : 1.15;
    if (st.taper) aseStrokeTaperOpen(st.pts, 1, w);
    else {
      strokeWeight(w);
      MixVein.strokeOpen(st.pts);
    }
  }
  pop();
}

function asePaintInkStrokes(strokes) {
  background(ASE_PAPER[0], ASE_PAPER[1], ASE_PAPER[2]);
  push();
  aseFlip2D();
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < strokes.length; i++) {
    const st = strokes[i];
    if (!st || !st.pts || st.pts.length < 2) continue;
    const sw = Number(st.sw);
    stroke(aseInkColor(st));
    const w = Number.isFinite(sw) ? Math.max(0.45, sw) : 1.15;
    if (st.taper) aseStrokeTaperOpen(st.pts, 1, w);
    else {
      strokeWeight(w);
    MixVein.strokeOpen(st.pts);
    }
  }
  pop();
}

function aseDrawPathGuides(paths) {
  if (!ASE_LAB.showPath || !paths) return;
  push();
  aseFlip2D();
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  stroke(220, 40, 40, 160);
  strokeWeight(1.4);
  for (let i = 0; i < paths.length; i++) {
    if (paths[i].closed) {
      beginShape();
      for (let j = 0; j < paths[i].pts.length; j++) {
        vertex(paths[i].pts[j].x, paths[i].pts[j].y);
      }
      endShape(CLOSE);
    } else {
    MixVein.strokeOpen(paths[i].pts);
    }
  }
  pop();
}

const ASE_HUD_SLIDES = [
  ["gridT", "grid"],
  ["concT", "concentric"],
  ["barT", "barcode"],
  ["branchT", "branch"],
  ["starT", "stars"],
  ["threadT", "thread"],
  ["kleeT", "klee"],
];

function aseHudGeom() {
  const labelW = 108;
  const labelGap = 16;
  const trackW = 268;
  const colGap = 64;
  const colW = labelW + labelGap + trackW;
  const pad = (ASE_W - (colW * 2 + colGap)) * 0.5;
  const rowH = 42;
  const y0 = ASE_H - 48 - 5 * rowH;
  const cols = [pad, pad + colW + colGap];
  const countTrackX = cols[0] + labelW + labelGap;
  const count = {
    key: "lineN",
    kind: "count",
    label: "線條數量",
    y: y0,
    labelX: cols[0],
    trackX: countTrackX,
    trackW,
    trackY: y0 + rowH * 0.5,
    trackSalt: 12,
    hit: {
      x: countTrackX - 12,
      y: y0 - 4,
      w: trackW + 24,
      h: rowH + 8,
    },
  };
  const morphY0 = y0 + rowH;
  const rows = [];
  for (let i = 0; i < ASE_HUD_SLIDES.length; i++) {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = cols[col];
    const y = morphY0 + row * rowH;
    const trackX = x + labelW + labelGap;
    rows.push({
      key: ASE_HUD_SLIDES[i][0],
      label: ASE_HUD_SLIDES[i][1],
      y,
      labelX: x,
      trackX,
      trackW,
      trackY: y + rowH * 0.5,
      trackSalt: 20 + i * 5,
      hit: { x: trackX - 12, y: y - 4, w: trackW + 24, h: rowH + 8 },
    });
  }
  const rightTrackX = cols[1] + labelW + labelGap;
  const btnW = colW * 0.7;
  const trackRight = rightTrackX + trackW;
  return {
    count,
    rows,
    btn: {
      x: trackRight - btnW,
      y: y0 + (rowH - 30) * 0.5,
      w: btnW,
      h: 30,
    },
    rightTrackX,
  };
}

function aseHudLine(x0, y0, x1, y1, salt, n, ampX, ampY) {
  n = Math.max(8, n || 18);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const side = ampY == null ? 1.8 : ampY;
  const along = ampX == null ? 0.7 : ampX * 0.35;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const n1 = noise(salt * 0.11 + t * 7.2, salt * 0.07);
    const n2 = noise(salt * 0.19 + t * 13.4 + 9, salt * 0.13);
    const n3 = noise(t * 4.8 + salt * 0.05, 5.2);
    const wob = ((n1 - 0.5) * 1.35 + (n2 - 0.5) * 0.55) * side;
    const slide = (n3 - 0.5) * along;
    pts.push({
      x: x0 + dx * t + px * wob + ux * slide,
      y: y0 + dy * t + py * wob + uy * slide,
    });
  }
  return pts;
}

function aseHudAt(x0, y0, x1, y1, salt, n, ampX, ampY, u) {
  const pts = aseHudLine(x0, y0, x1, y1, salt, n, ampX, ampY);
  if (!pts.length) return { x: x0, y: y0 };
  const i = aseClamp(u, 0, 1, 0) * (pts.length - 1);
  const lo = Math.max(0, Math.floor(i));
  const hi = Math.min(pts.length - 1, lo + 1);
  const f = i - lo;
  return {
    x: pts[lo].x + (pts[hi].x - pts[lo].x) * f,
    y: pts[lo].y + (pts[hi].y - pts[lo].y) * f,
  };
}

function aseHudDrawX(cx, cy, salt, weight, arm, col) {
  const a = arm == null ? 8 : arm;
  const w = weight == null ? 2.8 : weight;
  aseHudStroke(
    aseHudLine(cx - a, cy - a, cx + a, cy + a, salt, 8, 1.1, 1.4),
    w,
    col,
    3
  );
  aseHudStroke(
    aseHudLine(cx + a, cy - a, cx - a, cy + a, salt + 5, 8, 1.1, 1.4),
    w,
    col,
    3
  );
}

function aseHudStroke(pts, weight, col, passes) {
  if (!pts || pts.length < 2) return;
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  const n = passes == null ? 3 : passes;
  for (let k = 0; k < n; k++) {
    const a = 46 + k * 58;
    stroke(red(col), green(col), blue(col), a);
    strokeWeight(weight * (0.42 + k * 0.28));
    beginShape();
    for (let i = 0; i < pts.length; i++) {
      vertex(pts[i].x, pts[i].y);
    }
    endShape();
  }
}

function aseHudRect(x, y, w, h, salt, weight) {
  const ink = color(42, 38, 32);
  const sw = weight == null ? 1.35 : weight;
  for (let loop = 0; loop < 2; loop++) {
    const s = salt + loop * 11;
    const ox = loop * 0.9;
    const oy = loop * 0.7;
    const over = 4 + loop;
    aseHudStroke(
      aseHudLine(x - over, y + oy, x + w + over, y + oy, s, 18, 1.3, 0.7),
      sw,
      ink,
      2
    );
    aseHudStroke(
      aseHudLine(x + w + ox, y - 3, x + w + ox, y + h + 3, s + 3, 10, 0.7, 1.3),
      sw,
      ink,
      2
    );
    aseHudStroke(
      aseHudLine(x + w + over, y + h - oy, x - over, y + h - oy, s + 6, 18, 1.3, 0.7),
      sw,
      ink,
      2
    );
    aseHudStroke(
      aseHudLine(x - ox, y + h + 3, x - ox, y - 3, s + 9, 10, 0.7, 1.3),
      sw,
      ink,
      2
    );
  }
}

function aseHudRowT(row) {
  if (row && row.kind === "count") {
    return (aseLayoutN() - 2) / 68;
  }
  return aseClamp(ASE_LAB[row.key], 0, 1, 0);
}

function aseHudApplyRow(row, x) {
  const u = aseHudFromX(row, x);
  if (row && row.kind === "count") {
    ASE_LAB.lineN = Math.round(2 + u * 68);
    ASE_LAB.lineN = Math.round(aseClamp(ASE_LAB.lineN, 2, 70, ASE_LAYOUT_N));
    aseSyncSliders();
    aseSaveLs();
    if (ASE_LAB.live === false) redraw();
    else aseMaybeRedraw();
    return;
  }
  aseHudSetT(row.key, u);
}

function aseHudDrawTrack(row, i) {
  const ink = color(42, 38, 32);
  const dark = color(18, 16, 14);
  const t = aseHudRowT(row);
  noStroke();
  fill(42, 38, 32, 200);
  textAlign(LEFT, CENTER);
  textSize(13);
  text(row.label, row.labelX, row.trackY);
  const x1 = row.trackX + row.trackW;
  const salt = row.trackSalt;
  aseHudStroke(
    aseHudLine(row.trackX, row.trackY, x1, row.trackY, salt, 36, 1.1, 3.4),
    1.35,
    ink,
    2
  );
  if (t > 0.01) {
    const xm = row.trackX + row.trackW * t;
    aseHudStroke(
      aseHudLine(row.trackX, row.trackY, xm, row.trackY, salt, 32, 1.1, 3.4),
      3.6,
      dark,
      3
    );
  }
  const p = aseHudAt(
    row.trackX,
    row.trackY,
    x1,
    row.trackY,
    salt,
    36,
    1.1,
    3.4,
    t
  );
  const hot = aseHudDrag === row.key || aseHudThumbHover === row.key;
  aseHudDrawX(p.x, p.y, 140 + i * 3, hot ? 4.2 : 3.1, hot ? 7 : 5.95, dark);
}

function aseDrawHud() {
  const g = aseHudGeom();
  push();
  aseHudDrawTrack(g.count, -1);
  for (let i = 0; i < g.rows.length; i++) {
    aseHudDrawTrack(g.rows[i], i);
  }
  const seedW = aseHudPress ? 3.4 : aseHudHover ? 2.9 : 1.35;
  const seedDy = aseHudPress ? 1 : 0;
  aseHudRect(g.btn.x, g.btn.y + seedDy, g.btn.w, g.btn.h, 240, seedW);
  noStroke();
  fill(42, 38, 32, aseHudPress ? 255 : 220);
  textAlign(CENTER, CENTER);
  textSize(12);
  text(
    "seed=" + aseSeed,
    g.btn.x + g.btn.w * 0.5,
    g.btn.y + g.btn.h * 0.5 + 1 + seedDy
  );
  pop();
}

function aseHudInside(box, x, y) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

function aseHudSetT(key, t) {
  ASE_LAB[key] = aseClamp(t, 0, 1, 0);
  aseSyncSliders();
  aseSaveLs();
  if (ASE_LAB.live === false && aseBake) aseOverlayFromBake();
  else redraw();
}

function aseHudFromX(row, x) {
  if (!row.trackW) return 0;
  return aseClamp((x - row.trackX) / row.trackW, 0, 1, 0);
}

function aseHudPick(x, y) {
  const g = aseHudGeom();
  const b = g.btn;
  if (
    aseHudInside(
      { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 },
      x,
      y
    )
  ) {
    return { type: "seed" };
  }
  if (g.count && aseHudInside(g.count.hit, x, y)) {
    return { type: "slide", row: g.count };
  }
  for (let i = 0; i < g.rows.length; i++) {
    if (aseHudInside(g.rows[i].hit, x, y)) {
      return { type: "slide", row: g.rows[i] };
    }
  }
  return null;
}

function aseDrawCaption() {
  noStroke();
  fill(40, 120);
  textAlign(LEFT, TOP);
  textSize(11);
  text(
    "asemic · " +
      aseLayoutCaption() +
      " · 線數 " +
      aseLayoutN() +
      " · 粗度 " +
      Number(ASE_LAB.swMul == null ? 1 : ASE_LAB.swMul).toFixed(2) +
      " · 線／葉 " +
      ASE_LAB.leafShare.toFixed(2) +
      " · 葉長 " +
      ASE_LAB.leafLen.toFixed(2) +
      " · 葉寬 " +
      ASE_LAB.leafWid.toFixed(2) +
      " · 緣／脈 " +
      ASE_LAB.leafVein.toFixed(2) +
      " · 曲線／三角 " +
      ASE_LAB.leafTri.toFixed(2) +
      (ASE_LAB.randPath ? " · 每徑不同" : "") +
      (ASE_LAB.nonlinear ? " · 非線性" : " · 線性") +
      (ASE_LAB.brush === false ? " · 無筆刷" : ASE_LAB.pencil ? " · 鉛筆" : "") +
      (ASE_LAB.live !== false ? " · 即時" : " · 凍結") +
      " · seed " +
      aseSeed,
    18,
    14
  );
}

function aseOverlayFromBake() {
  if (!aseBake) {
    redraw();
    return;
  }
  image(aseBake, 0, 0, ASE_W, ASE_H);
  aseDrawPathGuides(aseBakePaths);
  aseDrawCaption();
  aseDrawHud();
}

function asePaint() {
  const paths = aseCollectPaths();
  const showBrush = ASE_LAB.brush !== false;
  if (!showBrush) {
    background(ASE_PAPER[0], ASE_PAPER[1], ASE_PAPER[2]);
  } else {
  const wantPencil = !!ASE_LAB.pencil;
  const strokes = [];
  for (let i = 0; i < paths.length; i++) {
      const salt = paths[i].salt;
      const veinSeed = aseHashSeed(aseSeed, (salt || 0) + 17.3);
      randomSeed(veinSeed);
      noiseSeed(veinSeed);
      const opts = Object.assign(asePathOpts(salt), { showPath: false });
      if (paths[i].klee) {
        const L = asePathLen(paths[i].pts, !!paths[i].closed);
        if (L < 58) {
          opts.leafShare = 0;
          opts.leafOff = 0;
        }
      }
    const bits = MixVein.collect(
        { pts: paths[i].pts, closed: !!paths[i].closed },
      opts
    );
      const dens = ASE_PENCIL_DENS;
    for (let j = 0; j < bits.length; j++) {
      bits[j].dens = dens;
        bits[j].pathSalt = salt;
        bits[j].pathAccent = !!paths[i].accent;
      strokes.push(bits[j]);
    }
  }
  aseMarkAccent(strokes);
    aseMarkTaper(strokes);
  asePencilReady = wantPencil && aseBeginPencil();
  if (!asePencilReady) {
    asePaintInkStrokes(strokes);
  } else {
      const extras = [];
    for (let i = 0; i < strokes.length; i++) {
        if (ASE_LAB.white !== false && strokes[i] && strokes[i].accent) continue;
        const extra = asePaintPencilPath(strokes[i]);
        if (extra) extras.push(extra);
      }
      for (let i = 0; i < extras.length; i++) {
        drawStroke(extras[i].pts, extras[i].w, img, extras[i].ink, extras[i].dens);
    }
    aseEndPencil();
      if (ASE_LAB.white !== false) asePaintInkAccents(strokes);
    }
  }
  aseBake = get();
  aseBakePaths = paths;
  aseDrawPathGuides(paths);
  aseDrawCaption();
  aseDrawHud();
}

function aseBindRange(id, valId, key, lo, hi, digits) {
  const el = document.getElementById(id);
  const val = valId ? document.getElementById(valId) : null;
  if (!el) return;
  el.value = String(ASE_LAB[key]);
  const apply = () => {
    ASE_LAB[key] = constrain(Number(el.value), lo, hi);
    if (val) {
      val.textContent =
        digits == null
          ? String(Math.round(ASE_LAB[key]))
          : Number(ASE_LAB[key]).toFixed(digits);
    }
    aseSaveLs();
    aseMaybeRedraw();
  };
  if (val) {
    val.textContent =
      digits == null
        ? String(Math.round(ASE_LAB[key]))
        : Number(ASE_LAB[key]).toFixed(digits);
  }
  el.addEventListener("input", apply);
  el.addEventListener("change", apply);
}

function wireAseFloatUi() {
  const panel = document.getElementById("pen-float");
  if (!panel) return;
  const stop = (ev) => ev.stopPropagation();
  panel.addEventListener("mousedown", stop);
  panel.addEventListener("click", stop);
  panel.addEventListener("pointerdown", stop);

  const toggleBtn = document.getElementById("pen-float-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("collapsed");
      toggleBtn.textContent = collapsed ? "展開" : "收合";
      toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  const shareEl = document.getElementById("lab-leaf-share");
  const shareV = document.getElementById("lab-leaf-share-v");
  const shareLine = document.getElementById("lab-share-line");
  const shareLeaf = document.getElementById("lab-share-leaf");
  const updateShareLabel = () => {
    const t = ASE_LAB.leafShare;
    if (shareV) shareV.textContent = Number(t).toFixed(2);
    if (shareLine) shareLine.textContent = Math.round((1 - t) * 100) + "%";
    if (shareLeaf) shareLeaf.textContent = Math.round(t * 100) + "%";
  };
  if (shareEl) {
    shareEl.value = String(ASE_LAB.leafShare);
    updateShareLabel();
    const apply = () => {
      ASE_LAB.leafShare = Number(shareEl.value);
      updateShareLabel();
      aseSaveLs();
      aseMaybeRedraw();
    };
    shareEl.addEventListener("input", apply);
    shareEl.addEventListener("change", apply);
  }

  aseBindRange("lab-gap-fill", "lab-gap-fill-v", "gapFill", 2, 60, null);
  aseBindRange("lab-leaf-len", "lab-leaf-len-v", "leafLen", 0.05, 5, 2);
  aseBindRange("lab-leaf-wid", "lab-leaf-wid-v", "leafWid", 1, 3, 2);
  aseBindRange("lab-leaf-dens", "lab-leaf-dens-v", "leafDens", 1, 2, 2);
  aseBindRange("lab-leaf-sw", "lab-leaf-sw-v", "leafSw", 0.5, 6, 2);
  aseBindRange("lab-line-sw", "lab-line-sw-v", "lineSw", 0.5, 6, 2);
  aseBindRange("lab-sw-mul", "lab-sw-mul-v", "swMul", 0.5, 5, 2);
  aseBindRange("lab-leaf-tri", null, "leafTri", 0, 1, 2);
  aseBindRange("lab-leaf-vein", null, "leafVein", 0, 1, 2);
  aseBindRange("lab-leaf-off", "lab-leaf-off-v", "leafOff", -1, 1, 2);
  aseBindRange("lab-leaf-pad", null, "leafPad", 0, 1, 2);
  aseBindRange("lab-line-n", "lab-line-n-v", "lineN", 2, 70, null);
  aseBindRange("lab-grid", "lab-grid-v", "gridT", 0, 1, 2);
  aseBindRange("lab-conc", "lab-conc-v", "concT", 0, 1, 2);
  aseBindRange("lab-bar", "lab-bar-v", "barT", 0, 1, 2);
  aseBindRange("lab-branch", "lab-branch-v", "branchT", 0, 1, 2);
  aseBindRange("lab-star", "lab-star-v", "starT", 0, 1, 2);
  aseBindRange("lab-thread", "lab-thread-v", "threadT", 0, 1, 2);
  aseBindRange("lab-klee", "lab-klee-v", "kleeT", 0, 1, 2);

  const pathEl = document.getElementById("lab-path");
  if (pathEl) {
    pathEl.checked = !!ASE_LAB.showPath;
    pathEl.addEventListener("change", () => {
      ASE_LAB.showPath = !!pathEl.checked;
      aseSaveLs();
      if (ASE_LAB.live === false && aseBake) aseOverlayFromBake();
      else redraw();
    });
  }

  const randEl = document.getElementById("lab-rand-path");
  if (randEl) {
    randEl.checked = !!ASE_LAB.randPath;
    randEl.addEventListener("change", () => {
      ASE_LAB.randPath = !!randEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const nonlinearEl = document.getElementById("lab-nonlinear");
  if (nonlinearEl) {
    nonlinearEl.checked = !!ASE_LAB.nonlinear;
    nonlinearEl.addEventListener("change", () => {
      ASE_LAB.nonlinear = !!nonlinearEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const brushEl = document.getElementById("lab-brush");
  if (brushEl) {
    brushEl.checked = ASE_LAB.brush !== false;
    brushEl.addEventListener("change", () => {
      ASE_LAB.brush = !!brushEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const pencilEl = document.getElementById("lab-pencil");
  if (pencilEl) {
    pencilEl.checked = !!ASE_LAB.pencil;
    pencilEl.addEventListener("change", () => {
      ASE_LAB.pencil = !!pencilEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const whiteEl = document.getElementById("lab-white");
  if (whiteEl) {
    whiteEl.checked = ASE_LAB.white !== false;
    whiteEl.addEventListener("change", () => {
      ASE_LAB.white = !!whiteEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const randColorEl = document.getElementById("lab-rand-color");
  if (randColorEl) {
    randColorEl.checked = !!ASE_LAB.randColor;
    randColorEl.addEventListener("change", () => {
      ASE_LAB.randColor = !!randColorEl.checked;
      aseSaveLs();
      redraw();
    });
  }

  const liveEl = document.getElementById("lab-live");
  if (liveEl) {
    liveEl.checked = ASE_LAB.live !== false;
    liveEl.addEventListener("change", () => {
      ASE_LAB.live = !!liveEl.checked;
      aseSaveLs();
      if (ASE_LAB.live) redraw();
      else if (aseBake) aseOverlayFromBake();
    });
  }

  const seedBtn = document.getElementById("lab-reseed");
  if (seedBtn) {
    seedBtn.addEventListener("click", () => {
      aseNewSeed();
      redraw();
    });
  }

  const loadBtn = document.getElementById("lab-load");
  const loadFile = document.getElementById("lab-load-json");
  if (loadBtn && loadFile) {
    loadBtn.addEventListener("click", () => {
      loadFile.click();
    });
    loadFile.addEventListener("change", () => {
      const file = loadFile.files && loadFile.files[0];
      loadFile.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        aseLoadPresetJsonText(String(reader.result || ""), loadBtn);
      };
      reader.onerror = () => aseFlashLoadBtn(loadBtn, false);
      reader.readAsText(file);
    });
  }

  const copyBtn = document.getElementById("lab-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      aseCopyPreset();
    });
  }

  aseSyncSliders();
}

function setup() {
  createCanvas(ASE_W, ASE_H);
  angleMode(DEGREES);
  pixelDensity(ASE_PD);
  noLoop();
  textFont("Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif");
  aseLoadLs();
  wireAseFloatUi();
  const urlSeed = aseParseUrlSeed();
  aseNewSeed(urlSeed != null ? urlSeed : undefined);
  redraw();
}

function draw() {
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  asePaint();
}

function mousePressed() {
  if (mouseButton !== LEFT) return;
  const t = typeof event !== "undefined" && event && event.target;
  if (t && t.closest && t.closest("#pen-float")) return;
  const hit = aseHudPick(mouseX, mouseY);
  if (hit) {
    if (hit.type === "seed") {
      aseHudDrag = null;
      aseHudPress = true;
      if (aseBake) aseOverlayFromBake();
      setTimeout(() => {
        aseNewSeed();
        redraw();
      }, 40);
      return;
    }
    aseHudDrag = hit.row.key;
    aseHudApplyRow(hit.row, mouseX);
    return;
  }
  aseHudDrag = null;
  aseNewSeed();
  redraw();
}

function mouseDragged() {
  if (!aseHudDrag) return;
  const g = aseHudGeom();
  if (g.count && g.count.key === aseHudDrag) {
    aseHudApplyRow(g.count, mouseX);
    return;
  }
  for (let i = 0; i < g.rows.length; i++) {
    if (g.rows[i].key === aseHudDrag) {
      aseHudApplyRow(g.rows[i], mouseX);
      break;
    }
  }
}

function mouseReleased() {
  aseHudDrag = null;
  if (aseHudPress) {
    aseHudPress = false;
    if (aseBake) aseOverlayFromBake();
  }
}

function aseHudHoverSync() {
  const hit = aseHudPick(mouseX, mouseY);
  const nextSeed = !!(hit && hit.type === "seed");
  let nextThumb = null;
  if (hit && hit.type === "slide") {
    const row = hit.row;
    const t = aseHudRowT(row);
    const p = aseHudAt(
      row.trackX,
      row.trackY,
      row.trackX + row.trackW,
      row.trackY,
      row.trackSalt,
      36,
      1.1,
      3.4,
      t
    );
    if (Math.hypot(mouseX - p.x, mouseY - p.y) < 18) nextThumb = row.key;
  }
  if (nextSeed === aseHudHover && nextThumb === aseHudThumbHover) return;
  aseHudHover = nextSeed;
  aseHudThumbHover = nextThumb;
  if (aseBake) aseOverlayFromBake();
}

function mouseMoved() {
  aseHudHoverSync();
}

function mouseOut() {
  if (!aseHudHover && !aseHudThumbHover) return;
  aseHudHover = false;
  aseHudThumbHover = null;
  if (aseBake) aseOverlayFromBake();
}

function keyPressed() {
  if (key === "s" || key === "S") {
    saveCanvas("vein-asemic-" + aseSeed, "png");
    return;
  }
  if (key === " " || keyCode === 32) {
    aseNewSeed();
    redraw();
    return false;
  }
  if (key === "u" || key === "U") {
    const panel = document.getElementById("pen-float");
    const toggleBtn = document.getElementById("pen-float-toggle");
    if (panel) {
      const collapsed = panel.classList.toggle("collapsed");
      if (toggleBtn) {
        toggleBtn.textContent = collapsed ? "展開" : "收合";
        toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
    }
  }
}

const vert = `


#extension GL_OES_standard_derivatives : enable
attribute vec3 aPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
  vTexCoord = aTexCoord;
}`;

const texFrag = `
precision mediump float;

uniform vec2 resolution;

//https://thebookofshaders.com/edit.php#11/iching-03.frag
vec3 random3(vec3 c) {
    float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
    vec3 r;
    r.z = fract(512.0*j);
    j *= .125;
    r.x = fract(512.0*j);
    j *= .125;
    r.y = fract(512.0*j);
    return r - 0.5;
}

const float F3 =  0.3333333;
const float G3 =  0.1666667;

float snoise(vec3 p) {

    vec3 s = floor(p + dot(p, vec3(F3)));
    vec3 x = p - s + dot(s, vec3(G3));

    vec3 e = step(vec3(0.0), x - x.yzx);
    vec3 i1 = e*(1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy*(1.0 - e);

    vec3 x1 = x - i1 + G3;
    vec3 x2 = x - i2 + 2.0*G3;
    vec3 x3 = x - 1.0 + 3.0*G3;

    vec4 w, d;

    w.x = dot(x, x);
    w.y = dot(x1, x1);
    w.z = dot(x2, x2);
    w.w = dot(x3, x3);

    w = max(0.6 - w, 0.0);

    d.x = dot(random3(s), x);
    d.y = dot(random3(s + i1), x1);
    d.z = dot(random3(s + i2), x2);
    d.w = dot(random3(s + 1.0), x3);

    w *= w;
    w *= w;
    d *= w;

    return dot(d, vec4(52.0));
}

void main(void)
{
  vec2 crd = (gl_FragCoord.xy) / resolution.xy;
  float v = snoise(vec3(crd * vec2(1.0, 4.0), 0.0)) + 0.5;
  v += snoise(vec3(crd * vec2(164.0, 164.0), 0.0)) * 2.0;
  gl_FragColor = vec4(vec3(v), 1.0);
}`;

const strokeFrag = `
precision mediump float;

varying vec2 vTexCoord;

uniform vec2 size;
uniform vec3 strokeColor;
uniform sampler2D tex0;
uniform float texZoom;


float edge(float u, float length, float threshold) {
  return (u < threshold) ? (1.0 - u / threshold) : max(0.0, (u - length + threshold) / threshold);
}

void main(void)
{
    vec2 crd = vTexCoord * size;
    float e = edge(crd.y, size.y, 4.0);
    vec4 samp = texture2D(tex0, vTexCoord);
    float lev = smoothstep(0.0, 1.0, max(0.0, samp.r - e));
    float peak = texture2D(tex0, vTexCoord + vec2(0.17, 0.31)).r;
    float crush = smoothstep(0.35, 0.65, lev) * step(0.3, peak);
    vec3 ink = mix(strokeColor, vec3(0.0), crush);
    float amt = mix(lev, 1.0, crush);
    gl_FragColor = vec4(ink, 1.0) * amt;
}`;


