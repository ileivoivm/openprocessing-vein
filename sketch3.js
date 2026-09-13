/**
 * index3：造型改開關；開啟的 layout 各自舊線跑到新線
 */
"use strict";

const ASE3_LS_KEY = "vein-asemic-op-v3";
const ASE3_LAYOUTS = [
  ["lab-grid", "gridT"],
  ["lab-conc", "concT"],
  ["lab-bar", "barT"],
  ["lab-branch", "branchT"],
  ["lab-star", "starT"],
  ["lab-thread", "threadT"],
  ["lab-klee", "kleeT"],
];
const ASE3_HUD_TOGS = [
  ["gridT", "grid"],
  ["concT", "concentric"],
  ["barT", "barcode"],
  ["branchT", "branch"],
  ["starT", "stars"],
  ["threadT", "thread"],
  ["kleeT", "klee"],
];
const ASE3_MORPH_LO = 0.5;
const ASE3_MORPH_HI = 6;
const ASE3_MORPH_DEF = 2.2;

let ase3SeedA = 1;
let ase3SeedB = 2;
let ase3PackFrom = null;
let ase3PackTo = null;
let ase3PackPairs = null;
let ase3PackKey = "";
let ase3CycleStart = 0;
let ase3HoldReady = false;
let ase3HoldPaths = null;
let ase3Paused = false;
let ase3PauseAt = 0;
let ase3StyleByKey = {};

const ase3BaseNewSeed = aseNewSeed;
const ase3BaseCollect = aseCollectPaths;
const ase3BaseSync = aseSyncSliders;
const ase3BaseBind = aseBindRange;
const ase3BaseApply = aseApplyPreset;

function aseSaveLs() {
  try {
    localStorage.setItem(
      ASE3_LS_KEY,
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
          morphSec: ase3MorphSec(),
        })
      )
    );
  } catch (_) {}
}

aseApplyPreset = function (o) {
  const ok = ase3BaseApply(o);
  if (o && o.morphSec != null) {
    ASE_LAB.morphSec = aseClamp(o.morphSec, ASE3_MORPH_LO, ASE3_MORPH_HI, ASE3_MORPH_DEF);
  }
  ase3SnapToggles();
  return ok;
};

function ase3MorphSec() {
  return aseClamp(ASE_LAB.morphSec, ASE3_MORPH_LO, ASE3_MORPH_HI, ASE3_MORPH_DEF);
}

function ase3MorphMs() {
  return ase3MorphSec() * 1000;
}

function aseLoadLs() {
  try {
    const raw = localStorage.getItem(ASE3_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return;
    aseApplyPreset(o);
  } catch (_) {}
}

aseBindRange = function (id, valId, key, lo, hi, digits) {
  if (
    id === "lab-grid" ||
    id === "lab-conc" ||
    id === "lab-bar" ||
    id === "lab-branch" ||
    id === "lab-star" ||
    id === "lab-thread" ||
    id === "lab-klee"
  ) {
    return;
  }
  return ase3BaseBind(id, valId, key, lo, hi, digits);
};

function ase3AnyLayout() {
  for (let i = 0; i < ASE3_LAYOUTS.length; i++) {
    if (ASE_LAB[ASE3_LAYOUTS[i][1]] > 0.5) return true;
  }
  return false;
}

function ase3SnapToggles() {
  for (let i = 0; i < ASE3_LAYOUTS.length; i++) {
    const key = ASE3_LAYOUTS[i][1];
    ASE_LAB[key] = ASE_LAB[key] > 0.5 ? 1 : 0;
  }
}

function ase3PauseClock() {
  if (ase3Paused) return;
  ase3Paused = true;
  ase3PauseAt = millis();
}

function ase3ResumeClock() {
  if (!ase3Paused) return;
  ase3CycleStart += millis() - ase3PauseAt;
  ase3Paused = false;
}

aseCollectPaths = function () {
  if (!ase3AnyLayout()) {
    if (ase3HoldPaths && ase3HoldPaths.length) return ase3HoldPaths;
    const pack = aseEnsureMorphCache();
    ase3HoldPaths = (pack && pack.threads) || [];
    return ase3HoldPaths;
  }
  const paths = ase3BaseCollect();
  if (paths && paths.length) ase3HoldPaths = paths;
  return paths;
};

function ase3SyncTogs() {
  for (let i = 0; i < ASE3_LAYOUTS.length; i++) {
    const el = document.getElementById(ASE3_LAYOUTS[i][0]);
    if (el) el.checked = ASE_LAB[ASE3_LAYOUTS[i][1]] > 0.5;
  }
}

aseSyncSliders = function () {
  ase3BaseSync();
  ase3SyncTogs();
  const el = document.getElementById("lab-morph-sec");
  if (el) el.value = String(ase3MorphSec());
  const v = document.getElementById("lab-morph-sec-v");
  if (v) v.textContent = ase3MorphSec().toFixed(2);
};

function ase3FlipLayout(key) {
  ASE_LAB[key] = ASE_LAB[key] > 0.5 ? 0 : 1;
  ase3SnapToggles();
  ase3SyncTogs();
  aseSaveLs();
  ase3HoldReady = false;
  if (ASE_LAB.live === false) redraw();
}

function ase3CollectPack(seed) {
  const hold = aseSeed;
  aseSeed = seed >>> 0 || 1;
  const run = (fn) => {
    randomSeed(aseSeed);
    noiseSeed(aseSeed);
    return fn();
  };
  const grid = run(aseCollectGridPaths);
  const conc = run(aseCollectConcentricPaths);
  const bars = run(aseCollectBarcodePaths);
  const branches = run(aseCollectBranchPaths);
  const stars = run(aseCollectStarPaths);
  const threads = run(aseCollectThreadPaths);
  const klees = run(aseCollectKleePaths);
  aseMarkLongLayout(grid);
  aseSeed = hold;
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  return { grid, conc, bars, branches, stars, threads, klees };
}

function ase3SyncPacks() {
  const key = [aseLayoutN(), ase3SeedA, ase3SeedB].join("|");
  if (ase3PackKey === key && ase3PackFrom && ase3PackTo) return;
  ase3PackKey = key;
  ase3PackFrom = ase3CollectPack(ase3SeedA);
  ase3PackTo = ase3CollectPack(ase3SeedB);
  ase3PackPairs = {
    grid: aseMatchTwo(ase3PackFrom.grid, ase3PackTo.grid),
    conc: aseMatchTwo(ase3PackFrom.conc, ase3PackTo.conc),
    bars: aseMatchTwo(ase3PackFrom.bars, ase3PackTo.bars),
    branches: aseMatchTwo(ase3PackFrom.branches, ase3PackTo.branches),
    stars: aseMatchTwo(ase3PackFrom.stars, ase3PackTo.stars),
    threads: aseMatchTwo(ase3PackFrom.threads, ase3PackTo.threads),
    klees: aseMatchTwo(ase3PackFrom.klees, ase3PackTo.klees),
  };
}

function ase3Blend() {
  const dt = millis() - ase3CycleStart;
  const u = aseClamp(dt / ase3MorphMs(), 0, 1, 0);
  return u * u * (3 - 2 * u);
}

function ase3PathKey(p) {
  if (!p || !p.pts || p.pts.length < 2) return "";
  const a = p.pts[0];
  const b = p.pts[p.pts.length - 1];
  const m = p.pts[p.pts.length >> 1];
  return [
    p.pts.length,
    a.x.toFixed(2),
    a.y.toFixed(2),
    m.x.toFixed(2),
    m.y.toFixed(2),
    b.x.toFixed(2),
    b.y.toFixed(2),
  ].join(":");
}

function ase3TakeStyleSalt(i, a, b) {
  const keyA = ase3PathKey(a);
  const keyB = ase3PathKey(b);
  let s = null;
  if (keyA && ase3StyleByKey[keyA] != null) s = ase3StyleByKey[keyA];
  else if (keyB && ase3StyleByKey[keyB] != null) s = ase3StyleByKey[keyB];
  else s = i + 1;
  if (keyA) ase3StyleByKey[keyA] = s;
  if (keyB) ase3StyleByKey[keyB] = s;
  return s;
}

function ase3CarryPath(path, salt) {
  return {
    pts: path.pts,
    closed: !!path.closed,
    salt,
    hub: path.hub,
    accent: !!path.accent,
    klee: !!path.klee,
  };
}

function ase3LerpLayout(fromList, toList, pairs, u) {
  const nonlinear = !!ASE_LAB.nonlinear;
  const out = [];
  for (let i = 0; i < pairs.length; i++) {
    const a = pairs[i].a;
    const b = pairs[i].b;
    const salt = ase3TakeStyleSalt(i, a, b);
    if (u <= 1e-6 && a) {
      out.push(ase3CarryPath(a, salt));
      continue;
    }
    if (u >= 1 - 1e-6 && b) {
      out.push(ase3CarryPath(b, salt));
      continue;
    }
    if (u <= 1e-6 && b) {
      out.push(ase3CarryPath(b, salt));
      continue;
    }
    if (u >= 1 - 1e-6 && a) {
      out.push(ase3CarryPath(a, salt));
      continue;
    }
    const hubA =
      a && a.hub && Number.isFinite(a.hub.x)
        ? a.hub
        : { x: ASE_W * 0.5, y: ASE_H * 0.5 };
    const hubB =
      b && b.hub && Number.isFinite(b.hub.x) ? b.hub : hubA;
    let pa = aseSampleSide(a, a && a.closed, hubA);
    let pb = aseSampleSide(b, b && b.closed, hubB);
    if (!pa || !pb) continue;
    const ref = a ? pa[0] : pb[0];
    if (b) pb = aseAlignPts(pb, !!b.closed, ref);
    const hub = {
      x: hubA.x + (hubB.x - hubA.x) * u,
      y: hubA.y + (hubB.y - hubA.y) * u,
    };
    const pts = [];
    for (let k = 0; k < ASE_MORPH_N; k++) {
      const qa = pa[k];
      const qb = pb[k];
      if (!nonlinear) {
        pts.push({
          x: qa.x + (qb.x - qa.x) * u,
          y: qa.y + (qb.y - qa.y) * u,
        });
        continue;
      }
      const dax = qa.x - hubA.x;
      const day = qa.y - hubA.y;
      const dbx = qb.x - hubB.x;
      const dby = qb.y - hubB.y;
      const ra = Math.hypot(dax, day);
      const rb = Math.hypot(dbx, dby);
      let aa = Math.atan2(day, dax);
      let ab = Math.atan2(dby, dbx);
      ab = aa + aseAngWrap(ab - aa);
      const rad = ra + (rb - ra) * u;
      const ang = aa + (ab - aa) * u;
      pts.push({
        x: hub.x + Math.cos(ang) * rad,
        y: hub.y + Math.sin(ang) * rad,
      });
    }
    out.push({
      pts,
      closed: !!(a && a.closed) || !!(b && b.closed),
      salt,
      hub,
      accent: !!(a && a.accent) || !!(b && b.accent),
      klee: !!(a && a.klee) || !!(b && b.klee),
    });
  }
  return out;
}

function ase3LerpPack() {
  ase3SyncPacks();
  const u = ase3Blend();
  return {
    grid: ase3LerpLayout(ase3PackFrom.grid, ase3PackTo.grid, ase3PackPairs.grid, u),
    conc: ase3LerpLayout(ase3PackFrom.conc, ase3PackTo.conc, ase3PackPairs.conc, u),
    bars: ase3LerpLayout(ase3PackFrom.bars, ase3PackTo.bars, ase3PackPairs.bars, u),
    branches: ase3LerpLayout(
      ase3PackFrom.branches,
      ase3PackTo.branches,
      ase3PackPairs.branches,
      u
    ),
    stars: ase3LerpLayout(ase3PackFrom.stars, ase3PackTo.stars, ase3PackPairs.stars, u),
    threads: ase3LerpLayout(
      ase3PackFrom.threads,
      ase3PackTo.threads,
      ase3PackPairs.threads,
      u
    ),
    klees: ase3LerpLayout(ase3PackFrom.klees, ase3PackTo.klees, ase3PackPairs.klees, u),
  };
}

aseEnsureMorphCache = function () {
  const lerp = ase3LerpPack();
  const pack = {
    key: "ase3|" + ase3PackKey + "|" + ase3Blend().toFixed(4),
    grid: lerp.grid,
    conc: lerp.conc,
    bars: lerp.bars,
    branches: lerp.branches,
    stars: lerp.stars,
    threads: lerp.threads,
    klees: lerp.klees,
  };
  pack.bundles = aseMatchBundles(
    pack.grid,
    pack.conc,
    pack.bars,
    pack.branches,
    pack.stars,
    pack.threads,
    pack.klees
  );
  aseStampBundleSalts(pack.bundles);
  return pack;
};

aseNewSeed = function (explicit) {
  ase3BaseNewSeed(explicit);
  ase3SeedA = aseSeed;
  ase3SeedB = aseHashSeed(aseSeed, 91.7) || (aseSeed + 1);
  ase3PackKey = "";
  ase3StyleByKey = {};
  ase3CycleStart = millis();
  ase3HoldReady = false;
  ase3SyncPacks();
};

function ase3Tick() {
  if (!ase3AnyLayout()) {
    ase3PauseClock();
    return;
  }
  ase3ResumeClock();
  if (millis() - ase3CycleStart < ase3MorphMs()) return;
  ase3SeedA = ase3SeedB;
  ase3SeedB = aseHashSeed(ase3SeedB, 17.31 + (millis() % 100000)) || ase3SeedB + 1;
  if (ase3SeedB === ase3SeedA) ase3SeedB = (ase3SeedB + 97) >>> 0 || 2;
  ase3PackKey = "";
  ase3CycleStart = millis();
  ase3HoldReady = false;
  ase3SyncPacks();
}

function ase3HudBand() {
  let safeW = ASE_W;
  const panel = typeof document !== "undefined" && document.getElementById("pen-float");
  const canvas = typeof document !== "undefined" && document.querySelector("canvas");
  if (panel && canvas && !panel.classList.contains("collapsed") && canvas.getBoundingClientRect) {
    const cr = canvas.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    if (cr.width > 1) {
      const vis = (pr.left - cr.left) * (ASE_W / cr.width);
      if (vis > 280) safeW = Math.min(ASE_W, vis);
    }
  }
  const pad = 18;
  return { x: pad, w: Math.max(260, safeW - pad * 2) };
}

aseHudGeom = function () {
  const band = ase3HudBand();
  const labelW = 88;
  const labelGap = 12;
  const rowH = 42;
  const countY = ASE_H - 40 - rowH;
  const morphY = countY - rowH;
  const trackX = band.x + labelW + labelGap;
  const trackW = Math.max(80, band.w - labelW - labelGap);
  const slide = (key, kind, label, y, salt) => ({
    key,
    kind,
    label,
    y,
    labelX: band.x,
    trackX,
    trackW,
    trackY: y + rowH * 0.5,
    trackSalt: salt,
    hit: { x: trackX - 12, y: y - 4, w: trackW + 24, h: rowH + 8 },
  });
  const morph = slide("morphSec", "morph", "time", morphY, 14);
  const count = slide("lineN", "count", "count", countY, 12);
  const n = ASE3_HUD_TOGS.length;
  const cellW = band.w / n;
  const box = 20;
  const togY = morphY - 54;
  const togs = [];
  for (let i = 0; i < n; i++) {
    const cx = band.x + cellW * (i + 0.5);
    const bx = cx - box * 0.5;
    const by = togY + 4;
    togs.push({
      key: ASE3_HUD_TOGS[i][0],
      label: ASE3_HUD_TOGS[i][1],
      cx,
      box: { x: bx, y: by, w: box, h: box },
      labelY: by + box + 13,
      salt: 80 + i * 11,
      hit: { x: band.x + cellW * i, y: togY, w: cellW, h: 50 },
    });
  }
  return { count, rows: [morph, count], btn: null, togs };
};

function ase3HudDrawTog(tog) {
  const on = ASE_LAB[tog.key] > 0.5;
  const hot = aseHudThumbHover === tog.key;
  const dark = color(18, 16, 14);
  aseHudRect(tog.box.x, tog.box.y, tog.box.w, tog.box.h, tog.salt, hot ? 2.6 : 1.35);
  if (on) {
    aseHudDrawX(
      tog.box.x + tog.box.w * 0.5,
      tog.box.y + tog.box.h * 0.5,
      tog.salt + 40,
      hot ? 3.6 : 2.7,
      hot ? 6.2 : 5.2,
      dark
    );
  }
  noStroke();
  fill(42, 38, 32, on || hot ? 230 : 170);
  textAlign(CENTER, CENTER);
  textSize(11);
  text(tog.label, tog.cx, tog.labelY);
}

aseHudRowT = function (row) {
  if (row && row.kind === "morph") {
    return (ase3MorphSec() - ASE3_MORPH_LO) / (ASE3_MORPH_HI - ASE3_MORPH_LO);
  }
  if (row && row.kind === "count") {
    return (aseLayoutN() - 2) / 68;
  }
  return aseClamp(ASE_LAB[row.key], 0, 1, 0);
};

aseHudApplyRow = function (row, x) {
  const u = aseHudFromX(row, x);
  if (row && row.kind === "morph") {
    ASE_LAB.morphSec = +aseClamp(
      ASE3_MORPH_LO + u * (ASE3_MORPH_HI - ASE3_MORPH_LO),
      ASE3_MORPH_LO,
      ASE3_MORPH_HI,
      ASE3_MORPH_DEF
    ).toFixed(2);
    aseSyncSliders();
    aseSaveLs();
    if (ASE_LAB.live === false) redraw();
    return;
  }
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
};

aseDrawCaption = function () {};

aseDrawHud = function () {
  const g = aseHudGeom();
  push();
  const togs = g.togs || [];
  for (let i = 0; i < togs.length; i++) {
    ase3HudDrawTog(togs[i]);
  }
  for (let i = 0; i < g.rows.length; i++) {
    aseHudDrawTrack(g.rows[i], i);
  }
  pop();
};

aseHudPick = function (x, y) {
  const g = aseHudGeom();
  const togs = g.togs || [];
  for (let i = 0; i < togs.length; i++) {
    if (aseHudInside(togs[i].hit, x, y)) {
      return { type: "tog", key: togs[i].key };
    }
  }
  for (let i = 0; i < g.rows.length; i++) {
    if (aseHudInside(g.rows[i].hit, x, y)) {
      return { type: "slide", row: g.rows[i] };
    }
  }
  return null;
};

aseHudHoverSync = function () {
  const hit = aseHudPick(mouseX, mouseY);
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
  } else if (hit && hit.type === "tog") {
    nextThumb = hit.key;
  }
  if (nextThumb === aseHudThumbHover) return;
  aseHudThumbHover = nextThumb;
};

function ase3WireLayoutTogs() {
  for (let i = 0; i < ASE3_LAYOUTS.length; i++) {
    const id = ASE3_LAYOUTS[i][0];
    const key = ASE3_LAYOUTS[i][1];
    const el = document.getElementById(id);
    if (!el) continue;
    el.checked = ASE_LAB[key] > 0.5;
    el.addEventListener("change", () => {
      ASE_LAB[key] = el.checked ? 1 : 0;
      ase3SnapToggles();
      ase3SyncTogs();
      aseSaveLs();
      ase3HoldReady = false;
      if (ASE_LAB.live === false) redraw();
    });
  }
}

function setup() {
  createCanvas(ASE_W, ASE_H);
  angleMode(DEGREES);
  pixelDensity(ASE_PD);
  frameRate(24);
  loop();
  textFont("Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif");
  ASE_LAB.gridT = 0;
  ASE_LAB.concT = 0;
  ASE_LAB.barT = 0;
  ASE_LAB.branchT = 0;
  ASE_LAB.starT = 0;
  ASE_LAB.threadT = 1;
  ASE_LAB.kleeT = 0;
  ASE_LAB.morphSec = ASE3_MORPH_DEF;
  aseLoadLs();
  ase3SnapToggles();
  wireAseFloatUi();
  aseBindRange("lab-morph-sec", "lab-morph-sec-v", "morphSec", ASE3_MORPH_LO, ASE3_MORPH_HI, 2);
  ase3WireLayoutTogs();
  ase3SyncTogs();
  const urlSeed = aseParseUrlSeed();
  aseNewSeed(urlSeed != null ? urlSeed : undefined);
}

function draw() {
  ase3Tick();
  const frozen = !ase3AnyLayout();
  const morphing = !frozen && millis() - ase3CycleStart < ase3MorphMs();
  if (morphing) ase3HoldReady = false;
  randomSeed(aseSeed);
  noiseSeed(aseSeed);
  if (!frozen && !morphing && ase3HoldReady && aseBake) {
    image(aseBake, 0, 0, ASE_W, ASE_H);
    aseDrawPathGuides(aseBakePaths);
    aseDrawCaption();
    aseDrawHud();
    return;
  }
  asePaint();
  if (!morphing) ase3HoldReady = true;
}

function mousePressed() {
  if (mouseButton !== LEFT) return;
  const t = typeof event !== "undefined" && event && event.target;
  if (t && t.closest && t.closest("#pen-float")) return;
  const hit = aseHudPick(mouseX, mouseY);
  if (hit && hit.type === "tog") {
    aseHudDrag = null;
    ase3FlipLayout(hit.key);
    return;
  }
  if (hit && hit.type === "slide") {
    aseHudDrag = hit.row.key;
    aseHudApplyRow(hit.row, mouseX);
    return;
  }
  aseHudDrag = null;
  aseNewSeed();
}

function mouseDragged() {
  if (!aseHudDrag) return;
  const g = aseHudGeom();
  for (let i = 0; i < g.rows.length; i++) {
    if (g.rows[i].key === aseHudDrag) {
      aseHudApplyRow(g.rows[i], mouseX);
      break;
    }
  }
}
