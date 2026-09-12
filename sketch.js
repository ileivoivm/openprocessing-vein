/**
 * Vein Leaves — OpenProcessing 案例
 * 畫法在 mix-vein.js（MixVein.paint）。本檔：五欄造型、手繪、滑桿。
 * Space 清空 · 拖曳畫線（放開鎖定）· 亂數效果＝每筆重抽滑桿 · S 存 PNG · U 面板
 */
"use strict";

const VEIN_PAGE_W = 1280;
const VEIN_PAGE_H = 760;
const VEIN_KINDS = ["square", "circle", "triangle", "irregular", "line"];
const VEIN_LABELS = {
  square: "正方形",
  circle: "圓形",
  triangle: "三角形",
  irregular: "不規則形",
  line: "直線",
};

const VEIN_LAB = Object.assign({}, MixVein.DEFAULTS, {
  showShapes: true,
  randFx: false,
});

const VEIN_LS_KEY = "vein-leaves-op-v1";

let veinSeed = 1;
/** @type {{pts:{x:number,y:number}[], closed:boolean}[]} */
let veinDrawn = [];
/** @type {{x:number,y:number}[] | null} */
let veinLive = null;

function veinClamp(n, lo, hi, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

function veinRandStep(lo, hi, step) {
  const n = Math.round((hi - lo) / step);
  const v = lo + Math.floor(Math.random() * (n + 1)) * step;
  return +v.toFixed(step >= 1 ? 0 : 2);
}

/** 重抽全部造型滑桿（不改顯示開關）。用 Math.random，不碰筆畫亂數。 */
function veinRandomizeSliders() {
  VEIN_LAB.leafShare = veinRandStep(0, 1, 0.01);
  VEIN_LAB.gapFill = veinRandStep(2, 60, 1);
  VEIN_LAB.leafLen = veinRandStep(0.05, 5, 0.05);
  VEIN_LAB.leafWid = veinRandStep(1, 3, 0.05);
  VEIN_LAB.leafDens = veinRandStep(1, 2, 0.05);
  VEIN_LAB.leafSw = veinRandStep(1, 4, 0.05);
  VEIN_LAB.lineSw = veinRandStep(1, 4, 0.05);
  VEIN_LAB.leafVein = veinRandStep(0, 1, 0.01);
  VEIN_LAB.leafTri = veinRandStep(0, 1, 0.01);
  VEIN_LAB.leafOff = veinRandStep(-1, 1, 0.01);
  VEIN_LAB.leafPad = veinRandStep(0, 1, 0.01);
  veinSyncSlidersFromLab();
}

function veinApplyPreset(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (o.leafShare != null) {
    VEIN_LAB.leafShare = veinClamp(o.leafShare, 0, 1, 0.5);
  }
  if (o.gapFill != null) VEIN_LAB.gapFill = veinClamp(o.gapFill, 2, 60, 30);
  if (o.leafLen != null) VEIN_LAB.leafLen = veinClamp(o.leafLen, 0.05, 5, 1);
  if (o.leafWid != null) VEIN_LAB.leafWid = veinClamp(o.leafWid, 1, 3, 1);
  if (o.leafVein != null) VEIN_LAB.leafVein = veinClamp(o.leafVein, 0, 1, 0);
  if (o.leafTri != null) VEIN_LAB.leafTri = veinClamp(o.leafTri, 0, 1, 0);
  if (o.leafPad != null) VEIN_LAB.leafPad = veinClamp(o.leafPad, 0, 1, 1);
  if (o.leafDens != null) VEIN_LAB.leafDens = veinClamp(o.leafDens, 1, 2, 1);
  if (o.leafOff != null) VEIN_LAB.leafOff = veinClamp(o.leafOff, -1, 1, 0);
  if (o.leafSw != null) VEIN_LAB.leafSw = veinClamp(o.leafSw, 1, 4, 1);
  if (o.lineSw != null) VEIN_LAB.lineSw = veinClamp(o.lineSw, 1, 4, 1);
  if (typeof o.showPath === "boolean") VEIN_LAB.showPath = o.showPath;
  if (typeof o.randFx === "boolean") VEIN_LAB.randFx = o.randFx;
  return true;
}

function veinSyncSlidersFromLab() {
  const shareEl = document.getElementById("lab-leaf-share");
  const shareV = document.getElementById("lab-leaf-share-v");
  const shareLine = document.getElementById("lab-share-line");
  const shareLeaf = document.getElementById("lab-share-leaf");
  if (shareEl) shareEl.value = String(VEIN_LAB.leafShare);
  if (shareV) shareV.textContent = Number(VEIN_LAB.leafShare).toFixed(2);
  if (shareLine) {
    shareLine.textContent =
      Math.round((1 - VEIN_LAB.leafShare) * 100) + "%";
  }
  if (shareLeaf) {
    shareLeaf.textContent = Math.round(VEIN_LAB.leafShare * 100) + "%";
  }
  const gapEl = document.getElementById("lab-gap-fill");
  const gapV = document.getElementById("lab-gap-fill-v");
  if (gapEl) gapEl.value = String(VEIN_LAB.gapFill);
  if (gapV) gapV.textContent = String(Math.round(VEIN_LAB.gapFill));
  const lenEl = document.getElementById("lab-leaf-len");
  const lenV = document.getElementById("lab-leaf-len-v");
  if (lenEl) lenEl.value = String(VEIN_LAB.leafLen);
  if (lenV) lenV.textContent = Number(VEIN_LAB.leafLen).toFixed(2);
  const widEl = document.getElementById("lab-leaf-wid");
  const widV = document.getElementById("lab-leaf-wid-v");
  if (widEl) widEl.value = String(VEIN_LAB.leafWid);
  if (widV) widV.textContent = Number(VEIN_LAB.leafWid).toFixed(2);
  const densEl = document.getElementById("lab-leaf-dens");
  const densV = document.getElementById("lab-leaf-dens-v");
  if (densEl) densEl.value = String(VEIN_LAB.leafDens);
  if (densV) densV.textContent = Number(VEIN_LAB.leafDens).toFixed(2);
  const swEl = document.getElementById("lab-leaf-sw");
  const swV = document.getElementById("lab-leaf-sw-v");
  if (swEl) swEl.value = String(VEIN_LAB.leafSw);
  if (swV) swV.textContent = Number(VEIN_LAB.leafSw).toFixed(2);
  const lineSwEl = document.getElementById("lab-line-sw");
  const lineSwV = document.getElementById("lab-line-sw-v");
  if (lineSwEl) lineSwEl.value = String(VEIN_LAB.lineSw);
  if (lineSwV) lineSwV.textContent = Number(VEIN_LAB.lineSw).toFixed(2);
  const veinEl = document.getElementById("lab-leaf-vein");
  if (veinEl) veinEl.value = String(VEIN_LAB.leafVein);
  const triEl = document.getElementById("lab-leaf-tri");
  if (triEl) triEl.value = String(VEIN_LAB.leafTri);
  const offEl = document.getElementById("lab-leaf-off");
  const offV = document.getElementById("lab-leaf-off-v");
  if (offEl) offEl.value = String(VEIN_LAB.leafOff);
  if (offV) offV.textContent = Number(VEIN_LAB.leafOff).toFixed(2);
  const padEl = document.getElementById("lab-leaf-pad");
  if (padEl) padEl.value = String(VEIN_LAB.leafPad);
  const pathEl = document.getElementById("lab-path");
  if (pathEl) pathEl.checked = !!VEIN_LAB.showPath;
  const randEl = document.getElementById("lab-rand-fx");
  if (randEl) randEl.checked = !!VEIN_LAB.randFx;
}

function veinPresetObject() {
  return {
    v: 1,
    leafShare: +Number(VEIN_LAB.leafShare).toFixed(2),
    gapFill: Math.round(VEIN_LAB.gapFill),
    leafLen: +Number(VEIN_LAB.leafLen).toFixed(2),
    leafWid: +Number(VEIN_LAB.leafWid).toFixed(2),
    leafVein: +Number(VEIN_LAB.leafVein).toFixed(2),
    leafTri: +Number(VEIN_LAB.leafTri).toFixed(2),
    leafPad: +Number(VEIN_LAB.leafPad).toFixed(2),
    leafDens: +Number(VEIN_LAB.leafDens).toFixed(2),
    leafOff: +Number(VEIN_LAB.leafOff).toFixed(2),
    leafSw: +Number(VEIN_LAB.leafSw).toFixed(2),
    lineSw: +Number(VEIN_LAB.lineSw).toFixed(2),
  };
}

function veinCopyFallback(text, done, fail) {
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

function veinCopyPreset() {
  const text = JSON.stringify(veinPresetObject(), null, 2) + "\n";
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
      veinCopyFallback(text, done, fail);
    });
    return;
  }
  veinCopyFallback(text, done, fail);
}

function veinFlashLoadBtn(btn, ok) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = ok ? "已載入" : "失敗";
  setTimeout(function () {
    btn.textContent = prev;
  }, 1200);
}

function veinLoadPresetJsonText(text, btn) {
  try {
    const o = JSON.parse(text);
    if (!veinApplyPreset(o)) throw new Error("bad");
    veinSyncSlidersFromLab();
    veinSaveLs();
    redraw();
    veinFlashLoadBtn(btn, true);
  } catch (_) {
    veinFlashLoadBtn(btn, false);
  }
}

function veinLabOpts(salt) {
  return {
    leafShare: VEIN_LAB.leafShare,
    gapFill: VEIN_LAB.gapFill,
    leafLen: VEIN_LAB.leafLen,
    leafWid: VEIN_LAB.leafWid,
    leafVein: VEIN_LAB.leafVein,
    leafTri: VEIN_LAB.leafTri,
    leafPad: VEIN_LAB.leafPad,
    leafDens: VEIN_LAB.leafDens,
    leafOff: VEIN_LAB.leafOff,
    leafSw: VEIN_LAB.leafSw,
    lineSw: VEIN_LAB.lineSw,
    showPath: !!VEIN_LAB.showPath,
    salt: salt || 0,
  };
}

function veinSnapshotStrokeOpts(index) {
  const o = veinLabOpts(9.1 + index * 1.37);
  delete o.showPath;
  return o;
}

function veinSanitizeStrokeOpts(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return veinSnapshotStrokeOpts(index);
  }
  const saltN = Number(raw.salt);
  return {
    leafShare: veinClamp(raw.leafShare, 0, 1, VEIN_LAB.leafShare),
    gapFill: veinClamp(raw.gapFill, 2, 60, VEIN_LAB.gapFill),
    leafLen: veinClamp(raw.leafLen, 0.05, 5, VEIN_LAB.leafLen),
    leafWid: veinClamp(raw.leafWid, 1, 3, VEIN_LAB.leafWid),
    leafVein: veinClamp(raw.leafVein, 0, 1, VEIN_LAB.leafVein),
    leafTri: veinClamp(raw.leafTri, 0, 1, VEIN_LAB.leafTri || 0),
    leafPad: veinClamp(raw.leafPad, 0, 1, VEIN_LAB.leafPad),
    leafDens: veinClamp(raw.leafDens, 1, 2, VEIN_LAB.leafDens),
    leafOff: veinClamp(raw.leafOff, -1, 1, VEIN_LAB.leafOff),
    leafSw: veinClamp(raw.leafSw, 1, 4, VEIN_LAB.leafSw),
    lineSw: veinClamp(raw.lineSw, 1, 4, VEIN_LAB.lineSw || 1),
    salt: Number.isFinite(saltN) ? saltN : 9.1 + index * 1.37,
  };
}

function veinMakeDrawnStroke(pts) {
  const index = veinDrawn.length;
  const paintSeed =
    (Math.imul(veinSeed || 1, 4099) + (index + 1) * 10007) >>> 0 || 1;
  return {
    pts,
    closed: false,
    paintSeed,
    opts: veinSnapshotStrokeOpts(index),
  };
}

function veinPaintDrawnStroke(stroke) {
  if (!stroke || !stroke.pts) return;
  const opts = Object.assign({}, stroke.opts || veinSnapshotStrokeOpts(0), {
    showPath: !!VEIN_LAB.showPath,
  });
  if (stroke.paintSeed != null) {
    randomSeed(stroke.paintSeed);
    noiseSeed(stroke.paintSeed);
  }
  MixVein.paint({ pts: stroke.pts, closed: false }, opts);
}

function veinSerializeDrawn() {
  const out = [];
  for (let i = 0; i < veinDrawn.length; i++) {
    const item = veinDrawn[i];
    const pts = MixVein.cleanPts(item && item.pts);
    if (pts.length < 2) continue;
    const rec = {
      closed: false,
      pts: pts.map((p) => [
        Math.round(p.x * 100) / 100,
        Math.round(p.y * 100) / 100,
      ]),
    };
    if (item.paintSeed != null) rec.paintSeed = item.paintSeed;
    if (item.opts) rec.opts = item.opts;
    out.push(rec);
  }
  return out;
}

function veinSaveLs() {
  try {
    localStorage.setItem(
      VEIN_LS_KEY,
      JSON.stringify({
        v: 4,
        leafShare: VEIN_LAB.leafShare,
        gapFill: VEIN_LAB.gapFill,
        leafLen: VEIN_LAB.leafLen,
        leafWid: VEIN_LAB.leafWid,
        leafVein: VEIN_LAB.leafVein,
        leafTri: VEIN_LAB.leafTri,
        leafPad: VEIN_LAB.leafPad,
        leafDens: VEIN_LAB.leafDens,
        leafOff: VEIN_LAB.leafOff,
        leafSw: VEIN_LAB.leafSw,
        lineSw: VEIN_LAB.lineSw,
        showPath: !!VEIN_LAB.showPath,
        showShapes: !!VEIN_LAB.showShapes,
        randFx: !!VEIN_LAB.randFx,
        drawn: veinSerializeDrawn(),
      })
    );
  } catch (_) {}
}

function veinSanitizeDrawn(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const src = Array.isArray(item) ? item : item && item.pts;
    const pts = MixVein.cleanPts(src);
    if (pts.length < 2) continue;
    const seedN = Number(item && item.paintSeed);
    out.push({
      pts,
      closed: false,
      paintSeed: Number.isFinite(seedN)
        ? seedN >>> 0 || 1
        : ((i + 1) * 10007) >>> 0 || 1,
      opts: veinSanitizeStrokeOpts(item && item.opts, i),
    });
  }
  return out;
}

function veinLoadLs() {
  try {
    const raw = localStorage.getItem(VEIN_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return;
    veinApplyPreset(o);
    if (typeof o.showShapes === "boolean") VEIN_LAB.showShapes = o.showShapes;
    if (typeof o.randFx === "boolean") VEIN_LAB.randFx = o.randFx;
    if (Array.isArray(o.drawn)) veinDrawn = veinSanitizeDrawn(o.drawn);
  } catch (_) {}
}

function veinParseUrlSeed() {
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

function veinWriteUrlSeed(s) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(s));
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch (_) {}
}

function veinClearPaths() {
  veinDrawn = [];
  veinLive = null;
  veinSaveLs();
}

function veinNewSeed(explicit) {
  if (explicit != null && Number.isFinite(explicit)) {
    veinSeed = explicit >>> 0;
    if (veinSeed === 0) veinSeed = 1;
  } else {
    veinSeed = (Math.floor(Math.random() * 1e9) % 2147483646) + 1;
  }
  veinWriteUrlSeed(veinSeed);
  randomSeed(veinSeed);
  noiseSeed(veinSeed);
}

function veinOutline(kind, cx, cy, rad) {
  if (kind === "square") {
    const h = rad;
    return {
      closed: true,
      pts: [
        { x: cx - h, y: cy - h },
        { x: cx + h, y: cy - h },
        { x: cx + h, y: cy + h },
        { x: cx - h, y: cy + h },
      ],
    };
  }
  if (kind === "circle") {
    const pts = [];
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360;
      pts.push({
        x: cx + rad * Math.cos((a * Math.PI) / 180),
        y: cy + rad * Math.sin((a * Math.PI) / 180),
      });
    }
    return { closed: true, pts };
  }
  if (kind === "triangle") {
    return {
      closed: true,
      pts: [
        { x: cx, y: cy - rad },
        { x: cx + rad * 0.92, y: cy + rad * 0.78 },
        { x: cx - rad * 0.92, y: cy + rad * 0.78 },
      ],
    };
  }
  if (kind === "line") {
    return {
      closed: false,
      pts: [
        { x: cx, y: cy + rad },
        { x: cx, y: cy - rad },
      ],
    };
  }
  const pts = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    const wob =
      0.72 +
      0.4 *
        noise(
          Math.cos((a * Math.PI) / 180) * 2.2 + 3.1,
          Math.sin((a * Math.PI) / 180) * 2.2
        );
    const rr = rad * wob;
    pts.push({
      x: cx + rr * Math.cos((a * Math.PI) / 180),
      y: cy + rr * Math.sin((a * Math.PI) / 180),
    });
  }
  return { closed: true, pts };
}

function veinPaint() {
  background(196);
  const padX = 36;
  const top = 52;
  const labelH = 36;
  const colW = (width - padX * 2) / VEIN_KINDS.length;
  const boxH = height - top - labelH - 24;
  const rad = Math.min(colW, boxH) * 0.38;

  if (VEIN_LAB.showShapes) {
    for (let i = 0; i < VEIN_KINDS.length; i++) {
      const kind = VEIN_KINDS[i];
      const cx = padX + colW * (i + 0.5);
      const cy = top + boxH * 0.5;
      MixVein.paint(veinOutline(kind, cx, cy, rad), veinLabOpts(i * 2.17 + 0.6));
      noStroke();
      fill(40, 140);
      textAlign(CENTER, TOP);
      textSize(13);
      text(VEIN_LABELS[kind], cx, top + boxH + 8);
    }
  }

  for (let i = 0; i < veinDrawn.length; i++) {
    veinPaintDrawnStroke(veinDrawn[i]);
  }
  randomSeed(veinSeed);
  noiseSeed(veinSeed);

  if (veinLive && veinLive.length > 1) {
    noFill();
    strokeCap(ROUND);
    strokeJoin(ROUND);
    if (VEIN_LAB.showPath) {
      stroke(220, 40, 40, 200);
      strokeWeight(2.2);
    } else {
      stroke(40, 80);
      strokeWeight(1.2);
    }
    MixVein.strokeOpen(veinLive);
  }

  noStroke();
  fill(40, 120);
  textAlign(LEFT, TOP);
  textSize(11);
  text(
    "線／葉 " +
      VEIN_LAB.leafShare.toFixed(2) +
      " · 葉長 " +
      VEIN_LAB.leafLen.toFixed(2) +
      " · 葉寬 " +
      VEIN_LAB.leafWid.toFixed(2) +
      " · 緣／脈 " +
      VEIN_LAB.leafVein.toFixed(2) +
      " · 曲線／三角 " +
      VEIN_LAB.leafTri.toFixed(2) +
      " · 葉子線寬 " +
      VEIN_LAB.leafSw.toFixed(2) +
      " · 直線線寬 " +
      VEIN_LAB.lineSw.toFixed(2) +
      " · 離徑 " +
      VEIN_LAB.leafOff.toFixed(2) +
      " · 缺口 " +
      Math.round(VEIN_LAB.gapFill) +
      " · seed " +
      veinSeed,
    18,
    14
  );
}

function wireVeinFloatUi() {
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
    const t = VEIN_LAB.leafShare;
    if (shareV) shareV.textContent = Number(t).toFixed(2);
    if (shareLine) shareLine.textContent = Math.round((1 - t) * 100) + "%";
    if (shareLeaf) shareLeaf.textContent = Math.round(t * 100) + "%";
  };
  if (shareEl) {
    shareEl.value = String(VEIN_LAB.leafShare);
    updateShareLabel();
    const apply = () => {
      VEIN_LAB.leafShare = Number(shareEl.value);
      updateShareLabel();
      veinSaveLs();
      redraw();
    };
    shareEl.addEventListener("input", apply);
    shareEl.addEventListener("change", apply);
  }

  const gapEl = document.getElementById("lab-gap-fill");
  const gapV = document.getElementById("lab-gap-fill-v");
  if (gapEl) {
    gapEl.value = String(VEIN_LAB.gapFill);
    if (gapV) gapV.textContent = String(Math.round(VEIN_LAB.gapFill));
    const applyGap = () => {
      VEIN_LAB.gapFill = constrain(Number(gapEl.value), 2, 60);
      if (gapV) gapV.textContent = String(Math.round(VEIN_LAB.gapFill));
      veinSaveLs();
      redraw();
    };
    gapEl.addEventListener("input", applyGap);
    gapEl.addEventListener("change", applyGap);
  }

  const lenEl = document.getElementById("lab-leaf-len");
  const lenV = document.getElementById("lab-leaf-len-v");
  if (lenEl) {
    lenEl.value = String(VEIN_LAB.leafLen);
    if (lenV) lenV.textContent = Number(VEIN_LAB.leafLen).toFixed(2);
    const applyLen = () => {
      VEIN_LAB.leafLen = constrain(Number(lenEl.value), 0.05, 5);
      if (lenV) lenV.textContent = Number(VEIN_LAB.leafLen).toFixed(2);
      veinSaveLs();
      redraw();
    };
    lenEl.addEventListener("input", applyLen);
    lenEl.addEventListener("change", applyLen);
  }

  const widEl = document.getElementById("lab-leaf-wid");
  const widV = document.getElementById("lab-leaf-wid-v");
  if (widEl) {
    widEl.value = String(VEIN_LAB.leafWid);
    if (widV) widV.textContent = Number(VEIN_LAB.leafWid).toFixed(2);
    const applyWid = () => {
      VEIN_LAB.leafWid = constrain(Number(widEl.value), 1, 3);
      if (widV) widV.textContent = Number(VEIN_LAB.leafWid).toFixed(2);
      veinSaveLs();
      redraw();
    };
    widEl.addEventListener("input", applyWid);
    widEl.addEventListener("change", applyWid);
  }

  const densEl = document.getElementById("lab-leaf-dens");
  const densV = document.getElementById("lab-leaf-dens-v");
  if (densEl) {
    densEl.value = String(VEIN_LAB.leafDens);
    if (densV) densV.textContent = Number(VEIN_LAB.leafDens).toFixed(2);
    const applyDens = () => {
      VEIN_LAB.leafDens = constrain(Number(densEl.value), 1, 2);
      if (densV) densV.textContent = Number(VEIN_LAB.leafDens).toFixed(2);
      veinSaveLs();
      redraw();
    };
    densEl.addEventListener("input", applyDens);
    densEl.addEventListener("change", applyDens);
  }

  const swEl = document.getElementById("lab-leaf-sw");
  const swV = document.getElementById("lab-leaf-sw-v");
  if (swEl) {
    swEl.value = String(VEIN_LAB.leafSw);
    if (swV) swV.textContent = Number(VEIN_LAB.leafSw).toFixed(2);
    const applySw = () => {
      VEIN_LAB.leafSw = constrain(Number(swEl.value), 1, 4);
      if (swV) swV.textContent = Number(VEIN_LAB.leafSw).toFixed(2);
      veinSaveLs();
      redraw();
    };
    swEl.addEventListener("input", applySw);
    swEl.addEventListener("change", applySw);
  }

  const lineSwEl = document.getElementById("lab-line-sw");
  const lineSwV = document.getElementById("lab-line-sw-v");
  if (lineSwEl) {
    lineSwEl.value = String(VEIN_LAB.lineSw);
    if (lineSwV) lineSwV.textContent = Number(VEIN_LAB.lineSw).toFixed(2);
    const applyLineSw = () => {
      VEIN_LAB.lineSw = constrain(Number(lineSwEl.value), 1, 4);
      if (lineSwV) lineSwV.textContent = Number(VEIN_LAB.lineSw).toFixed(2);
      veinSaveLs();
      redraw();
    };
    lineSwEl.addEventListener("input", applyLineSw);
    lineSwEl.addEventListener("change", applyLineSw);
  }

  const triEl = document.getElementById("lab-leaf-tri");
  if (triEl) {
    triEl.value = String(VEIN_LAB.leafTri);
    const applyTri = () => {
      VEIN_LAB.leafTri = constrain(Number(triEl.value), 0, 1);
      veinSaveLs();
      redraw();
    };
    triEl.addEventListener("input", applyTri);
    triEl.addEventListener("change", applyTri);
  }

  const veinEl = document.getElementById("lab-leaf-vein");
  if (veinEl) {
    veinEl.value = String(VEIN_LAB.leafVein);
    const applyVein = () => {
      VEIN_LAB.leafVein = constrain(Number(veinEl.value), 0, 1);
      veinSaveLs();
      redraw();
    };
    veinEl.addEventListener("input", applyVein);
    veinEl.addEventListener("change", applyVein);
  }

  const offEl = document.getElementById("lab-leaf-off");
  const offV = document.getElementById("lab-leaf-off-v");
  if (offEl) {
    offEl.value = String(VEIN_LAB.leafOff);
    if (offV) offV.textContent = Number(VEIN_LAB.leafOff).toFixed(2);
    const applyOff = () => {
      VEIN_LAB.leafOff = constrain(Number(offEl.value), -1, 1);
      if (offV) offV.textContent = Number(VEIN_LAB.leafOff).toFixed(2);
      veinSaveLs();
      redraw();
    };
    offEl.addEventListener("input", applyOff);
    offEl.addEventListener("change", applyOff);
  }

  const padEl = document.getElementById("lab-leaf-pad");
  if (padEl) {
    padEl.value = String(VEIN_LAB.leafPad);
    const applyPad = () => {
      VEIN_LAB.leafPad = constrain(Number(padEl.value), 0, 1);
      veinSaveLs();
      redraw();
    };
    padEl.addEventListener("input", applyPad);
    padEl.addEventListener("change", applyPad);
  }

  const pathEl = document.getElementById("lab-path");
  if (pathEl) {
    pathEl.checked = !!VEIN_LAB.showPath;
    pathEl.addEventListener("change", () => {
      VEIN_LAB.showPath = !!pathEl.checked;
      veinSaveLs();
      redraw();
    });
  }

  const shapesEl = document.getElementById("lab-shapes");
  if (shapesEl) {
    shapesEl.checked = !!VEIN_LAB.showShapes;
    shapesEl.addEventListener("change", () => {
      VEIN_LAB.showShapes = !!shapesEl.checked;
      veinSaveLs();
      redraw();
    });
  }

  const randEl = document.getElementById("lab-rand-fx");
  if (randEl) {
    randEl.checked = !!VEIN_LAB.randFx;
    randEl.addEventListener("change", () => {
      VEIN_LAB.randFx = !!randEl.checked;
      veinSaveLs();
    });
  }

  const seedBtn = document.getElementById("lab-reseed");
  if (seedBtn) {
    seedBtn.addEventListener("click", () => {
      veinNewSeed();
      redraw();
    });
  }

  const clearBtn = document.getElementById("lab-clear-paths");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      veinClearPaths();
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
        veinLoadPresetJsonText(String(reader.result || ""), loadBtn);
      };
      reader.onerror = () => veinFlashLoadBtn(loadBtn, false);
      reader.readAsText(file);
    });
  }

  const copyBtn = document.getElementById("lab-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      veinCopyPreset();
    });
  }

  veinSyncSlidersFromLab();
}

function setup() {
  createCanvas(VEIN_PAGE_W, VEIN_PAGE_H);
  angleMode(DEGREES);
  pixelDensity(2);
  noLoop();
  textFont("Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif");
  veinLoadLs();
  wireVeinFloatUi();
  const urlSeed = veinParseUrlSeed();
  veinNewSeed(urlSeed != null ? urlSeed : undefined);
  redraw();
}

function draw() {
  randomSeed(veinSeed);
  noiseSeed(veinSeed);
  veinPaint();
}

function veinOnCanvas(ev) {
  const t = ev && ev.target;
  if (t && String(t.tagName).toUpperCase() !== "CANVAS") return false;
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function veinTryPushLive(x, y, minDist) {
  if (!veinLive) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const last = veinLive[veinLive.length - 1];
  const dLast = Math.hypot(x - last.x, y - last.y);
  if (dLast < minDist) return false;
  const first = veinLive[0];
  const dFirst = Math.hypot(x - first.x, y - first.y);
  if (veinLive.length >= 2 && dFirst < 14 && dLast > 22) return false;
  veinLive.push({ x, y });
  return true;
}

function veinFinishStroke(appendPointer) {
  if (!veinLive) return;
  if (appendPointer) veinTryPushLive(mouseX, mouseY, 1);
  const pts = MixVein.cleanPts(veinLive);
  veinLive = null;
  if (pts.length < 2) return;
  veinDrawn.push(veinMakeDrawnStroke(pts));
  veinSaveLs();
}

function mousePressed(ev) {
  if (!veinOnCanvas(ev)) return;
  if (veinLive) veinFinishStroke(false);
  if (VEIN_LAB.randFx) {
    veinRandomizeSliders();
    veinSaveLs();
  }
  if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY)) return;
  veinLive = [{ x: mouseX, y: mouseY }];
  redraw();
  return false;
}

function mouseDragged(ev) {
  if (!veinLive) return;
  if (!veinOnCanvas(ev)) return;
  if (veinTryPushLive(mouseX, mouseY, 2.2)) redraw();
  return false;
}

function mouseReleased() {
  if (!veinLive) return;
  veinFinishStroke(true);
  redraw();
  return false;
}

function keyPressed() {
  if (key === "s" || key === "S") {
    saveCanvas("vein-demo-" + veinSeed, "png");
    return;
  }
  if (key === " " || keyCode === 32) {
    veinClearPaths();
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
