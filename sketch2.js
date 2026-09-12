/**
 * Asemic Vein — 沿 asemic 橢圓弧跑 MixVein.paint；鉛筆描變形／線斷後的折線
 * 新種子／Space 重抽 · S 存 PNG · U 面板
 */
"use strict";

const ASE_W = 1000;
const ASE_H = 1000;
const ASE_ROW = 100;
const ASE_STEP = 15;
const ASE_TOP = 100;
const ASE_SIDE =50;
const ASE_PAPER = [246, 236, 214];
const ASE_PD = 2;
const ASE_LS_KEY = "vein-asemic-op-v1";

const ASE_LAB = Object.assign({}, MixVein.DEFAULTS, {
  randPath: false,
  pencil: false,
  pencilDens: 3,
  live: true,
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

function aseClamp(n, lo, hi, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
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
  if (o.leafSw != null) ASE_LAB.leafSw = aseClamp(o.leafSw, 0.5, 12, 1);
  if (o.lineSw != null) ASE_LAB.lineSw = aseClamp(o.lineSw, 0.5, 12, 1);
  if (o.pencilDens != null) ASE_LAB.pencilDens = aseClamp(o.pencilDens, 3, 6, 3);
  if (typeof o.showPath === "boolean") ASE_LAB.showPath = o.showPath;
  if (typeof o.randPath === "boolean") ASE_LAB.randPath = o.randPath;
  if (typeof o.pencil === "boolean") ASE_LAB.pencil = o.pencil;
  if (typeof o.live === "boolean") ASE_LAB.live = o.live;
  return true;
}

function aseRandStep(lo, hi, step) {
  const n = Math.round((hi - lo) / step);
  const v = lo + Math.floor(random() * (n + 1)) * step;
  return +v.toFixed(step >= 1 ? 0 : 2);
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
    pencilDens: ASE_LAB.pencilDens,
    showPath: !!ASE_LAB.showPath,
    salt: salt || 0,
  };
}

/** 開「每條不同參數」時，此路徑另抽一套滑桿範圍，不改面板數值。 */
function asePathOpts(salt) {
  const o = aseLabOpts(salt);
  if (!ASE_LAB.randPath) return o;
  o.leafShare = aseRandStep(0, 1, 0.01);
  o.gapFill = aseRandStep(2, 60, 1);
  o.leafLen = aseRandStep(0.05, 5, 0.05);
  o.leafWid = aseRandStep(1, 3, 0.05);
  o.leafDens = aseRandStep(1, 2, 0.05);
  o.leafSw = aseRandStep(0.5, 12, 0.05);
  o.lineSw = aseRandStep(0.5, 12, 0.05);
  o.leafVein = aseRandStep(0, 1, 0.01);
  o.leafTri = aseRandStep(0, 1, 0.01);
  o.leafOff = aseRandStep(-1, 1, 0.01);
  o.leafPad = aseRandStep(0, 1, 0.01);
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
    pencilDens: +Number(ASE_LAB.pencilDens).toFixed(2),
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
  set("lab-pencil-dens", ASE_LAB.pencilDens);
  setText("lab-pencil-dens-v", Number(ASE_LAB.pencilDens).toFixed(2));
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
  const liveEl = document.getElementById("lab-live");
  if (liveEl) liveEl.checked = ASE_LAB.live !== false;
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
          pencilDens: +Number(ASE_LAB.pencilDens).toFixed(2),
          live: ASE_LAB.live !== false,
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
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
}

/** 橢圓弧抽點，給 MixVein.paint 當開放路徑。 */
function aseArcPts(x, y, w, h, startDeg, stopDeg) {
  let a0 = Number(startDeg);
  let a1 = Number(stopDeg);
  const ww = Number(w);
  const hh = Number(h);
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return [];
  if (!Number.isFinite(ww) || !Number.isFinite(hh) || ww < 1 || hh < 1) {
    return [];
  }
  if (Math.abs((((a1 - a0) % 360) + 360) % 360) < 0.5) return [];
  while (a1 < a0) a1 += 360;
  const rx = ww * 0.5;
  const ry = hh * 0.5;
  const sweep = ((a1 - a0) * Math.PI) / 180;
  const approx = 0.5 * (rx + ry) * sweep;
  if (approx < 8) return [];
  const n = Math.max(10, Math.ceil(approx / 3.5));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push({ x: x + rx * Math.cos(a), y: y + ry * Math.sin(a) });
  }
  return pts;
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

function drawStroke(pts, width, tex, color, dens) {
  if (!pts || pts.length < 2) return;
  const sides = [[], []];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    length += pts[i].dist(pts[i + 1]);
  }
  if (!(length > 0.5)) return;
  const half = width * 0.5;
  pts.forEach((p, i) => {
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
    Number.isFinite(Number(dens)) ? Number(dens) : ASE_LAB.pencilDens,
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
    const v = i / last;
    strokePg.vertex(sides[0][i].x, sides[0][i].y, 0, v);
    strokePg.vertex(sides[1][i].x, sides[1][i].y, 1, v);
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

function aseMakeArc(x, y, mySize1, mySize2) {
  const ang1 = random([90, 270, 360, 180]);
  const ang2 = random([270, 90, 180, 360]);
  return aseArcPts(x, y, mySize1, mySize2, ang1, ang2);
}

/** 先抽完全部弧點，兩種畫法共用同一批路徑。 */
function aseCollectPaths() {
  const paths = [];
  const inner = Math.max(0, width - ASE_SIDE * 2);
  const n = Math.floor(inner / ASE_STEP);
  let row = 0;
  for (let yy = ASE_TOP; yy < height - ASE_SIDE; yy += ASE_ROW) {
    for (let i = 0; i < n; i++) {
      const pts = aseMakeArc(
        ASE_SIDE + ASE_STEP * i,
        yy,
        random(1, 90),
        random(1, 90)
      );
      if (pts.length >= 2) {
        paths.push({
          pts,
          salt: row * 17.3 + i * 0.41,
        });
      }
    }
    row++;
  }
  return paths;
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

function aseMarkAccent(strokes) {
  if (!strokes || !strokes.length) return;
  for (let i = 0; i < strokes.length; i++) strokes[i].accent = false;
  const k = Math.max(1, Math.round(strokes.length * 0.1));
  const idx = [];
  for (let i = 0; i < strokes.length; i++) idx.push(i);
  let s = (aseSeed >>> 0) ^ 0x9e3779b9;
  const rnd = function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  for (let i = 0; i < k; i++) {
    const st = strokes[idx[i]];
    st.accent = true;
    st.pts = aseScalePts(st.pts, 2);
  }}

function aseInkColor(stroke) {
  return stroke && stroke.accent ? color(196, 28, 28) : color(0);
}

function asePaintPencilPath(stroke) {
  const pts = stroke && stroke.pts ? stroke.pts : stroke;
  if (!pts || pts.length < 2) return;
  const glPts = [];
  for (let i = 0; i < pts.length; i++) {
    glPts.push(aseToGl(pts[i]));
  }
  const sw = Number(stroke && stroke.sw);
  const w = Number.isFinite(sw) ? Math.max(0.45, sw) : 2.4;
  const dens = Number(stroke && stroke.dens);
  const ink = aseInkColor(stroke);
  drawStroke(glPts, w, img, ink, dens);
  drawStroke(glPts, Math.max(0.35, w * 0.55), img, ink, dens);
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
    strokeWeight(Number.isFinite(sw) ? Math.max(0.45, sw) : 1.15);
    MixVein.strokeOpen(st.pts);
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
    MixVein.strokeOpen(paths[i].pts);
  }
  pop();
}

function aseDrawCaption() {
  noStroke();
  fill(40, 120);
  textAlign(LEFT, TOP);
  textSize(11);
  text(
    "asemic · 線／葉 " +
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
      (ASE_LAB.pencil
        ? " · 鉛筆 · 質感 " + Number(ASE_LAB.pencilDens).toFixed(2)
        : "") +
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
}

function asePaint() {
  const paths = aseCollectPaths();
  const wantPencil = !!ASE_LAB.pencil;
  const strokes = [];
  for (let i = 0; i < paths.length; i++) {
    const opts = Object.assign(asePathOpts(paths[i].salt), { showPath: false });
    const bits = MixVein.collect(
      { pts: paths[i].pts, closed: false },
      opts
    );
    const dens = constrain(Number(ASE_LAB.pencilDens), 3, 6);
    for (let j = 0; j < bits.length; j++) {
      bits[j].dens = dens;
      strokes.push(bits[j]);
    }
  }
  aseMarkAccent(strokes);
  asePencilReady = wantPencil && aseBeginPencil();
  if (!asePencilReady) {
    asePaintInkStrokes(strokes);
  } else {
    for (let i = 0; i < strokes.length; i++) {
      asePaintPencilPath(strokes[i]);
    }
    aseEndPencil();
  }
  aseBake = get();
  aseBakePaths = paths;
  aseDrawPathGuides(paths);
  aseDrawCaption();
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
  aseBindRange("lab-leaf-sw", "lab-leaf-sw-v", "leafSw", 0.5, 12, 2);
  aseBindRange("lab-line-sw", "lab-line-sw-v", "lineSw", 0.5, 12, 2);
  aseBindRange("lab-pencil-dens", "lab-pencil-dens-v", "pencilDens", 3, 6, 2);
  aseBindRange("lab-leaf-tri", null, "leafTri", 0, 1, 2);
  aseBindRange("lab-leaf-vein", null, "leafVein", 0, 1, 2);
  aseBindRange("lab-leaf-off", "lab-leaf-off-v", "leafOff", -1, 1, 2);
  aseBindRange("lab-leaf-pad", null, "leafPad", 0, 1, 2);

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

  const pencilEl = document.getElementById("lab-pencil");
  if (pencilEl) {
    pencilEl.checked = !!ASE_LAB.pencil;
    pencilEl.addEventListener("change", () => {
      ASE_LAB.pencil = !!pencilEl.checked;
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
  v = clamp((v - 0.18) * 2.7, 0.0, 1.0);
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
    // 密度＝沿線顆粒像素：3 ≈ 2.5px，6 ≈ 1.2px
    float gpx = 8.0 * pow(1.0 / max(texZoom, 3.0), 1.05);
    vec2 uv = crd / max(gpx * 164.0, 0.001);
    vec4 samp = texture2D(tex0, uv);
    float g = (samp.r - 0.06) * 1.85;
    float lev = smoothstep(0.0, 0.48, max(0.0, g - e));
    lev = pow(clamp(lev, 0.0, 1.0), 0.55);
    vec4 color = vec4(strokeColor, 1.0) * lev;
    gl_FragColor = color;
}`;


