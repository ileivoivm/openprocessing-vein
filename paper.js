/**
 * paper.js — 紙紋（抽出自 city-buildings.createPaperTexture）
 *
 * 小圓刷點陣 stamp，noise 錯開縱向，MULTIPLY 叠在紙底上。
 * 合景紙紋 seed 固定（與場景 seed 脫鉤）；此範例預設同語意。
 */
"use strict";

const PaperTexture = (() => {
  const FIXED_SEED = 1223457;

  function makeLcg(seedVal) {
    let s = seedVal >>> 0;
    if (s === 0) s = 1;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function create(brushSize, brushSpan, rnd, w, h) {
    const tw = w || width;
    const th = h || height;
    const tau = typeof TAU !== "undefined" ? TAU : TWO_PI;
    const brush = createGraphics(brushSize, brushSize);
    brush.pixelDensity(1);
    brush.clear();
    brush.noFill();
    brush.translate(brushSize / 2, brushSize / 2);
    for (let i = 0; i < 100; i++) {
      brush.stroke(rnd() * 90 + 30, 3 + rnd() * 5);
      const r = rnd() * (brushSize / 2);
      const ang = rnd() * tau;
      brush.point(r * Math.cos(ang), r * Math.sin(ang));
    }

    const tex = createGraphics(tw, th);
    tex.pixelDensity(1);
    tex.clear();
    const stepX = Math.max(0.5, tw / 1000);
    for (let i = -brushSize; i < tw + brushSize; i += stepX) {
      for (let j = -brushSize; j < th + brushSpan; j += brushSpan) {
        const n = noise(i / 10, j / 10);
        tex.image(brush, i, j + (n - 0.5) * 20);
      }
    }
    brush.remove();
    return tex;
  }

  function bakeOpts(opts) {
    const o = opts || {};
    const intensity = Math.max(0.1, o.intensity != null ? Number(o.intensity) : 1);
    const paperSeed =
      o.paperSeed != null && Number.isFinite(Number(o.paperSeed))
        ? Number(o.paperSeed) >>> 0 || 1
        : FIXED_SEED;
    const brushSize = Math.round(constrain(155 * Math.sqrt(intensity), 60, 220));
    const brushSpan = Math.max(8, Math.round(26 / Math.sqrt(Math.min(intensity, 2.5))));
    return { intensity, paperSeed, brushSize, brushSpan, w: o.w, h: o.h };
  }

  /**
   * @param {{intensity?:number, paperSeed?:number, w?:number, h?:number}} [opts]
   */
  function bake(opts) {
    const o = bakeOpts(opts);
    const rnd = makeLcg(o.paperSeed);
    noiseSeed(o.paperSeed);
    return create(o.brushSize, o.brushSpan, rnd, o.w, o.h);
  }

  /**
   * @param {{intensity?:number, paperSeed?:number}} [opts]
   */
  function paint(opts) {
    const tex = bake(opts);
    push();
    blendMode(MULTIPLY);
    imageMode(CORNER);
    image(tex, 0, 0);
    pop();
    if (typeof tex.remove === "function") tex.remove();
  }

  return { FIXED_SEED, bake, paint };
})();
