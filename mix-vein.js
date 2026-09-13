/**
 * mix-vein.js — 沿折線畫實線＋小葉（合景／驗證共用）
 *
 * 呼叫：MixVein.paint({ pts, closed }, opts)
 * 只取變形後線段：MixVein.collect({ pts, closed }, opts) → [{pts, kind, sw}, ...]
 * 路徑＝開放或閉合點列；節奏 ----AA---A---；小葉＝橢圓弧抽點 curveVertex 或長軸葉脈。
 * 驗證頁 `vein-demo` 是薄殼。禁止 references/**。
 *
 * 畫時 push + angleMode(DEGREES)，合景（預設弧度）可直接叫。
 * paintFromRead(read, inst, opts)：剪影切幹後畫葉團／樹幹實線。
 * 草／暗草／新草／石無樹幹，不切幹（整圈當葉團外邊）。
 * 葉子朝外：opts.outward 或剪影不透明質心；切幹後的片段不可各自當中心。
 * 樹／地面造型路徑：opts.lodStage（MixLod 0–3，腳點 Z）時 leafShare × [0.2, 0.5, 0.7, 1]。
 * 雲／山／人不要傳 lodStage，preset leafShare 原樣。
 */
"use strict";

const MixVein = (() => {
  const DEFAULTS = {
    /** 0＝只畫線，1＝整圈接葉，0.5＝全線段線／葉弧長各半（沿全程交錯，不是從頭扣完） */
    leafShare: 0.5,
    /** 葉間空白大於此弧長（px）就補實線 */
    gapFill: 30,
    /** 葉子長軸倍率 */
    leafLen: 1,
    /** 葉子寬倍率 */
    leafWid: 1,
    /** 0＝葉緣，1＝葉脈；中間為畫脈機率 */
    leafVein: 0,
    /** 0＝實線接到葉脈起點，1＝現況線／葉空隙 */
    leafPad: 1,
    /** 1＝現況葉量，2＝同段約兩倍、更密 */
    leafDens: 1,
    /** -1＝往形內，0＝貼路徑邊（現況），1＝往形外 */
    leafOff: 0,
    /** 0＝葉緣橢圓曲線，1＝兩直線（不封底） */
    leafTri: 0,
    /** 葉子 strokeWeight＝random(1, leafSw)；1＝固定 1px */
    leafSw: 1,
    /** 直線 strokeWeight＝1.15×lineSw×swMul；1＝現況 */
    lineSw: 1,
    /** 線／葉線寬倍率（1＝現況） */
    swMul: 1,
    /** 紅線顯示幾何路徑 */
    showPath: false,
    salt: 0,
  };

  /** 樹 MixVein：遠（0）少葉、近（3）全葉；只跟腳點 Z。 */
  const LEAF_SHARE_LOD_MUL = [0.2, 0.5, 0.7, 1];

  const WIGGLE = 3;
  const LINE_NOISE_AMP = 2.8;
  const LINE_NOISE_STEP = 3;
  const LINE_NOISE_FREQ = 0.045;
  const LEAF_OCC = 7;
  /** |leafOff|＝1 時，相對貼邊再推／縮的像素 */
  const LEAF_OFF_PX = 14;

  function clamp(n, lo, hi, fallback) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    return Math.max(lo, Math.min(hi, x));
  }

  function clampLodStage(s) {
    if (typeof MixLod !== "undefined" && MixLod.clampStage) {
      return MixLod.clampStage(s);
    }
    const n = Math.round(Number(s));
    if (!Number.isFinite(n)) return 3;
    return Math.max(0, Math.min(3, n));
  }

  /** 未傳 lodStage＝不乘。畫時只呼叫一次，避免 paintMany 再乘。 */
  function leafShareForLod(share, lodStage) {
    if (lodStage == null) return share;
    const n = Number(lodStage);
    if (!Number.isFinite(n)) return share;
    const mul = LEAF_SHARE_LOD_MUL[clampLodStage(n)];
    if (!Number.isFinite(mul)) return share;
    return clamp(share * mul, 0, 1, share);
  }

  function mergeOpts(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    o.leafShare = clamp(o.leafShare, 0, 1, DEFAULTS.leafShare);
    o.gapFill = clamp(o.gapFill, 2, 60, DEFAULTS.gapFill);
    o.leafLen = clamp(o.leafLen, 0.05, 5, DEFAULTS.leafLen);
    o.leafWid = clamp(o.leafWid, 1, 3, DEFAULTS.leafWid);
    o.leafVein = clamp(o.leafVein, 0, 1, DEFAULTS.leafVein);
    o.leafPad = clamp(o.leafPad, 0, 1, DEFAULTS.leafPad);
    o.leafDens = clamp(o.leafDens, 1, 2, DEFAULTS.leafDens);
    o.leafOff = clamp(o.leafOff, -1, 1, DEFAULTS.leafOff);
    o.leafTri = clamp(o.leafTri, 0, 1, DEFAULTS.leafTri);
    o.leafSw = clamp(o.leafSw, 0.5, 6, DEFAULTS.leafSw);
    o.lineSw = clamp(o.lineSw, 0.5, 6, DEFAULTS.lineSw);
    o.swMul = clamp(o.swMul, 0.5, 5, DEFAULTS.swMul);
    o.showPath = !!o.showPath;
    o.salt = Number(o.salt);
    if (!Number.isFinite(o.salt)) o.salt = 0;
    return o;
  }

  function readPt(p) {
    if (Array.isArray(p) && p.length >= 2) {
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      return null;
    }
    if (!p || typeof p !== "object") return null;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function cleanPts(src) {
    if (!Array.isArray(src)) return [];
    const pts = [];
    for (let i = 0; i < src.length; i++) {
      const p = readPt(src[i]);
      if (!p) continue;
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
      pts.push(p);
    }
    return pts;
  }

  function normalizePath(path) {
    if (!path) return null;
    if (Array.isArray(path)) {
      const pts = cleanPts(path);
      if (pts.length < 2) return null;
      return { pts, closed: false };
    }
    const pts = cleanPts(path.pts);
    if (pts.length < 2) return null;
    return { pts, closed: path.closed === true };
  }

  function peri(pts, closed) {
    let n = 0;
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      n += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return n;
  }

  function centroid(pts) {
    if (!pts || pts.length < 1) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < pts.length; i++) {
      sx += pts[i].x;
      sy += pts[i].y;
    }
    const n = pts.length;
    return { x: sx / n, y: sy / n };
  }

  function centroidOfPaths(paths) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    if (!paths) return { x: 0, y: 0 };
    for (let i = 0; i < paths.length; i++) {
      const item = paths[i];
      const pts = Array.isArray(item) ? item : item && item.pts;
      if (!pts) continue;
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j];
        if (!p) continue;
        const x = Number(p.x);
        const y = Number(p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        sx += x;
        sy += y;
        n++;
      }
    }
    if (!n) return { x: 0, y: 0 };
    return { x: sx / n, y: sy / n };
  }

  /** 不透明像素質心＝物件中心（螢幕座標）。切幹後的開放折線不可拿來當放射原點。 */
  function centroidOfRead(read) {
    if (!read || !read.data) return null;
    const data = read.data;
    const x0 = read.x0 || 0;
    const y0 = read.y0 || 0;
    const w = read.w || 0;
    const h = read.h || 0;
    const dens = read.d > 0 ? read.d : 1;
    const aMin = read.alphaMin != null ? read.alphaMin : 16;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        if (data[(ly * w + lx) * 4 + 3] < aMin) continue;
        sx += x0 + lx + 0.5;
        sy += y0 + ly + 0.5;
        n++;
      }
    }
    if (!n) return null;
    return { x: sx / n / dens, y: sy / n / dens };
  }

  function resolveOutward(opts, paths) {
    if (
      opts &&
      opts.outward &&
      Number.isFinite(opts.outward.x) &&
      Number.isFinite(opts.outward.y)
    ) {
      return opts.outward;
    }
    return centroidOfPaths(paths);
  }

  function sampleAt(pts, dist, closed, cx, cy) {
    const p = peri(pts, closed);
    const fallback = { x: pts[0].x, y: pts[0].y, heading: 0, outDeg: -90 };
    if (p < 1e-6) return fallback;
    let remain;
    if (closed) {
      remain = dist % p;
      if (remain < 0) remain += p;
    } else {
      remain = dist;
      if (remain < 0) remain = 0;
      if (remain > p) remain = p;
    }
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (remain <= len || i === segs - 1) {
        const u = len < 1e-6 ? 0 : Math.min(1, remain / len);
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        const heading = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        let outDeg = heading + 90;
        const ox = Math.cos((outDeg * Math.PI) / 180);
        const oy = Math.sin((outDeg * Math.PI) / 180);
        if (ox * (x - cx) + oy * (y - cy) < 0) outDeg += 180;
        return { x, y, heading, outDeg };
      }
      remain -= len;
    }
    return fallback;
  }

  function strokeOpen(pts) {
    if (!pts || pts.length < 2) return;
    beginShape();
    for (let i = 0; i < pts.length; i++) vertex(pts[i].x, pts[i].y);
    endShape();
  }

  function strokePath(pts, closed) {
    if (!pts || pts.length < 2) return;
    if (!closed) {
      strokeOpen(pts);
      return;
    }
    beginShape();
    for (let i = 0; i < pts.length; i++) vertex(pts[i].x, pts[i].y);
    endShape(CLOSE);
  }

  function wobbleSpan(pts, start, len, closed, cx, cy, salt) {
    const n = Math.max(2, Math.ceil(len / LINE_NOISE_STEP));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const d = start + t * len;
      const s = sampleAt(pts, d, closed, cx, cy);
      const n1 = noise(d * LINE_NOISE_FREQ, salt);
      const n2 = noise(d * LINE_NOISE_FREQ * 2.3 + 11, salt + 4.2);
      let shift =
        (n1 - 0.5) * 2 * LINE_NOISE_AMP +
        (n2 - 0.5) * 2 * LINE_NOISE_AMP * 0.4;
      const fade = constrain(Math.min(t, 1 - t) * 8, 0.35, 1);
      shift *= fade;
      const left = ((s.heading + 90) * Math.PI) / 180;
      out.push({
        x: s.x + Math.cos(left) * shift,
        y: s.y + Math.sin(left) * shift,
      });
    }
    return out;
  }

  function mergeIntervals(iv) {
    if (!iv.length) return [];
    const list = iv.slice().sort((a, b) => a[0] - b[0]);
    const out = [[list[0][0], list[0][1]]];
    for (let i = 1; i < list.length; i++) {
      const last = out[out.length - 1];
      if (list[i][0] <= last[1] + 0.5) last[1] = Math.max(last[1], list[i][1]);
      else out.push([list[i][0], list[i][1]]);
    }
    return out;
  }

  function addCover(covered, p, a, b, closed) {
    if (b <= a || p < 1) return;
    if (!closed) {
      const x0 = Math.max(0, a);
      const x1 = Math.min(p, b);
      if (x1 > x0) covered.push([x0, x1]);
      return;
    }
    let x0 = a;
    let x1 = b;
    if (x1 < 0 || x0 > p) return;
    if (x0 < 0) {
      covered.push([p + x0, p]);
      x0 = 0;
    }
    if (x1 > p) {
      covered.push([0, x1 - p]);
      x1 = p;
    }
    if (x1 > x0) covered.push([x0, x1]);
  }

  function gapWobbles(pts, closed, p, cx, cy, salt, covered, o) {
    const merged = mergeIntervals(covered);
    const holes = [];
    if (!merged.length) {
      holes.push([0, p]);
    } else {
      if (merged[0][0] > 0.5) holes.push([0, merged[0][0]]);
      for (let i = 0; i < merged.length - 1; i++) {
        holes.push([merged[i][1], merged[i + 1][0]]);
      }
      const last = merged[merged.length - 1];
      if (p - last[1] > 0.5) holes.push([last[1], p]);
      if (closed && holes.length >= 2) {
        const first = holes[0];
        const tail = holes[holes.length - 1];
        if (first[0] <= 0.5 && tail[1] >= p - 0.5) {
          holes.pop();
          holes.shift();
          holes.push([tail[0], first[1] + p]);
        }
      }
    }
    const spans = [];
    for (let i = 0; i < holes.length; i++) {
      const a = holes[i][0];
      const b = holes[i][1];
      const len = b - a;
      if (len <= o.gapFill * o.leafPad) continue;
      let start = a;
      let span = len;
      if (closed) {
        start = ((a % p) + p) % p;
      } else if (start + span > p) {
        span = Math.max(0, p - start);
      }
      if (span < 0.5) continue;
      spans.push(wobbleSpan(pts, start, span, closed, cx, cy, salt + 1.7));
    }
    return spans;
  }

  function fillLongGaps(pts, closed, p, cx, cy, salt, covered, o) {
    const spans = gapWobbles(pts, closed, p, cx, cy, salt, covered, o);
    stroke(0);
    strokeWeight(1.15 * o.lineSw * o.swMul);
    for (let i = 0; i < spans.length; i++) strokeOpen(spans[i]);
  }

  function drawGuide(pts, closed, showPath) {
    if (!showPath) return;
    noFill();
    strokeCap(ROUND);
    strokeJoin(ROUND);
    stroke(220, 40, 40, 200);
    strokeWeight(2.2);
    strokePath(pts, closed);
  }

  function leafTs(count, dens) {
    const n = Math.max(1, Math.round(Math.max(1, count) * dens));
    if (n <= 1) return [random(0.32, 0.68)];
    const gaps = [];
    for (let i = 0; i < n - 1; i++) {
      const u = random();
      if (u < 0.42) gaps.push(random(0.28, 0.9) / dens);
      else if (u < 0.78) gaps.push(random(1.5, 3.1) / dens);
      else gaps.push(random(4.5, 9) / dens);
    }
    const lead = random(0.15, 1.3) / dens;
    const tail = random(0.15, 1.3) / dens;
    let sum = lead + tail;
    for (let i = 0; i < gaps.length; i++) sum += gaps[i];
    let t = lead / sum;
    const ts = [t];
    for (let i = 0; i < gaps.length; i++) {
      t += gaps[i] / sum;
      ts.push(constrain(t, 0.03, 0.97));
    }
    return ts;
  }

  function scatterTs(p, dens) {
    const ts = [];
    let d = random(2, 18) / dens;
    while (d < p - 3) {
      ts.push(constrain(d / p, 0.01, 0.99));
      const u = random();
      if (u < 0.38) d += random(3, 8) / dens;
      else if (u < 0.72) d += random(12, 26) / dens;
      else d += random(40, 95) / dens;
    }
    if (ts.length < 1) ts.push(0.5);
    return ts;
  }

  function dashRuns(p, o) {
    const share = o.leafShare;
    if (!Number.isFinite(p) || p < 8) return [];
    if (share <= 0.001) return [{ type: "line", start: 0, len: p, ts: [] }];
    if (share >= 0.999) {
      return [{ type: "leaf", start: 0, len: p, ts: scatterTs(p, o.leafDens) }];
    }

    const dens = o.leafDens;
    const runs = [];
    let pos = 0;
    let leafUsed = 0;
    const leafTarget = p * share;
    const maxRun = Math.max(18, Math.min(72, p * 0.08));
    const maxSteps = Math.max(80, Math.ceil(p / 4));

    function pushLine(start, len) {
      if (len < 1.5) return;
      const last = runs[runs.length - 1];
      if (last && last.type === "line") last.len += len;
      else runs.push({ type: "line", start: start, len: len, ts: [] });
    }

    function pushLeaf(start, len) {
      if (len < 3) {
        pushLine(start, len);
        return;
      }
      const tight = random() < 0.45;
      const n = tight
        ? random() < 0.55
          ? 2
          : random() < 0.7
            ? 3
            : 1
        : random() < 0.55
          ? 1
          : 2;
      runs.push({
        type: "leaf",
        start: start,
        len: len,
        ts: leafTs(n, dens),
      });
      leafUsed += len;
    }

    function lineIdeal(rest) {
      const u = random();
      let ideal;
      if (u < 0.3) ideal = random(6, 20);
      else if (u < 0.72) ideal = random(16, 48);
      else ideal = random(28, maxRun);
      return Math.max(2, Math.min(ideal, rest));
    }

    function leafIdeal(rest) {
      const tight = random() < 0.45;
      const ideal = tight ? random(8, 20) : random(14, 44);
      return Math.max(6, Math.min(ideal, rest));
    }

    for (let step = 0; step < maxSteps && pos < p - 1; step++) {
      const rest = p - pos;
      if (rest < 2) break;
      const leafLeft = leafTarget - leafUsed;
      const lineLeft = rest - leafLeft;
      let wantLeaf;
      if (leafLeft < 3) wantLeaf = false;
      else if (lineLeft < 2) wantLeaf = true;
      else wantLeaf = random() < leafLeft / rest;

      if (!wantLeaf) {
        const len = Math.min(lineIdeal(rest), Math.max(2, lineLeft));
        pushLine(pos, len);
        pos += len;
      } else {
        const len = Math.min(leafIdeal(rest), Math.max(3, leafLeft));
        pushLeaf(pos, len);
        pos += len;
      }
    }

    if (pos < p - 0.5) {
      const rest = p - pos;
      const leafLeft = Math.max(0, leafTarget - leafUsed);
      if (leafLeft >= 3 && rest - leafLeft >= 2) {
        if (random() < 0.5) {
          pushLeaf(pos, leafLeft);
          pushLine(pos + leafLeft, rest - leafLeft);
        } else {
          pushLine(pos, rest - leafLeft);
          pushLeaf(pos + rest - leafLeft, leafLeft);
        }
      } else if (leafLeft >= rest * 0.5) {
        pushLeaf(pos, rest);
      } else {
        pushLine(pos, rest);
      }
    }
    return runs;
  }

  function leafEllipsePt(rx, ry, deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: rx * Math.cos(rad), y: ry * Math.sin(rad) };
  }

  function leafEdgeLocalPts(rx, ry, start, stop, tri) {
    const a = leafEllipsePt(rx, ry, start);
    const b = leafEllipsePt(rx, ry, (start + stop) * 0.5);
    const c = leafEllipsePt(rx, ry, stop);
    if (tri >= 0.999) return [a, b, c];
    const n = 8;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const e = leafEllipsePt(rx, ry, lerp(start, stop, t));
      let tx;
      let ty;
      if (t <= 0.5) {
        const u = t * 2;
        tx = a.x + (b.x - a.x) * u;
        ty = a.y + (b.y - a.y) * u;
      } else {
        const u = (t - 0.5) * 2;
        tx = b.x + (c.x - b.x) * u;
        ty = b.y + (c.y - b.y) * u;
      }
      pts.push({
        x: e.x + (tx - e.x) * tri,
        y: e.y + (ty - e.y) * tri,
      });
    }
    return pts;
  }

  function veinLocalPts(archi, px, py) {
    const half = archi * 0.5;
    const n = Math.max(3, Math.ceil(archi / 2.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const yy = lerp(-half * 0.12, half * 0.92, u);
      const wob =
        (noise(yy * 0.14 + px * 0.03, py * 0.03 + 2.1) - 0.5) * 2 * 1.35;
      pts.push({ x: wob, y: yy });
    }
    return pts;
  }

  function toWorld(local, px, py, deg) {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const out = [];
    for (let i = 0; i < local.length; i++) {
      const x = local[i].x;
      const y = local[i].y;
      out.push({ x: px + x * c - y * s, y: py + x * s + y * c });
    }
    return out;
  }

  /** 與 stampArcLeaf 同一套亂數，回傳世界座標折線。 */
  function buildArcLeaf(x, y, outDeg, o) {
    const px = x + random(-WIGGLE, WIGGLE) * 0.35;
    const py = y + random(-WIGGLE, WIGGLE) * 0.35;
    const sizeMul = random(0.65, 1.55);
    const arcwid = random(2, 4) * sizeMul * o.leafWid;
    const archi = random(5, 15) * sizeMul * o.leafLen;
    const lean = random(-28, 28);
    const drawVein = random() < o.leafVein;
    const sw = random(1, o.leafSw) * o.swMul;
    let local;
    let curve = false;
    if (!drawVein) {
      local = leafEdgeLocalPts(
        arcwid * 0.5,
        archi * 0.5,
        0 + random(-77, 77),
        180 + random(-77, 77),
        o.leafTri
      );
      curve = o.leafTri < 0.999;
    } else {
      local = veinLocalPts(archi, px, py);
    }
    return {
      pts: toWorld(local, px, py, outDeg - 90 + lean),
      sw: sw,
      curve: curve,
    };
  }

  function stampArcLeaf(x, y, outDeg, o) {
    const leaf = buildArcLeaf(x, y, outDeg, o);
    if (!leaf.pts || leaf.pts.length < 2) return;
    noFill();
    stroke(0);
    strokeWeight(leaf.sw);
    beginShape();
    if (leaf.curve) {
      curveVertex(leaf.pts[0].x, leaf.pts[0].y);
      for (let i = 0; i < leaf.pts.length; i++) {
        curveVertex(leaf.pts[i].x, leaf.pts[i].y);
      }
      curveVertex(leaf.pts[leaf.pts.length - 1].x, leaf.pts[leaf.pts.length - 1].y);
    } else {
      for (let i = 0; i < leaf.pts.length; i++) {
        vertex(leaf.pts[i].x, leaf.pts[i].y);
      }
    }
    endShape();
  }

  /**
   * density-pen LOD 2 等會 PlantKit.setDrawTarget(buf)；MixVein 若走全域 p5
   * 會畫在主畫布，接著 buf 貼上就把弧蓋掉。opts.target＝那張 Graphics。
   */
  function withDrawTarget(pg, fn) {
    if (!pg || typeof pg.stroke !== "function") return fn();
    const names = [
      "push",
      "pop",
      "stroke",
      "noStroke",
      "noFill",
      "fill",
      "strokeWeight",
      "strokeCap",
      "strokeJoin",
      "beginShape",
      "endShape",
      "vertex",
      "curveVertex",
      "translate",
      "rotate",
      "angleMode",
      "line",
    ];
    const saved = {};
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      saved[n] = window[n];
      if (typeof pg[n] === "function") window[n] = pg[n].bind(pg);
    }
    try {
      return fn();
    } finally {
      for (let i = 0; i < names.length; i++) {
        window[names[i]] = saved[names[i]];
      }
    }
  }

  /**
   * 沿一條路徑畫線／葉。
   * @param {{pts:object[], closed?:boolean}|object[]} path
   * @param {object} [opts] 見 DEFAULTS；可加 outward:{x,y}；target＝p5.Graphics
   */
  function paint(path, opts) {
    const outer = normalizePath(path);
    if (!outer) return;
    const o = mergeOpts(opts);
    o.leafShare = leafShareForLod(o.leafShare, opts && opts.lodStage);
    const closed = outer.closed;
    const pts = outer.pts;
    const c =
      opts && opts.outward && Number.isFinite(opts.outward.x)
        ? opts.outward
        : centroid(pts);
    const cx = c.x;
    const cy = c.y;
    const p = peri(pts, closed);
    const target = opts && opts.target;

    withDrawTarget(target, function () {
      push();
      angleMode(DEGREES);
      drawGuide(pts, closed, o.showPath);
      if (p < 8) {
        pop();
        return;
      }

      const runs = dashRuns(p, o);
      const covered = [];
      noFill();
      strokeCap(ROUND);
      strokeJoin(ROUND);
      for (let r = 0; r < runs.length; r++) {
        const run = runs[r];
        if (run.type === "line") {
          stroke(0);
          strokeWeight(1.15 * o.lineSw * o.swMul);
          strokeOpen(wobbleSpan(pts, run.start, run.len, closed, cx, cy, o.salt));
          addCover(covered, p, run.start, run.start + run.len, closed);
          continue;
        }
        if (!run.ts || run.ts.length < 1) continue;
        for (let i = 0; i < run.ts.length; i++) {
          const d = run.start + run.ts[i] * run.len;
          const s = sampleAt(pts, d, closed, cx, cy);
          const along = (s.heading * Math.PI) / 180;
          const slip = random(-3.5, 3.5);
          const off = random(1.2, 7.5) + o.leafOff * LEAF_OFF_PX;
          const ox = Math.cos((s.outDeg * Math.PI) / 180) * off;
          const oy = Math.sin((s.outDeg * Math.PI) / 180) * off;
          stampArcLeaf(
            s.x + ox + Math.cos(along) * slip,
            s.y + oy + Math.sin(along) * slip,
            s.outDeg,
            o
          );
          const occ = LEAF_OCC * o.leafPad;
          addCover(covered, p, d - occ, d + occ, closed);
        }
      }
      fillLongGaps(pts, closed, p, cx, cy, o.salt, covered, o);
      pop();
    });
  }

  /**
   * 與 paint 同一套節奏／抖線／葉子亂數，只回傳變形後的開放折線，不畫。
   * @returns {{pts:{x:number,y:number}[], kind:string, sw:number}[]}
   */
  function collect(path, opts) {
    const outer = normalizePath(path);
    if (!outer) return [];
    const o = mergeOpts(opts);
    o.leafShare = leafShareForLod(o.leafShare, opts && opts.lodStage);
    const closed = outer.closed;
    const pts = outer.pts;
    const c =
      opts && opts.outward && Number.isFinite(opts.outward.x)
        ? opts.outward
        : centroid(pts);
    const cx = c.x;
    const cy = c.y;
    const p = peri(pts, closed);
    if (p < 8) return [];

    const runs = dashRuns(p, o);
    const covered = [];
    const strokes = [];
    const lineSw = 1.15 * o.lineSw * o.swMul;
    function pushStroke(ptsOut, kind, sw) {
      if (!ptsOut || ptsOut.length < 2) return;
      strokes.push({ pts: ptsOut, kind: kind, sw: sw });
    }
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.type === "line") {
        pushStroke(
          wobbleSpan(pts, run.start, run.len, closed, cx, cy, o.salt),
          "line",
          lineSw
        );
        addCover(covered, p, run.start, run.start + run.len, closed);
        continue;
      }
      if (!run.ts || run.ts.length < 1) continue;
      for (let i = 0; i < run.ts.length; i++) {
        const d = run.start + run.ts[i] * run.len;
        const s = sampleAt(pts, d, closed, cx, cy);
        const along = (s.heading * Math.PI) / 180;
        const slip = random(-3.5, 3.5);
        const off = random(1.2, 7.5) + o.leafOff * LEAF_OFF_PX;
        const ox = Math.cos((s.outDeg * Math.PI) / 180) * off;
        const oy = Math.sin((s.outDeg * Math.PI) / 180) * off;
        const leaf = buildArcLeaf(
          s.x + ox + Math.cos(along) * slip,
          s.y + oy + Math.sin(along) * slip,
          s.outDeg,
          o
        );
        pushStroke(leaf.pts, "leaf", leaf.sw);
        const occ = LEAF_OCC * o.leafPad;
        addCover(covered, p, d - occ, d + occ, closed);
      }
    }
    const gaps = gapWobbles(pts, closed, p, cx, cy, o.salt, covered, o);
    for (let i = 0; i < gaps.length; i++) {
      pushStroke(gaps[i], "line", lineSw);
    }
    return strokes;
  }

  /**
   * 多條路徑。每條 salt 自動錯開；opts.salt 當基底。
   * @param {object[]} paths
   * @param {object} [opts]
   */
  function paintMany(paths, opts) {
    if (!paths || !paths.length) return;
    const baseSalt = mergeOpts(opts).salt;
    const outward = resolveOutward(opts, paths);
    for (let i = 0; i < paths.length; i++) {
      paint(
        paths[i],
        Object.assign({}, opts || {}, {
          salt: baseSalt + i * 1.37,
          outward: outward,
        })
      );
    }
  }

  function segLen(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function pathLen(pts, closed) {
    if (!pts || pts.length < 2) return 0;
    let n = 0;
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      n += segLen(pts[i], pts[(i + 1) % pts.length]);
    }
    return n;
  }

  function closeGapPx(step) {
    const st = step > 0 ? step : 5;
    return Math.max(22, st * 4);
  }

  function isSpatiallyClosed(pts, step) {
    if (!pts || pts.length < 3) return false;
    return segLen(pts[0], pts[pts.length - 1]) <= closeGapPx(step);
  }

  function typicalEdge(pts) {
    if (!pts || pts.length < 2) return 8;
    const lens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const L = segLen(pts[i], pts[i + 1]);
      if (L > 0.2) lens.push(L);
    }
    if (!lens.length) return 8;
    lens.sort((a, b) => a - b);
    return lens[(lens.length * 0.5) | 0];
  }

  function breakLongEdges(pts, maxEdge) {
    if (!pts || pts.length < 2) return [];
    const chunks = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const L = segLen(pts[i - 1], pts[i]);
      if (L > maxEdge) {
        if (cur.length >= 2) chunks.push(cur);
        cur = [pts[i]];
        continue;
      }
      cur.push(pts[i]);
    }
    if (cur.length >= 2) chunks.push(cur);
    return chunks;
  }

  const NO_TRUNK_IDS = {
    grass: true,
    darkGrass: true,
    reedGrass: true,
    rock: true,
  };

  function recipeHasTrunk(inst) {
    const id = inst && inst.recipe && inst.recipe.id;
    if (!id) return true;
    return !NO_TRUNK_IDS[id];
  }

  function pointIsTrunkEdge(x, y, inst) {
    const skel = inst && inst.skeleton;
    if (!skel || !(skel.height > 8)) return false;
    const r = inst.radius || 40;
    const footY = (inst.base && inst.base.y) || inst.baseline || skel.bottomY;
    const stemH = Math.max(r * 1.65, skel.height * 0.22);
    if (y < footY - stemH) return false;
    if (y > footY + r * 0.15) return false;
    const v = (skel.bottomY - y) / skel.height;
    if (v < 0 || v > 1.15) return false;
    let cx = skel.bottomX;
    if (typeof sampleSkeleton === "function") {
      const s = sampleSkeleton(skel, constrain(v, 0, 1));
      if (s && s.center) cx = s.center.x;
    }
    let half = r * 0.2;
    if (typeof trunkBaseWeightFromHeight === "function") {
      half = Math.max(half, trunkBaseWeightFromHeight(skel.height, 1) * 0.55);
    }
    half = Math.max(7, half);
    return Math.abs(x - cx) <= half;
  }

  function runsWhere(pts, pred, ring) {
    const n = pts.length;
    const flags = [];
    for (let i = 0; i < n; i++) flags.push(!!pred(pts[i], i));
    const runs = [];
    let i = 0;
    while (i < n) {
      if (!flags[i]) {
        i++;
        continue;
      }
      const run = [];
      if (i > 0 && !flags[i - 1]) run.push(pts[i - 1]);
      while (i < n && flags[i]) {
        run.push(pts[i]);
        i++;
      }
      if (i < n && !flags[i]) run.push(pts[i]);
      runs.push(run);
    }
    if (ring && n > 1 && flags[0] && flags[n - 1] && runs.length >= 2) {
      const last = runs[runs.length - 1];
      const first = runs[0];
      if (segLen(last[last.length - 1], first[0]) <= closeGapPx(5)) {
        runs.pop();
        runs[0] = last.concat(first);
      }
    }
    return { all: flags.every(Boolean), none: !flags.some(Boolean), runs };
  }

  function packOpenRuns(runs, minPts, minLen) {
    const out = [];
    for (let r = 0; r < runs.length; r++) {
      const p = cleanPts(runs[r]);
      const maxEdge = Math.max(48, typicalEdge(p) * 5);
      const parts = breakLongEdges(p, maxEdge);
      for (let k = 0; k < parts.length; k++) {
        const q = parts[k];
        if (q.length >= minPts && pathLen(q, false) >= minLen) {
          out.push({ pts: q, closed: false });
        }
      }
    }
    return out;
  }

  function splitContourByTrunk(pts, inst, step) {
    if (!pts || pts.length < 8) return { canopy: [], trunk: [] };
    const ring = isSpatiallyClosed(pts, step);
    if (!recipeHasTrunk(inst)) {
      return { canopy: [{ pts: pts, closed: ring }], trunk: [] };
    }
    const canopyFlag = (p) => !pointIsTrunkEdge(p.x, p.y, inst);
    const canopyPart = runsWhere(pts, canopyFlag, ring);
    if (canopyPart.all) {
      return { canopy: [{ pts, closed: ring }], trunk: [] };
    }
    if (canopyPart.none) {
      return { canopy: [], trunk: [{ pts, closed: ring }] };
    }
    const trunkPart = runsWhere(
      pts,
      (p) => pointIsTrunkEdge(p.x, p.y, inst),
      ring
    );
    return {
      canopy: packOpenRuns(canopyPart.runs, 8, 24),
      trunk: packOpenRuns(trunkPart.runs, 2, 8),
    };
  }

  /**
   * 從 alpha 剪影畫造型路徑：葉團外邊＋樹幹實線。畫完不留折線。
   * @returns {boolean}
   */
  function paintFromRead(read, inst, opts) {
    if (!read) return false;
    if (
      typeof MixPencilStroke === "undefined" ||
      typeof MixPencilStroke.extractContourPolylines !== "function"
    ) {
      return false;
    }
    const o = mergeOpts(opts);
    const step = opts && opts.traceStep > 0 ? opts.traceStep : 5;
    const raw = MixPencilStroke.extractContourPolylines(read, step);
    const outward =
      opts &&
      opts.outward &&
      Number.isFinite(opts.outward.x) &&
      Number.isFinite(opts.outward.y)
        ? opts.outward
        : centroidOfRead(read) || centroidOfPaths(raw);
    const canopy = [];
    const trunk = [];
    for (let i = 0; i < raw.length; i++) {
      const pts = cleanPts(raw[i]);
      if (!pts || pts.length < 8) continue;
      if (pathLen(pts, true) < 24) continue;
      const split = splitContourByTrunk(pts, inst, step);
      for (let k = 0; k < split.canopy.length; k++) {
        split.canopy[k]._len = pathLen(
          split.canopy[k].pts,
          split.canopy[k].closed
        );
        canopy.push(split.canopy[k]);
      }
      for (let k = 0; k < split.trunk.length; k++) trunk.push(split.trunk[k]);
    }
    canopy.sort((a, b) => b._len - a._len);
    const keep = canopy.slice(0, 8);
    const veinOpts = Object.assign({}, o, { outward: outward });
    paintMany(keep, veinOpts);
    paintMany(
      trunk,
      Object.assign({}, opts || {}, {
        leafShare: 0,
        salt: o.salt + 3.1,
        outward: outward,
      })
    );
    return keep.length > 0 || trunk.length > 0;
  }

  return {
    DEFAULTS,
    LEAF_SHARE_LOD_MUL,
    leafShareForLod,
    cleanPts,
    strokeOpen,
    paint,
    collect,
    paintMany,
    splitContourByTrunk,
    paintFromRead,
    centroidOfRead,
    centroidOfPaths,
  };
})();
