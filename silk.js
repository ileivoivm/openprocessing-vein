/**
 * silk.js — 絲線層（抽出自 path-silk.js／mixBakeSilkLayer）
 *
 * 淡絲＋黑線：有 MixPencilStroke 走鉛筆 ribbon；否則 Bézier 回退。
 * 白／黑沉澱點仍是 Hobbs 變形色塊（不是鉛筆）。
 * paint(seed, target)：target 為 p5.Graphics 時只走 Bézier，畫進離屏層。
 */
"use strict";

const Silk = (() => {
  const C = {
    loops: 10000,
    weight: 0.2,
    pad: 1000,
    pencilSw: 0.08,
    pencilBlackA: 0.5,
    h: 50,
    s: 50,
    lMin: 55,
    lMax: 95,
    aMin: 1,
    aMax: 15,
    blackChance: 0.04,
    blackLMax: 12,
    blackAMin: 4,
    blackAMax: 18,
    blackLenMin: 0.2,
    blackLenMax: 0.6,
    blackBend: 1.05,
    speckleCount: 10000,
    speckleSizeMin: 0.2,
    speckleSizeMax: 5.2,
    speckleWhiteMul: 0.7,
    specklePower: 2.8,
    hubCount: 36,
    hubRad: 0.07,
    looseFrac: 0.1,
    microClump: 0.38,
    deformRounds: 3,
    deformMag: 0.28,
    blackSpeckleCount: 100,
    refArea: 1000 * 1000,
  };

  function makeLcg(seedVal) {
    let s = seedVal >>> 0;
    if (s === 0) s = 1;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function sampleBezier(x0, y0, x1, y1, x2, y2, x3, y3, steps) {
    const n = Math.max(2, steps | 0);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const uu = u * u;
      const tt = t * t;
      pts.push({
        x: uu * u * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + tt * t * x3,
        y: uu * u * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + tt * t * y3,
      });
    }
    return pts;
  }

  function makeDraw(target) {
    if (target) {
      return {
        w: target.width,
        h: target.height,
        push: () => target.push(),
        pop: () => target.pop(),
        colorMode: (a, b, c, d) => target.colorMode(a, b, c, d),
        blendMode: (m) => target.blendMode(m),
        strokeWeight: (n) => target.strokeWeight(n),
        noFill: () => target.noFill(),
        noStroke: () => target.noStroke(),
        strokeCap: (c) => target.strokeCap(c),
        stroke: function () {
          target.stroke.apply(target, arguments);
        },
        fill: function () {
          target.fill.apply(target, arguments);
        },
        bezier: function () {
          target.bezier.apply(target, arguments);
        },
        beginShape: () => target.beginShape(),
        vertex: (x, y) => target.vertex(x, y),
        endShape: (m) => target.endShape(m),
      };
    }
    return {
      w: width,
      h: height,
      push: () => push(),
      pop: () => pop(),
      colorMode: (a, b, c, d) => colorMode(a, b, c, d),
      blendMode: (m) => blendMode(m),
      strokeWeight: (n) => strokeWeight(n),
      noFill: () => noFill(),
      noStroke: () => noStroke(),
      strokeCap: (c) => strokeCap(c),
      stroke: function () {
        stroke.apply(null, arguments);
      },
      fill: function () {
        fill.apply(null, arguments);
      },
      bezier: function () {
        bezier.apply(null, arguments);
      },
      beginShape: () => beginShape(),
      vertex: (x, y) => vertex(x, y),
      endShape: (m) => endShape(m),
    };
  }

  function silkHslToRgb(h, s, l, aHsl) {
    push();
    colorMode(HSL, 360, 100, 100, 100);
    const c = color(h, s, l, aHsl);
    const rr = red(c);
    const gg = green(c);
    const bb = blue(c);
    const aa = alpha(c);
    pop();
    return color(rr, gg, bb, aa);
  }

  function rndGaussian(r, mean, sd) {
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }

  function ellipsePoly(cx, cy, ew, eh, sides) {
    const n = Math.max(5, sides | 0);
    const poly = [];
    const rx = ew * 0.5;
    const ry = eh * 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TWO_PI;
      poly.push(createVector(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
    }
    return poly;
  }

  function deformOnce(poly, magnitudeScale, r) {
    const next = [];
    const sigmaCap = Math.max(0.8, C.speckleSizeMax * 0.55);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const mid = p5.Vector.lerp(a, b, 0.5);
      const edgeLen = p5.Vector.dist(a, b);
      const sigma = Math.min(edgeLen * magnitudeScale, sigmaCap);
      mid.x += rndGaussian(r, 0, sigma);
      mid.y += rndGaussian(r, 0, sigma);
      next.push(a.copy());
      next.push(mid);
    }
    return next;
  }

  function deformPoly(poly, rounds, magnitudeScale, r) {
    let current = poly.map((p) => p.copy());
    const n = Math.max(1, rounds | 0);
    for (let round = 0; round < n; round++) {
      const scale = magnitudeScale * lerp(1, 0.5, round / Math.max(1, n - 1));
      current = deformOnce(current, scale, r);
    }
    return current;
  }

  function fillPoly(d, poly) {
    if (!poly || poly.length < 3) return;
    d.beginShape();
    for (let i = 0; i < poly.length; i++) d.vertex(poly[i].x, poly[i].y);
    d.endShape(CLOSE);
  }

  function paintSpeckleField(d, r, count, paintFill, sizeMul) {
    const span = (a, b) => a + (b - a) * r();
    const sm = sizeMul != null && sizeMul > 0 ? sizeMul : 1;
    const shortSide = Math.min(d.w, d.h);
    const areaScale = (d.w * d.h) / C.refArea;
    const nHubs = Math.max(10, Math.round(C.hubCount * Math.sqrt(areaScale)));
    const baseRad = shortSide * C.hubRad;
    const hubs = [];
    let weightSum = 0;
    for (let h = 0; h < nHubs; h++) {
      const wgt = span(0.45, 1.85);
      weightSum += wgt;
      hubs.push({
        x: r() * d.w,
        y: r() * d.h,
        rad: baseRad * span(0.4, 1.85),
        wgt,
        weightSum,
      });
    }
    const pickHub = () => {
      const t = r() * weightSum;
      for (let h = 0; h < hubs.length; h++) {
        if (t <= hubs[h].weightSum) return hubs[h];
      }
      return hubs[hubs.length - 1];
    };
    const sizeOnce = () => {
      const t = Math.pow(r(), C.specklePower);
      return (C.speckleSizeMin + (C.speckleSizeMax - C.speckleSizeMin) * t) * sm;
    };
    const drawDot = (ox, oy) => {
      paintFill(span, r);
      const ew = sizeOnce();
      const eh = ew * span(0.35, 1.55);
      const sides = ew > 2.4 ? 9 : 7;
      let poly = ellipsePoly(ox, oy, ew, eh, sides);
      const rounds = ew < 0.7 ? 1 : ew < 1.6 ? 2 : C.deformRounds;
      const mag = C.deformMag * (ew < 1 ? 0.75 : span(0.85, 1.2));
      poly = deformPoly(poly, rounds, mag, r);
      fillPoly(d, poly);
    };

    d.noStroke();
    for (let i = 0; i < count; i++) {
      let cx;
      let cy;
      if (r() < C.looseFrac) {
        cx = r() * d.w;
        cy = r() * d.h;
      } else {
        const hub = pickHub();
        const ang = r() * TWO_PI;
        const dist = hub.rad * Math.pow(r(), 0.42) * span(0.55, 1.25);
        cx = hub.x + Math.cos(ang) * dist;
        cy = hub.y + Math.sin(ang) * dist;
      }
      const micro = r() < C.microClump ? Math.floor(span(2, 6.99)) : 1;
      const microSpread = span(1.2, 9) * (micro > 1 ? 1 : 0.2);
      for (let k = 0; k < micro; k++) {
        drawDot(cx + (r() - 0.5) * microSpread, cy + (r() - 0.5) * microSpread);
      }
    }
  }

  function drawLinesPencil(r, loops, pad, span) {
    if (
      typeof MixPencilStroke === "undefined" ||
      typeof MixPencilStroke.strokeScreenPolyline !== "function"
    ) {
      return false;
    }
    if (!MixPencilStroke.ensure(width, height)) return false;
    const sw = Math.max(0.01, C.pencilSw);
    const nLight = Math.max(400, Math.round(loops * 0.18 * (1 - C.blackChance)));
    const nBlack = Math.max(24, Math.round(loops * C.blackChance));

    MixPencilStroke.clear();
    for (let i = 0; i < nLight; i++) {
      const col = silkHslToRgb(C.h, C.s, span(C.lMin, C.lMax), span(C.aMin, C.aMax));
      const pts = sampleBezier(
        span(-pad, width + pad),
        span(-pad, height + pad),
        span(-pad, width + pad),
        span(-pad, height + pad),
        span(-pad, width + pad),
        span(-pad, height + pad),
        span(-pad, width + pad),
        span(-pad, height + pad),
        8
      );
      if (pts.length >= 2) MixPencilStroke.strokeScreenPolyline(pts, sw, col);
    }
    MixPencilStroke.blit();

    MixPencilStroke.clear();
    const blackA = Math.round(255 * Math.max(0, Math.min(1, C.pencilBlackA)));
    for (let i = 0; i < nBlack; i++) {
      const lHsl = span(0, C.blackLMax);
      const gray = Math.round((lHsl / 100) * 255);
      const col = color(gray, gray, gray, blackA);
      const x0 = r() * width;
      const y0 = r() * height;
      const len = span(width * C.blackLenMin, width * C.blackLenMax);
      const ang = r() * TWO_PI;
      const bend = span(-C.blackBend, C.blackBend);
      const x3 = x0 + Math.cos(ang) * len;
      const y3 = y0 + Math.sin(ang) * len;
      const mx = (x0 + x3) * 0.5;
      const my = (y0 + y3) * 0.5;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const off = len * bend;
      const pts = sampleBezier(
        x0,
        y0,
        mx + nx * off * 0.6,
        my + ny * off * 0.6,
        mx + nx * off,
        my + ny * off,
        x3,
        y3,
        10
      );
      if (pts.length >= 2) MixPencilStroke.strokeScreenPolyline(pts, sw, col);
    }
    MixPencilStroke.blit();
    return true;
  }

  function drawLinesBezier(d, r, loops, pad, span) {
    d.push();
    d.colorMode(HSL, 360, 100, 100, 100);
    d.blendMode(BLEND);
    d.strokeWeight(C.weight);
    d.noFill();
    d.strokeCap(ROUND);
    for (let i = 0; i < loops; i++) {
      if (r() < C.blackChance) {
        d.stroke(0, 0, span(0, C.blackLMax), span(C.blackAMin, C.blackAMax));
        const x0 = r() * d.w;
        const y0 = r() * d.h;
        const len = span(d.w * C.blackLenMin, d.w * C.blackLenMax);
        const ang = r() * TWO_PI;
        const bend = span(-C.blackBend, C.blackBend);
        const x3 = x0 + Math.cos(ang) * len;
        const y3 = y0 + Math.sin(ang) * len;
        const mx = (x0 + x3) * 0.5;
        const my = (y0 + y3) * 0.5;
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const off = len * bend;
        d.bezier(
          x0,
          y0,
          mx + nx * off * 0.6,
          my + ny * off * 0.6,
          mx + nx * off,
          my + ny * off,
          x3,
          y3
        );
      } else {
        d.stroke(C.h, C.s, span(C.lMin, C.lMax), span(C.aMin, C.aMax));
        d.bezier(
          span(-pad, d.w + pad),
          span(-pad, d.h + pad),
          span(-pad, d.w + pad),
          span(-pad, d.h + pad),
          span(-pad, d.w + pad),
          span(-pad, d.h + pad),
          span(-pad, d.w + pad),
          span(-pad, d.h + pad)
        );
      }
    }
    d.pop();
  }

  function drawSpeckles(d, r) {
    const areaScale = (d.w * d.h) / C.refArea;
    const count = Math.max(400, Math.round(C.speckleCount * areaScale));
    d.push();
    d.colorMode(HSL, 360, 100, 100, 100);
    d.blendMode(BLEND);
    paintSpeckleField(
      d,
      r,
      count,
      (span) => {
        d.fill(C.h, C.s, span(C.lMin, C.lMax), span(C.aMin, C.aMax) * span(0.85, 1.4));
      },
      C.speckleWhiteMul
    );
    d.pop();
  }

  function drawBlackSpeckles(d, r) {
    const areaScale = (d.w * d.h) / C.refArea;
    const count = Math.max(1, Math.round(C.blackSpeckleCount * areaScale));
    d.push();
    d.colorMode(HSL, 360, 100, 100, 100);
    d.blendMode(BLEND);
    paintSpeckleField(d, r, count, (span) => {
      d.fill(0, 0, span(0, C.blackLMax), span(C.blackAMin, C.blackAMax) * span(0.85, 1.4));
    });
    d.pop();
  }

  /** 畫在目前 renderer；第二參為 p5.Graphics 時只走 Bézier 進離屏層 */
  function paint(seedVal, target) {
    const seed = seedVal >>> 0 || 1;
    const d = makeDraw(target);
    const r = makeLcg(seed ^ 0x51a1c001);
    const areaScale = (d.w * d.h) / C.refArea;
    const loops = Math.max(2000, Math.round(C.loops * areaScale));
    const pad = C.pad;
    const span = (a, b) => a + (b - a) * r();
    if (!target) {
      const ok = drawLinesPencil(r, loops, pad, span);
      if (!ok) drawLinesBezier(d, r, loops, pad, span);
    } else {
      drawLinesBezier(d, r, loops, pad, span);
    }
    drawSpeckles(d, makeLcg(seed ^ 0x5eec1e));
    drawBlackSpeckles(d, makeLcg(seed ^ 0xb1ac5e));
  }

  return { paint, C };
})();
