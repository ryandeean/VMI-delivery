/* It Couldn't Be Done: kinetic typography, Edgar Guest (1917).
   Every frame is a pure function of time: window.renderFrame(t) sets the
   whole scene, so the renderer can capture any frame in any order. */

// ---------------------------------------------------------------- core math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: t => t,
  inC: t => t * t * t,
  outC: t => 1 - Math.pow(1 - t, 3),
  ioC: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQ: t => t * t * t * t,
  outQ: t => 1 - Math.pow(1 - t, 5),
  inE: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outE: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  ioE: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outB: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBs: t => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
// progress of t through [a,b], eased
const P = (t, a, b, e = E.lin) => e(clamp((t - a) / (b - a)));
// damped spring impulse: 0 at t<=0, kicks to 1 and rings out
const spring = (t, f = 3.2, d = 6) => (t <= 0 ? 0 : Math.exp(-d * t) * Math.sin(t * f * Math.PI * 2));
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }

// ---------------------------------------------------------------- palettes
const C1 = { bg: '#0a0f15', bg2: '#17212c', ink: '#dfe6ee', dim: '#56657a', acc: '#8db4dc', line: '#243142' };
const C2 = { bg: '#1a0c07', bg2: '#46200f', ink: '#f8e9d6', dim: '#a07a5c', acc: '#ffb347', acc2: '#e4572e', cold: '#8d9aaa' };
const C3 = { bg: '#ffd60a', bg2: '#ffe45c', ink: '#0c0c0c', acc: '#ff3b00', dim: '#7d6a00' };

// S3 runs on a beat grid (138.46 bpm, six beats per line)
const BEAT = 60 / 138.4615;

// chapter boundaries
const T_S1 = 3.4, T_S2 = 26.3, T_S3 = 48.4, T_END = 78.0;

// ---------------------------------------------------------------- DOM helpers
const $ = id => document.getElementById(id);
const layer = $('layer'), cam = $('cam');
function div(parent, cls = 'grp', style = {}) {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, style);
  parent.appendChild(d);
  return d;
}
const vs = (w, wd) => `"wght" ${w}, "wdth" ${wd}`;
function fontStyle(el, o) {
  if (o.serif) { el.style.fontFamily = "'Instrument Serif', serif"; el.style.fontVariationSettings = 'normal'; }
  else if (o.mono) { el.style.fontFamily = "'JetBrains Mono', monospace"; }
  else if (o.wght !== undefined || o.wdth !== undefined || o.sans) {
    el.style.fontFamily = "'Archivo', sans-serif";
    el.style.fontVariationSettings = vs(o.wght ?? 800, o.wdth ?? 100);
  }
  if (o.ital !== undefined) el.style.fontStyle = o.ital ? 'italic' : 'normal';
  if (o.size !== undefined) el.style.fontSize = o.size + 'px';
  if (o.color !== undefined) el.style.color = o.color;
  if (o.ls !== undefined) el.style.letterSpacing = o.ls + 'em';
  if (o.stroke) { el.style.webkitTextStroke = o.stroke; }
}

/* T: a line of type. content is a string or an array of segments
   [{t:'text', ...styleOverrides}]. Characters and words are individually
   addressable. The anchor (ax, ay) sits exactly on (x, y). */
function T(parent, content, o = {}) {
  const el = document.createElement('div');
  el.className = 't';
  fontStyle(el, Object.assign({ sans: 1, wght: 800, wdth: 100, size: 120, color: '#fff', ital: false }, o));
  const x = o.x ?? 960, y = o.y ?? 540, ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.transformOrigin = `${ax * 100}% ${ay * 100}%`;
  const segs = typeof content === 'string' ? [{ t: content }] : content;
  const chars = [], words = [], wordEls = [];
  for (const seg of segs) {
    let text = seg.t;
    if (seg.upper ?? o.upper) text = text.toUpperCase();
    for (const part of text.split(/( )/)) {
      if (part === '') continue;
      if (part === ' ') {
        const sp = document.createElement('span');
        sp.className = 'sp';
        sp.textContent = ' ';
        fontStyle(sp, seg);
        el.appendChild(sp);
        continue;
      }
      const w = document.createElement('span');
      w.className = 'w';
      fontStyle(w, seg);
      const wc = [];
      for (const ch of part) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        w.appendChild(c);
        chars.push(c);
        wc.push(c);
      }
      el.appendChild(w);
      words.push(wc);
      wordEls.push(w);
    }
  }
  parent.appendChild(el);
  const obj = { el, chars, words, wordEls, x, y, ax, ay, o };
  obj.idx = new Map(chars.map((c, i) => [c, i]));
  place(obj);
  return obj;
}
function place(ob, p = {}) {
  const { x = 0, y = 0, s = 1, sx = 1, sy = 1, r = 0, op = 1, skx = 0 } = p;
  ob.el.style.transform = `translate(${x}px,${y}px) translate(${-ob.ax * 100}%,${-ob.ay * 100}%) rotate(${r}deg) skewX(${skx}deg) scale(${s * sx},${s * sy})`;
  ob.el.style.opacity = op;
}
function cs(c, p = {}) {
  const { x = 0, y = 0, s = 1, sx = 1, sy = 1, r = 0, op = 1 } = p;
  c.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s * sx},${s * sy})`;
  c.style.opacity = op;
}
function gtf(g, p = {}) {
  const { x = 0, y = 0, s = 1, sx = 1, sy = 1, r = 0, op = 1 } = p;
  g.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s * sx},${s * sy})`;
  g.style.opacity = op;
}
// local box of a run of characters inside a T (unaffected by transforms)
function cbox(ob, i0, i1) {
  const a = ob.chars[i0], b = ob.chars[i1];
  const left = a.offsetLeft, right = b.offsetLeft + b.offsetWidth;
  return { x: left, w: right - left, y: a.offsetTop, h: a.offsetHeight };
}
function wbox(ob, wi) { const w = ob.words[wi]; return cbox(ob, ob.idx.get(w[0]), ob.idx.get(w[w.length - 1])); }
function rule(parent, color, style = {}) { return div(parent, 'rule', Object.assign({ background: color }, style)); }
function rect(el, x, y, w, h, tf = '') {
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.width = Math.max(0, w) + 'px'; el.style.height = Math.max(0, h) + 'px';
  el.style.transform = tf;
}
function svg(parent, w = 1920, h = 1080) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ov');
  s.setAttribute('width', w); s.setAttribute('height', h);
  parent.appendChild(s);
  return s;
}
function path(s, stroke, width) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', width);
  p.setAttribute('stroke-linecap', 'round');
  s.appendChild(p);
  return p;
}
// draw-on for a path: frac 0..1
function draw(p, frac) {
  const L = p.getTotalLength();
  p.style.strokeDasharray = `${L} ${L}`;
  p.style.strokeDashoffset = L * (1 - frac);
}

// ---------------------------------------------------------------- timeline
const SHOTS = [], SFX = [], SHAKES = [], FLASHES = [];
function shot(start, end, build) {
  const el = div(layer, 'shot');
  const at = lt => start + lt;
  const s = { start, end, el, on: false };
  s.upd = build(el, at);
  SHOTS.push(s);
  return s;
}
const sfx = (t, type, gain = 1) => SFX.push({ t, type, gain });
const shake = (t, amp, decay = 9) => SHAKES.push([t, amp, decay]);
const flash = (t, amt, color = '#ffffff', dur = 0.35) => FLASHES.push([t, amt, color, dur]);

// simple per-char entrances used everywhere
function rise(ob, lt, t0, st = 0.022, dur = 0.5, dist = 1.05, e = E.outE) {
  const size = parseFloat(ob.el.style.fontSize);
  ob.chars.forEach((c, i) => {
    const q = P(lt, t0 + i * st, t0 + i * st + dur, e);
    cs(c, { y: (1 - q) * size * dist });
  });
}
function maskY(ob, top = -0.35, bot = 1.02) {
  ob.el.style.clipPath = `polygon(-60% ${top * 100}%, 160% ${top * 100}%, 160% ${bot * 100}%, -60% ${bot * 100}%)`;
}
function fadeChars(ob, lt, t0, st = 0.02, dur = 0.35, dy = 18, e = E.outC) {
  ob.chars.forEach((c, i) => {
    const q = P(lt, t0 + i * st, t0 + i * st + dur, e);
    cs(c, { y: (1 - q) * dy, op: q });
  });
}
function popWords(ob, lt, times, from = 1.25, dur = 0.22) {
  ob.words.forEach((w, wi) => {
    const t0 = times[wi] ?? times[times.length - 1];
    const q = P(lt, t0, t0 + dur, E.outE);
    w.forEach(c => cs(c, { s: lerp(from, 1, q), op: lt >= t0 ? 1 : 0 }));
  });
}
function wordsVisible(ob, lt, times) {
  ob.words.forEach((w, wi) => { const v = lt >= times[wi]; w.forEach(c => (c.style.opacity = v ? 1 : 0)); });
}

/* Frame: four walls. set(cx, cy, w, h, {thk, op, blast}) where blast > 0
   throws the walls outward, spinning. */
function Frame(parent, color, thk = 4) {
  const walls = [0, 1, 2, 3].map(() => rule(parent, color));
  return {
    walls,
    set(cx, cy, w, h, o = {}) {
      const t = o.thk ?? thk, op = o.op ?? 1, b = o.blast ?? 0;
      const L = cx - w / 2, Tp = cy - h / 2;
      const spin = [-1, 1, 1, -1];
      const off = [[0, -b], [0, b], [-b, 0], [b, 0]];
      const dims = [
        [L - t, Tp - t, w + 2 * t, t],
        [L - t, Tp + h, w + 2 * t, t],
        [L - t, Tp - t, t, h + 2 * t],
        [L + w, Tp - t, t, h + 2 * t],
      ];
      walls.forEach((d, i) => {
        rect(d, ...dims[i], `translate(${off[i][0] * (i < 2 ? 0.3 : 1)}px,${off[i][1] * (i < 2 ? 1 : 0.3)}px) rotate(${spin[i] * b * 0.04}deg)`);
        d.style.opacity = op;
      });
    },
  };
}

// a strike rule living inside a T, across chars i0..i1
function Strike(ob, i0, i1, color, thk) {
  const d = rule(ob.el, color);
  let box = null;
  return {
    el: d,
    set(frac, extra = 0) {
      if (!box || box.w <= 0) box = cbox(ob, i0, i1);
      const size = parseFloat(ob.el.style.fontSize);
      const pad = size * 0.06;
      rect(d, box.x - pad, box.y + box.h * 0.5 - thk / 2 + extra, (box.w + 2 * pad) * frac, thk);
    },
  };
}
// smile arc under a word, drawn in the T's local space
function Smile(ob, wi, color, width, depth = 0.22) {
  const s = svg(ob.el, 10, 10);
  const p = path(s, color, width);
  let ready = false;
  return {
    set(frac) {
      if (!ready && ob.el.offsetWidth > 0) {
        const b = wbox(ob, wi);
        const size = parseFloat(ob.el.style.fontSize);
        const y0 = b.y + b.h * 0.86;
        p.setAttribute('d', `M ${b.x - size * 0.05} ${y0} Q ${b.x + b.w / 2} ${y0 + size * depth} ${b.x + b.w + size * 0.05} ${y0 - size * 0.08}`);
        ready = true;
      }
      if (!ready) return;
      draw(p, frac);
      p.style.opacity = frac > 0 ? 1 : 0;
    },
  };
}
function wordCenter(ob, wi) {
  const b = wbox(ob, wi);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// line counter for the HUD
const LINE_STARTS = [];
const lineAt = t => LINE_STARTS.push(t);

// ================================================================ INTRO
shot(0, 3.45, (el, at) => {
  const lab = T(el, 'A poem by Edgar Guest, 1917', { mono: 1, upper: 1, size: 19, ls: 0.42, color: C1.dim, y: 372 });
  const title = T(el, 'It Couldn’t Be Done', { upper: 1, size: 150, wght: 900, wdth: 100, color: C1.ink, y: 500 });
  maskY(title, -0.2, 1.0);
  const base = rule(el, C1.dim);
  const fr = Frame(el, C1.acc, 3);
  sfx(at(0.3), 'rise', 0.5);
  sfx(at(1.95), 'whoosh', 0.7);
  sfx(at(2.62), 'slam', 1.0);
  shake(at(2.62), 9);
  sfx(at(3.05), 'swish', 0.6);
  return lt => {
    lab.chars.forEach((c, i) => (c.style.opacity = lt > 0.25 + i * 0.028 ? 1 : 0));
    place(lab, { op: 1 - P(lt, 2.85, 3.15) });
    rise(title, lt, 0.75, 0.035, 0.6, 1.05);
    const sq = P(lt, 1.95, 2.62, E.inQ);
    title.el.style.fontVariationSettings = vs(900, lerp(100, 62, sq));
    const col = P(lt, 3.0, 3.4, E.inE);
    place(title, { sy: 1 - col * 0.985 });
    const bw = 1100 * P(lt, 0.3, 1.1, E.outE);
    rect(base, 960 - bw / 2, 600, bw, 2);
    base.style.opacity = 1 - P(lt, 1.7, 2.0);
    const tw = title.el.offsetWidth;
    const w = lerp(1880, tw + 70, sq), h = lerp(1040, 200, sq) * (1 - col * 0.99);
    fr.set(960, 500, w, h, { op: P(lt, 1.7, 1.95), thk: 3 + 3 * sq });
  };
});

// ================================================================ STANZA 1: THE DOUBTERS
// L1 Somebody said that it couldn't be done
lineAt(T_S1);
shot(T_S1, 6.55, (el, at) => {
  const g = div(el);
  const rnd = mulberry(7);
  const mur = [];
  for (let i = 0; i < 22; i++) {
    const m = T(g, 'somebody', {
      size: 22 + rnd() * 30, wght: 300 + rnd() * 300, wdth: 62 + rnd() * 40, color: C1.dim,
      x: 120 + rnd() * 1680, y: 90 + rnd() * 900, ital: rnd() > 0.6,
    });
    m.seed = rnd();
    mur.push(m);
  }
  const a = T(g, 'Somebody said', { size: 74, wght: 500, wdth: 78, color: C1.ink, y: 300 });
  const b = T(g, 'that it', { serif: 1, ital: 1, size: 70, color: C1.acc, y: 392 });
  const c = T(g, 'couldn’t be done', { upper: 1, size: 150, wght: 900, wdth: 125, color: C1.ink, y: 590 });
  maskY(c, -0.2, 1.0);
  const fr = Frame(g, C1.acc, 4);
  sfx(at(1.35), 'whoosh', 0.6);
  sfx(at(1.72), 'slam', 1.0);
  shake(at(1.72), 10);
  sfx(at(2.9), 'swish', 0.8);
  return lt => {
    mur.forEach((m, i) => {
      const t0 = 0.02 + i * 0.035;
      const on = P(lt, t0, t0 + 0.2);
      const flick = 0.55 + 0.45 * Math.sin(lt * 9 + m.seed * 20);
      const pull = P(lt, 0.2, 2.2, E.ioC) * 0.22;
      const dx = (960 - m.x) * pull, dy = (560 - m.y) * pull;
      place(m, { x: dx, y: dy, op: on * flick * 0.9 * (1 - P(lt, 1.5, 1.9)) });
    });
    popWords(a, lt, [0.15, 0.4], 1.18);
    fadeChars(b, lt, 0.62, 0.03);
    rise(c, lt, 0.9, 0.018, 0.45);
    const sq = P(lt, 1.3, 1.72, E.inQ);
    c.el.style.fontVariationSettings = vs(900, lerp(125, 62, sq));
    const tw = c.el.offsetWidth;
    fr.set(960, 590, lerp(1900, tw + 80, sq), lerp(900, 210, sq), { op: P(lt, 1.1, 1.3), thk: 4 });
    const settle = spring(lt - 1.72, 3, 7) * 0.012;
    place(c, { sx: 1 - settle });
    gtf(g, { x: -1920 * P(lt, 2.9, 3.15, E.inE) });
  };
});

// L2 But he with a chuckle replied
lineAt(6.3);
shot(6.3, 9.25, (el, at) => {
  const g = div(el);
  const a = T(g, 'But he', { upper: 1, size: 120, wght: 800, wdth: 62, color: C1.ink, y: 350 });
  const b = T(g, 'with a chuckle', { serif: 1, ital: 1, size: 180, color: C1.acc, y: 545 });
  const c = T(g, 'replied', { size: 88, wght: 300, wdth: 100, color: C1.ink, y: 740 });
  [0.95, 1.2, 1.45].forEach(t => sfx(at(t), 'tick', 0.5));
  sfx(at(2.7), 'swish', 0.7);
  return lt => {
    gtf(g, { x: 1920 * (1 - P(lt, 0, 0.28, E.outE)), y: -1080 * P(lt, 2.7, 2.95, E.inE) });
    b.chars.forEach((ch, i) => {
      const q = P(lt, 0.35 + i * 0.03, 0.75 + i * 0.03, E.outBs);
      const hopT = lt - 0.95;
      const hop = hopT > 0 ? Math.max(0, Math.sin(hopT * Math.PI * 2 * 2.1 - i * 0.5)) * 26 * (1 - P(lt, 0.95, 2.1)) : 0;
      cs(ch, { y: (1 - q) * 40 - hop, op: clamp(q * 1.5), r: hop * -0.25 });
    });
    const q = P(lt, 1.15, 1.65, E.outE);
    c.el.style.letterSpacing = lerp(0.7, 0.06, q) + 'em';
    place(c, { op: q });
  };
});

// L3 That "maybe it couldn't," but he would be one
lineAt(9.0);
shot(9.0, 12.25, (el, at) => {
  const g = div(el);
  const top = div(g);
  const that = T(top, 'That', { upper: 1, size: 64, wght: 600, wdth: 62, color: C1.dim, y: 262, ls: 0.12 });
  const ph = T(top, 'maybe it couldn’t,', { serif: 1, ital: 1, size: 140, color: C1.ink, y: 470 });
  const qL = T(top, '“', { serif: 1, size: 720, color: C1.acc, y: 700, ax: 1 });
  const qR = T(top, '”', { serif: 1, size: 720, color: C1.acc, y: 700, ax: 0 });
  const bh = T(g, 'but he would be', { size: 70, wght: 400, wdth: 80, color: C1.ink, y: 640 });
  const one = T(g, 'one', { upper: 1, size: 300, wght: 900, wdth: 62, color: C1.ink, y: 850 });
  sfx(at(0.1), 'whoosh', 0.5);
  sfx(at(1.5), 'click', 0.7);
  sfx(at(2.05), 'slam', 0.9);
  shake(at(2.05), 7);
  sfx(at(2.8), 'swish', 0.6);
  return lt => {
    gtf(g, { y: 1080 * (1 - P(lt, 0, 0.3, E.outE)), sx: 1 - P(lt, 2.8, 3.1, E.inE) * 0.995 });
    fadeChars(that, lt, 0.15, 0.04);
    fadeChars(ph, lt, 0.35, 0.025, 0.4, 24);
    const pw = ph.el.offsetWidth;
    const qin = P(lt, 0.1, 0.55, E.outE);
    const close = P(lt, 1.3, 1.55, E.inQ);
    const gap = lerp(260, 20, close);
    place(qL, { x: -pw / 2 - gap + (1 - qin) * -500, op: qin });
    place(qR, { x: pw / 2 + gap + (1 - qin) * 500, op: qin });
    const up = P(lt, 1.55, 1.95, E.ioE);
    gtf(top, { y: -120 * up, s: 1 - 0.18 * up });
    top.style.transformOrigin = '960px 470px';
    popWords(bh, lt, [1.7, 1.78, 1.86, 1.94], 1.12);
    const oq = P(lt, 2.05, 2.25, E.outE);
    place(one, { s: lerp(1.35, 1, oq), op: lt >= 2.05 ? 1 : 0 });
    const dimOthers = P(lt, 2.1, 2.4);
    top.style.opacity = 1 - 0.55 * dimOthers;
    bh.el.style.opacity = 1 - 0.55 * dimOthers;
  };
});

// L4 Who wouldn't say so till he'd tried.
lineAt(12.0);
shot(12.0, 14.95, (el, at) => {
  const g = div(el);
  const a = T(g, 'Who wouldn’t', { upper: 1, size: 150, wght: 900, wdth: 62, color: C1.ink, y: 330 });
  const b = T(g, 'say so', { upper: 1, size: 150, wght: 900, wdth: 62, color: C1.ink, y: 510 });
  const c = T(g, [
    { t: 'till he’d ', serif: 1, ital: 1, size: 120, color: C1.acc },
    { t: 'TRIED.', sans: 1, wght: 900, wdth: 62, size: 160, color: C1.ink },
  ], { y: 725 });
  maskY(a, -0.2, 1.0); maskY(b, -0.2, 1.0);
  const st = Strike(b, 0, b.chars.length - 1, C1.ink, 12);
  sfx(at(0.85), 'strike', 1.0);
  sfx(at(1.75), 'slam', 1.0);
  shake(at(1.75), 11);
  sfx(at(2.65), 'drop', 0.7);
  const rnd = mulberry(11);
  const all = [...a.chars, ...b.chars, ...c.chars];
  const fall = all.map(() => [rnd(), rnd()]);
  return lt => {
    rise(a, lt, 0.0, 0.02, 0.4);
    rise(b, lt, 0.28, 0.025, 0.4);
    st.set(P(lt, 0.85, 1.1, E.outE));
    b.el.style.color = mix(C1.ink, C1.dim, P(lt, 1.0, 1.3));
    const seg1 = c.words[0].length + c.words[1].length;
    c.chars.forEach((ch, i) => {
      if (i < seg1) { const q = P(lt, 1.25 + i * 0.03, 1.6 + i * 0.03, E.outC); cs(ch, { y: (1 - q) * 20, op: q }); }
    });
    const tq = P(lt, 1.75, 1.92, E.outE);
    c.words[2].forEach(ch => cs(ch, { s: lerp(1.9, 1, tq), op: lt >= 1.75 ? 1 : 0 }));
    // drop out
    if (lt > 2.6) {
      all.forEach((ch, i) => {
        const tt = Math.max(0, lt - 2.6 - fall[i][0] * 0.12);
        const base = ch.style.transform;
        ch.style.transform = base + ` translateY(${0.5 * 5200 * tt * tt}px) rotate(${(fall[i][1] - 0.5) * 60 * tt}deg)`;
      });
      st.el.style.opacity = 1 - P(lt, 2.6, 2.75);
    }
  };
});

// L5 So he buckled right in with the trace of a grin
lineAt(14.7);
shot(14.7, 17.5, (el, at) => {
  const g = div(el);
  const a = T(g, 'So he buckled right in', { upper: 1, size: 130, wght: 900, wdth: 62, color: C1.ink, y: 430 });
  const b = T(g, [
    { t: 'with the ', color: C1.dim },
    { t: 'trace', color: 'transparent', stroke: `1.6px ${C1.ink}` },
    { t: ' of a ', color: C1.dim },
    { t: 'grin', color: C1.acc },
  ], { serif: 1, ital: 1, size: 116, y: 640 });
  const sm = Smile(b, 5, C1.acc, 5, 0.2);
  const lock = rule(g, C1.acc);
  sfx(at(0.05), 'whoosh', 0.7);
  sfx(at(0.5), 'click', 1.1);
  shake(at(0.5), 6);
  sfx(at(1.5), 'swish', 0.5);
  return lt => {
    const q = P(lt, 0, 0.5, E.ioE);
    a.words.forEach((w, wi) => {
      const dir = wi < 3 ? -1 : 1;
      const sq = spring(lt - 0.5, 4, 9) * 10;
      w.forEach(c => cs(c, { x: dir * (1 - q) * 1300 + dir * -sq }));
    });
    // buckle pin: a short vertical tick at the join
    if (lt > 0.5) {
      const j = wbox(a, 3);
      const k = P(lt, 0.5, 0.8, E.outE);
      const x = 960 - a.el.offsetWidth / 2 + j.x - 22;
      rect(lock, x - 3, 430 - 110 * k, 6, 220 * k);
      lock.style.opacity = 1 - P(lt, 0.9, 1.3);
    } else lock.style.opacity = 0;
    b.words.forEach((w, wi) => {
      const t0 = 0.85 + wi * 0.09;
      w.forEach(c => { const qq = P(lt, t0, t0 + 0.35, E.outC); cs(c, { y: (1 - qq) * 22, op: qq }); });
    });
    // trace: the outline fills in partly, as if being traced over
    const tr = P(lt, 1.3, 2.0);
    b.words[2].forEach((c, i) => { c.style.color = rgba(C1.ink, P(tr, i * 0.15, i * 0.15 + 0.4) * 0.25); });
    sm.set(P(lt, 1.5, 1.95, E.ioC));
    gtf(g, { y: -40 * P(lt, 2.55, 2.8, E.inC), op: 1 - P(lt, 2.55, 2.8) });
  };
});

// L6 On his face. If he worried he hid it.
lineAt(17.5);
shot(17.5, 20.3, (el, at) => {
  const g = div(el);
  const a = T(g, 'On his face.', { size: 78, wght: 400, wdth: 100, color: C1.ink, y: 320 });
  const b = T(g, 'If he worried', { upper: 1, size: 180, wght: 900, wdth: 62, color: C1.ink, y: 525 });
  const c = T(g, 'he hid it.', { serif: 1, ital: 1, size: 124, color: C1.acc, y: 735 });
  const bar = rule(b.el, C1.ink);
  const rnd = mulberry(5);
  const jit = b.chars.map(() => [rnd() * 100, rnd() * 100]);
  sfx(at(0.45), 'tick', 0.6);
  sfx(at(0.6), 'tremble', 0.8);
  sfx(at(1.45), 'swipe', 1.0);
  sfx(at(2.55), 'riser', 0.8);
  return lt => {
    fadeChars(a, lt, 0.0, 0.03);
    const times = [0.45, 0.55, 0.68];
    b.words.forEach((w, wi) => {
      w.forEach(ch => {
        const i = b.idx.get(ch);
        const on = lt >= times[wi];
        const tr = wi === 2 && lt > 0.68 && lt < 1.75 ? 1 : 0;
        const k = tr * (0.4 + 0.6 * P(lt, 0.7, 1.4));
        cs(ch, {
          x: Math.sin(lt * 53 + jit[i][0]) * 3.2 * k,
          y: Math.sin(lt * 61 + jit[i][1]) * 3.2 * k,
          r: Math.sin(lt * 47 + jit[i][0]) * 2.2 * k,
          op: on ? 1 : 0,
        });
      });
    });
    const wb = wbox(b, 2);
    const pad = 16;
    const f = P(lt, 1.45, 1.75, E.ioE);
    rect(bar, wb.x - pad, wb.y + wb.h * 0.14, (wb.w + 2 * pad) * f, wb.h * 0.72);
    fadeChars(c, lt, 1.75, 0.035, 0.35, 22);
    gtf(g, { s: 1 + 0.03 * P(lt, 0, 2.8), op: 1 - P(lt, 2.6, 2.8) });
  };
});

/* ================================================================ REFRAIN
   The hook. Same choreography every time, escalating:
   A: the line sings, riding a travelling sine wave that draws itself.
   B: TACKLED flies in and knocks THE THING off its footing.
   C: the doubters' box returns around the impossible phrase; the negation
      gets struck through and the box is blown apart.
   D: the answer lands as one lockup with a flash. */
function refrain(start, end, cfg) {
  const k = cfg.k, pal = cfg.pal;
  const { A, B, C, D } = cfg.times;
  lineAt(start + A);
  lineAt(start + C);
  shot(start, end, (el, at) => {
    const ga = div(el), gb = div(el), gc = div(el), gd = div(el);
    // A
    const la = T(ga, [
      { t: cfg.a[0] + ' ', sans: 1, wght: 500, wdth: cfg.wdth, size: 78 * k, color: pal.ink },
      { t: cfg.a[1], serif: 1, ital: 1, size: 200 * k, color: pal.acc },
    ], { y: 470 });
    const wv = svg(ga);
    const wpath = path(wv, pal.acc, 3 + k);
    // B
    const lb = T(gb, [
      { t: cfg.b[0] + ' ', serif: 1, ital: 1, size: 96 * k, color: pal.ink },
      { t: cfg.b[1] + ' ', sans: 1, wght: 900, wdth: 125, size: 150 * k, color: pal.hit, upper: 1 },
      { t: cfg.b[2], sans: 1, wght: 900, wdth: 62, size: 150 * k, color: pal.ink, upper: 1 },
    ], { y: 610 });
    const nPre = cfg.b[0].split(' ').length;
    const nThing = cfg.b[2].split(' ').length;
    // C
    const lc1 = T(gc, cfg.c[0], { upper: 1, size: 64 * k, wght: 600, wdth: 62, color: pal.dim, y: 540 - 150 * k, ls: 0.12 });
    const lc = T(gc, cfg.c[1], { upper: 1, size: 150 * k, wght: 900, wdth: 62, color: pal.ink, y: 540 });
    maskY(lc, -0.2, 1.0);
    const fr = Frame(gc, pal.box, 4 + k);
    const st = Strike(lc, cfg.strike[0], cfg.strike[1], pal.hit, 12 * k);
    // D
    let ld1, ld2, rays;
    if (cfg.d) {
      if (cfg.rays) {
        rays = div(gd, 'full');
        rays.style.background = `repeating-conic-gradient(from 0deg at 50% 50%, ${rgba(cfg.rays, 0.22)} 0deg 5deg, transparent 5deg 15deg)`;
        rays.style.transformOrigin = '960px 540px';
      }
      ld1 = T(gd, cfg.d[0], { serif: 1, ital: 1, size: 118 * k, color: pal.acc, y: 390 });
      ld2 = T(gd, cfg.d[1], { upper: 1, size: 250 * k, wght: 900, wdth: 125, color: pal.ink, y: 610 });
    }
    // sound + shakes
    sfx(at(A + 0.05), 'sing', 0.9 * k);
    sfx(at(B + 0.12), 'whoosh', 0.9);
    sfx(at(B + 0.34), 'slam', 1.2 * k);
    shake(at(B + 0.34), 14 * k);
    sfx(at(C - 0.25), 'swish', 0.7);
    sfx(at(C + 0.42), 'slam', 0.8);
    shake(at(C + 0.42), 6);
    sfx(at(C + 0.62), 'strike', 1.1);
    sfx(at(C + 0.95), 'shatter', 1.0 * k);
    shake(at(C + 0.95), 10 * k);
    if (cfg.d) {
      sfx(at(D), 'boom', 1.0 * k);
      shake(at(D), 20 * k, 7);
      flash(at(D), cfg.flash ?? 0.85, cfg.flashColor ?? '#ffffff', 0.4);
    }
    let cx = null, fitB = 1, fitC = 1, fitD = 1;
    const lam = 560, omega = Math.PI * 2 * 1.15;
    const fit = ob => Math.min(1, 1720 / Math.max(1, ob.el.offsetWidth));
    return (lt, t) => {
      // ---- A: sing
      if (cx === null) {
        fitB = fit(lb);
        fitC = fit(lc);
        if (ld2) fitD = fit(ld2);
        const W0 = la.el.offsetWidth;
        cx = la.chars.map(c => 960 - W0 / 2 + c.offsetLeft + c.offsetWidth / 2);
      }
      const amp = (10 + 14 * k) * P(lt, A + 0.1, A + 1.0, E.ioC);
      la.chars.forEach((c, i) => {
        const q = P(lt, A + i * 0.028, A + i * 0.028 + 0.4, E.outC);
        const wy = amp * Math.sin((2 * Math.PI * cx[i]) / lam - omega * lt);
        cs(c, { y: wy + (1 - q) * 40, op: q, r: -amp * 0.12 * Math.cos((2 * Math.PI * cx[i]) / lam - omega * lt) });
      });
      const drawn = P(lt, A + 0.05, A + 1.2, E.ioC);
      const y0 = 470 + 150 * k;
      let d = '';
      for (let x = 0; x <= 1920 * drawn; x += 10) {
        const y = y0 + amp * 0.9 * Math.sin((2 * Math.PI * x) / lam - omega * lt + 0.6);
        d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      }
      wpath.setAttribute('d', d || 'M0 0');
      const upA = P(lt, B - 0.12, B + 0.2, E.ioE);
      gtf(ga, { y: -235 * upA - 800 * P(lt, C - 0.3, C, E.inE), s: 1 - 0.25 * upA });
      ga.style.transformOrigin = '960px 470px';
      ga.style.display = lt < C ? 'block' : 'none';
      // ---- B: tackle
      const hit = B + 0.34;
      lb.words.forEach((w, wi) => {
        let p;
        if (wi < nPre) {
          const q = P(lt, B + 0.1 + wi * 0.06, B + 0.35 + wi * 0.06, E.outC);
          p = { y: (1 - q) * 20, op: q };
        } else if (wi === nPre) {
          const q = P(lt, B + 0.12, hit, E.inC);
          const rec = spring(lt - hit, 2.5, 8) * -30 * k;
          p = { x: (1 - q) * -2100 + rec, op: lt > B + 0.12 ? 1 : 0, sx: 1 + (lt > hit ? spring(lt - hit, 3, 10) * 0.12 : 0) };
        } else {
          const ap = P(lt, B + 0.12, B + 0.3, E.outC);
          const kn = lt > hit ? Math.exp(-(lt - hit) * 3) : 0;
          const sp = spring(lt - hit, 1.7, 5);
          const j = wi - nPre - 1;
          p = { x: (60 + j * 40) * k * (kn * 0.6 + sp * 0.8), y: -22 * k * sp * (j + 1), r: (5 + j * 4) * sp, op: ap };
        }
        w.forEach(c => cs(c, p));
      });
      place(lb, { s: fitB });
      gtf(gb, { y: -900 * P(lt, C - 0.3, C, E.inE) });
      gb.style.display = lt >= B && lt < C ? 'block' : 'none';
      // ---- C: box, strike, blast
      gc.style.display = lt >= C - 0.05 && (!cfg.d || lt < D + 0.1) ? 'block' : 'none';
      fadeChars(lc1, lt, C - 0.05, 0.03);
      rise(lc, lt, C - 0.05, 0.018, 0.35);
      const sq = P(lt, C + 0.1, C + 0.42, E.inQ);
      const tw = lc.el.offsetWidth;
      const blast = P(lt, C + 0.95, C + 1.6, E.outE) * 1400;
      fr.set(960, 540, lerp(1800, tw * fitC + 80 * k, sq), lerp(900, 205 * k * fitC, sq), { op: P(lt, C - 0.05, C + 0.1) * (1 - P(lt, C + 1.2, C + 1.5)), blast });
      st.set(P(lt, C + 0.62, C + 0.82, E.outE));
      const push = P(lt, C + 0.95, C + 1.2, E.outE);
      place(lc, { s: fitC * (1 + spring(lt - (C + 0.95), 2.4, 7) * 0.06 + push * 0.04) });
      if (cfg.d) gtf(gc, { y: -120 * P(lt, D - 0.5, D - 0.2, E.inC), op: 1 - P(lt, D - 0.45, D - 0.2) });
      else gtf(gc, { s: 1 + 0.05 * P(lt, C + 1.2, end - start), op: 1 - P(lt, end - start - 0.2, end - start) });
      // ---- D: the answer
      if (cfg.d) {
        gd.style.display = lt >= D - 0.2 ? 'block' : 'none';
        fadeChars(ld1, lt, D - 0.2, 0.03, 0.25, 20);
        const q = P(lt, D, D + 0.2, E.outE);
        const hold = lt - D;
        place(ld2, { s: fitD * lerp(2.6, 1, q) * (1 + 0.012 * P(hold, 0.2, 2.5)), op: lt >= D ? 1 : 0 });
        if (rays) { gtf(rays, { r: hold * 12, s: 1 + P(hold, 0, 0.5, E.outE) * 0.5, op: P(hold, 0, 0.15) }); }
        if (cfg.dOut) {
          gtf(gd, { y: cfg.dOut.y * P(lt, cfg.dOut.t, cfg.dOut.t + 0.3, E.inE), op: 1 - P(lt, cfg.dOut.t + 0.1, cfg.dOut.t + 0.3) });
        }
      }
    };
  });
}

refrain(20.3, 26.4, {
  k: 1, wdth: 80,
  pal: { ink: C1.ink, acc: C1.acc, hit: '#ffffff', dim: C1.dim, box: C1.acc },
  a: ['He started to', 'sing'],
  b: ['as he', 'tackled', 'the thing'],
  c: ['That', 'couldn’t be done,'],
  strike: [5, 7],
  d: ['and he', 'did it!'],
  times: { A: 0, B: 1.5, C: 3.0, D: 4.35 },
  flash: 0.65,
});

// chapter wipe: S1 to S2, a warm band sweeps up through frame
shot(25.95, 26.7, (el, at) => {
  const band = rule(el, C2.acc2);
  const edge = rule(el, C2.acc);
  sfx(at(0.0), 'whoosh', 1.0);
  return lt => {
    const q = P(lt, 0, 0.7, E.ioE);
    const y = lerp(1080, -1300, q);
    rect(band, 0, y, 1920, 1300);
    rect(edge, 0, y - 26, 1920, 26);
  };
});

// ================================================================ STANZA 2: THE SHIFT
// L9 Somebody scoffed: "Oh, you'll never do that;
lineAt(T_S2);
shot(T_S2, 29.05, (el, at) => {
  const g = div(el);
  const a = T(g, 'Somebody scoffed:', { size: 72, wght: 500, wdth: 62, color: C2.cold, y: 290 });
  const b = T(g, '“Oh, you’ll', { serif: 1, ital: 1, size: 118, color: C2.cold, y: 460 });
  const c = T(g, 'never do that;', { upper: 1, size: 200, wght: 900, wdth: 62, color: C2.cold, y: 690 });
  sfx(at(0.95), 'slam', 1.0);
  shake(at(0.95), 10);
  sfx(at(1.2), 'click', 0.6);
  return lt => {
    a.chars.forEach((ch, i) => (ch.style.opacity = lt > 0.15 + i * 0.018 ? 1 : 0));
    fadeChars(b, lt, 0.5, 0.03, 0.3);
    c.words.forEach((w, wi) => {
      const t0 = wi === 0 ? 0.95 : 1.2 + (wi - 1) * 0.1;
      const q = P(lt, t0, t0 + 0.16, E.outE);
      w.forEach(ch => cs(ch, { s: lerp(wi === 0 ? 1.6 : 1.2, 1, q), op: lt >= t0 ? 1 : 0 }));
    });
    const out = P(lt, 2.35, 2.7, E.inC);
    gtf(g, { y: 70 * out, op: 1 - out });
  };
});

// L10 At least no one ever has done it;
lineAt(29.0);
shot(29.0, 31.65, (el, at) => {
  const g = div(el);
  const a = T(g, 'At least', { serif: 1, ital: 1, size: 88, color: C2.ink, y: 270 });
  const b = T(g, 'no one', { upper: 1, size: 190, wght: 900, wdth: 62, color: C2.cold, y: 435 });
  maskY(b, -0.2, 1.0);
  const evers = [];
  for (let j = 6; j >= 0; j--) evers[j] = T(g, 'ever', { upper: 1, size: 170, wght: 900, wdth: 62, color: C2.cold, y: 650 });
  const d = T(g, 'has done it;', { size: 92, wght: 300, wdth: 115, color: C2.ink, y: 870 });
  [0.7, 0.78, 0.86, 0.94, 1.02, 1.1, 1.18].forEach((t, j) => sfx(at(t), 'tick', 0.5 * Math.pow(0.8, j)));
  return lt => {
    fadeChars(a, lt, 0.05, 0.03);
    rise(b, lt, 0.25, 0.03, 0.4);
    evers.forEach((ev, j) => {
      const t0 = 0.7 + j * 0.08;
      const q = P(lt, t0, t0 + 0.3, E.outE);
      const side = j === 0 ? 0 : j % 2 ? -1 : 1, step = Math.ceil(j / 2);
      const drift = 1 + P(lt, 0.7, 2.6) * 0.12;
      let off = 0;
      for (let m = 1; m <= step; m++) off += 330 * Math.pow(0.78, m - 1) * 0.5 + 330 * Math.pow(0.78, m) * 0.5 + 18;
      place(ev, { x: side * off * drift * q, s: Math.pow(0.78, step), op: (lt >= t0 ? 1 : 0) * Math.pow(0.55, step) });
    });
    fadeChars(d, lt, 1.3, 0.03, 0.35, 16);
    gtf(g, { op: 1 - P(lt, 2.35, 2.62) });
  };
});

// L11 But he took off his coat and he took off his hat
lineAt(31.6);
shot(31.6, 35.05, (el, at) => {
  const g1 = div(el), g2 = div(el);
  g1.style.transformOrigin = '960px 400px';
  const a = T(g1, 'But he took off his', { size: 78, wght: 400, wdth: 100, color: C2.ink, y: 270 });
  const coatL = T(g1, 'coat', { upper: 1, size: 330, wght: 140, wdth: 125, color: C2.ink, y: 490 });
  const coatH = T(g1, 'coat', { upper: 1, size: 330, wght: 900, wdth: 125, color: C2.acc2, y: 490 });
  const capsL = T(g2, 'and he took off his hat', { upper: 1, size: 128, wght: 850, wdth: 62, color: C2.ink, y: 790 });
  const lowL = T(g2, [{ t: 'and he took off his ' }, { t: 'hat', color: C2.acc }], { size: 128, wght: 260, wdth: 112, color: C2.ink, y: 790 });
  maskY(capsL, -6, 1.0);
  const rnd = mulberry(3);
  const capR = capsL.chars.map(() => [rnd(), rnd(), rnd()]);
  const coatR = coatH.chars.map(() => [rnd(), rnd()]);
  sfx(at(0.3), 'slam', 0.8);
  sfx(at(0.8), 'drop', 1.0);
  sfx(at(1.75), 'whoosh', 0.5);
  sfx(at(2.35), 'lift', 1.0);
  sfx(at(3.1), 'swish', 0.5);
  return lt => {
    popWords(a, lt, [0, 0.07, 0.14, 0.21, 0.28], 1.1);
    const hq = P(lt, 0.3, 0.45, E.outE);
    coatH.chars.forEach((c, i) => {
      const tt = Math.max(0, lt - 0.8 - i * 0.07);
      cs(c, {
        y: 0.5 * 5200 * tt * tt,
        x: (coatR[i][0] - 0.5) * 300 * tt,
        r: (coatR[i][1] - 0.5) * 140 * tt,
        s: lerp(1.12, 1, hq),
        op: lt >= 0.3 ? 1 : 0,
      });
    });
    const lv = P(lt, 0.8, 1.2);
    place(coatL, { op: lv });
    coatL.el.style.fontVariationSettings = vs(lerp(900, 140, P(lt, 0.8, 1.5, E.outC)), 125);
    const up = P(lt, 1.6, 1.95, E.ioE);
    gtf(g1, { y: -110 * up, s: 1 - 0.2 * up, op: 1 - 0.5 * up });
    // caps on, then the caps fly off like hats
    const n = capsL.chars.length;
    capsL.chars.forEach((c, i) => {
      const q = P(lt, 1.75 + i * 0.012, 2.1 + i * 0.012, E.outE);
      const t0 = 2.3 + i * 0.03 + capR[i][2] * 0.05;
      const f = P(lt, t0, t0 + 0.55, E.inC);
      cs(c, { y: (1 - q) * 140 - f * 700, x: (capR[i][0] - 0.5) * 180 * f, r: (capR[i][1] - 0.5) * 120 * f, op: 1 - P(lt, t0 + 0.15, t0 + 0.5) });
    });
    lowL.chars.forEach((c, i) => {
      const t0 = 2.42 + i * 0.03;
      const q = P(lt, t0, t0 + 0.3, E.outC);
      cs(c, { y: (1 - q) * -30, op: q });
    });
    gtf(g2, { op: 1 - P(lt, 3.15, 3.4) });
    gtf(g1, { y: -110 * up, s: 1 - 0.2 * up, op: (1 - 0.5 * up) * (1 - P(lt, 3.15, 3.4)) });
  };
});

// L12 And the first thing we knew he'd begun it.
lineAt(35.0);
shot(35.0, 37.65, (el, at) => {
  const g = div(el);
  const a = T(g, 'And the first thing we knew', { size: 96, wght: 600, wdth: 110, color: C2.ink, y: 390 });
  const b = T(g, [{ t: 'HE’D ' }, { t: 'BEGUN', color: C2.acc }, { t: ' IT.' }], { size: 170, wght: 800, wdth: 125, color: C2.ink, y: 590 });
  maskY(b, -0.2, 1.0);
  const r = rule(g, C2.acc);
  const head = rule(g, C2.acc, { borderRadius: '50%' });
  const times = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88];
  times.forEach(t => sfx(at(t), 'tick', 0.55));
  sfx(at(1.2), 'whoosh', 0.6);
  sfx(at(1.35), 'riser', 0.7);
  return lt => {
    popWords(a, lt, times, 1.3, 0.2);
    rise(b, lt, 1.15, 0.02, 0.45);
    const w = 1920 * P(lt, 1.35, 2.65, E.inC);
    rect(r, 0, 732, w, 5);
    rect(head, w - 9, 725, 18, 18);
    head.style.opacity = lt > 1.35 ? 1 : 0;
    gtf(g, { op: 1 - P(lt, 2.4, 2.65) });
  };
});

// L13 With a lift of his chin and a bit of a grin,
lineAt(37.6);
shot(37.6, 40.35, (el, at) => {
  const g = div(el);
  const a = T(g, 'With a lift of his chin', { size: 112, wght: 500, wdth: 112, color: C2.ink, y: 420 });
  const b = T(g, [{ t: 'and a bit of a ' }, { t: 'grin,', color: C2.acc }], { serif: 1, ital: 1, size: 140, color: C2.ink, y: 640 });
  const sm = Smile(b, 5, C2.acc, 7, 0.24);
  sfx(at(0.55), 'lift', 0.7);
  sfx(at(0.9), 'click', 0.6);
  sfx(at(1.7), 'swish', 0.6);
  return lt => {
    fadeChars(a, lt, 0.0, 0.018, 0.3, 20);
    const lq = P(lt, 0.55, 0.9, E.outB);
    a.words[2].forEach(c => { c.style.transform += ` translateY(${-48 * lq}px)`; c.style.color = mix(C2.ink, C2.acc, P(lt, 0.55, 0.8)); });
    const ch = a.wordEls[5];
    ch.style.transformOrigin = '0% 85%';
    ch.style.transform = `rotate(${-13 * P(lt, 0.9, 1.25, E.outB)}deg)`;
    fadeChars(b, lt, 1.2, 0.022, 0.35, 22);
    sm.set(P(lt, 1.7, 2.15, E.ioC));
    gtf(g, { s: 1 + 0.025 * P(lt, 0, 2.7), op: 1 - P(lt, 2.5, 2.72) });
  };
});

// L14 Without any doubting or quiddit,
lineAt(40.3);
shot(40.3, 42.8, (el, at) => {
  const g = div(el);
  const a = T(g, 'Without any', { size: 104, wght: 200, wdth: 125, color: C2.ink, y: 320, ls: 0.04 });
  const b = T(g, 'doubting', { upper: 1, size: 200, wght: 900, wdth: 62, color: C2.cold, y: 530 });
  const c = T(g, 'or quiddit,', { serif: 1, ital: 1, size: 120, color: C2.cold, y: 740 });
  const rnd = mulberry(21);
  const R = b.chars.map(() => [rnd(), rnd(), rnd()]);
  sfx(at(0.25), 'slam', 0.6);
  sfx(at(1.0), 'dust', 1.0);
  sfx(at(1.5), 'whoosh', 0.8);
  return lt => {
    fadeChars(a, lt, 0.0, 0.03, 0.4, 0);
    const bq = P(lt, 0.25, 0.4, E.outE);
    b.chars.forEach((ch, i) => {
      const q = P(lt, 1.0 + i * 0.06, 1.75 + i * 0.06, E.inC);
      cs(ch, {
        x: (R[i][0] - 0.3) * 260 * q + 120 * q,
        y: -(80 + R[i][1] * 260) * q,
        r: (R[i][2] - 0.5) * 90 * q,
        s: lerp(1.2, 1, bq) * (1 - 0.4 * q),
        op: (lt >= 0.25 ? 1 : 0) * (1 - q),
      });
    });
    const cq = P(lt, 0.6, 0.9, E.outC);
    const fl = P(lt, 1.5, 1.85, E.inE);
    place(c, { x: 1500 * fl, r: -18 * fl, op: cq });
    gtf(g, { op: 1 - P(lt, 2.25, 2.5) });
  };
});

refrain(42.7, 48.45, {
  k: 1.18, wdth: 110,
  pal: { ink: C2.ink, acc: C2.acc, hit: C2.acc2, dim: C2.cold, box: C2.cold },
  a: ['He started to', 'sing'],
  b: ['as he', 'tackled', 'the thing'],
  c: ['That', 'couldn’t be done,'],
  strike: [5, 7],
  d: ['and he', 'did it.'],
  times: { A: 0, B: 1.4, C: 2.8, D: 4.1 },
  rays: C2.acc,
  flash: 0.8,
  flashColor: '#ffe2b0',
  dOut: { t: 5.35, y: 0 },
});

// chapter wipe: S2 to S3, yellow iris opens from the answer
shot(47.75, 48.5, (el, at) => {
  const d = div(el, 'full');
  d.style.background = C3.bg;
  sfx(at(0.0), 'riser', 1.0);
  return lt => {
    const r = 1200 * P(lt, 0, 0.65, E.inE);
    d.style.clipPath = `circle(${r}px at 960px 610px)`;
  };
});

// ================================================================ STANZA 3: MOMENTUM
// shared field of THOUSANDS
shot(T_S3, 56.25, (el, at) => {
  const rows = 19, cols = 7, cw = 400, rh = 57;
  const g = div(el);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = div(g);
    row.dir = r % 2 ? 1 : -1;
    for (let c = 0; c < cols; c++) {
      const o = T(row, 'THOUSANDS', { size: 44, wght: 900, wdth: 125, color: C3.ink, x: -cw + c * cw + (r % 2) * cw / 2, y: 12 + r * rh, ax: 0 });
      const dx = o.x + cw / 2 - 960, dy = o.y - 540;
      o.d = Math.sqrt(dx * dx + dy * dy * 3);
      o.row = row;
      cells.push(o);
    }
  }
  const dmax = Math.max(...cells.map(c => c.d));
  const rnd = mulberry(99);
  const order = cells.map((c, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const L19 = 53.6 - T_S3;
  return lt => {
    const reveal = 0.87;
    const dimmed = P(lt, 2.4, 2.8);
    cells.forEach((o, i) => {
      const t0 = reveal + (o.d / dmax) * 0.75;
      const q = P(lt, t0, t0 + 0.12, E.outE);
      let op = (lt >= t0 ? 1 : 0) * lerp(0.92, 0.08, dimmed);
      o.el.style.color = C3.ink;
      place(o, { s: lerp(1.5, 1, q), op });
    });
    // one by one, cells light up red
    if (lt > L19 + 0.2) {
      const n = Math.floor((lt - (L19 + 0.2)) / 0.075);
      for (let j = 0; j < Math.min(n, order.length); j++) {
        const o = cells[order[j]];
        o.el.style.color = C3.acc;
        o.el.style.opacity = 0.45;
      }
    }
    const scroll = P(lt, 2.6, 8) * 900;
    g.childNodes.forEach(row => { row.style.transform = `translateX(${(row.dir * scroll) % cw}px)`; });
    gtf(g, { op: 1 - P(lt, 7.55, 7.8) });
  };
});

// L17 There are thousands to tell you it cannot be done,
lineAt(T_S3);
shot(T_S3, 51.0, (el, at) => {
  const a = T(el, 'There are', { upper: 1, size: 100, wght: 900, wdth: 125, color: C3.ink, y: 250 });
  const big = T(el, 'thousands', { upper: 1, size: 230, wght: 900, wdth: 125, color: C3.ink, y: 545 });
  const band = rule(el, C3.ink);
  const c = T(el, 'to tell you it cannot be done,', { upper: 1, size: 84, wght: 900, wdth: 100, color: C3.bg, y: 545 });
  sfx(at(0), 'boom', 1.1);
  shake(at(0), 16);
  sfx(at(BEAT), 'slam', 1.0);
  sfx(at(2 * BEAT), 'multiply', 1.0);
  sfx(at(3 * BEAT), 'whoosh', 0.7);
  return lt => {
    const aq = P(lt, 0, 0.15, E.outE);
    place(a, { s: lerp(1.4, 1, aq), op: 1 - P(lt, 1.6, 1.8) });
    const bq = P(lt, BEAT, BEAT + 0.18, E.outE);
    const bOut = P(lt, 2 * BEAT, 2 * BEAT + 0.35, E.inC);
    place(big, { s: lerp(0.55, 1, bq) * (1 - 0.7 * bOut), op: (lt >= BEAT ? 1 : 0) * (1 - bOut) });
    const hq = P(lt, 3 * BEAT, 3 * BEAT + 0.2, E.outE);
    const out = P(lt, 2.4, 2.6, E.inE);
    const bh = 250 * hq * (1 - out);
    rect(band, 0, 545 - bh / 2, 1920, bh);
    popWords(c, lt, [1.4, 1.46, 1.52, 1.58, 1.64, 1.7, 1.76], 1.2, 0.15);
    c.el.style.opacity = 1 - out;
  };
});

// L18 There are thousands to prophesy failure,
lineAt(51.0);
shot(51.0, 53.65, (el, at) => {
  const a = T(el, 'There are thousands', { upper: 1, size: 112, wght: 900, wdth: 100, color: C3.ink, y: 300 });
  const b = T(el, 'to prophesy', { upper: 1, size: 132, wght: 900, wdth: 125, color: C3.ink, y: 500 });
  const c = T(el, 'failure,', { upper: 1, size: 250, wght: 900, wdth: 100, color: C3.acc, y: 740 });
  const rnd = mulberry(4);
  const R = c.chars.map(() => [rnd(), rnd()]);
  sfx(at(0), 'slam', 1.0);
  sfx(at(2 * BEAT), 'slam', 0.8);
  sfx(at(3 * BEAT), 'boom', 0.8);
  shake(at(3 * BEAT), 12);
  sfx(at(4 * BEAT), 'sag', 0.9);
  return lt => {
    popWords(a, lt, [0, 0.05, 0.1], 1.3, 0.15);
    popWords(b, lt, [2 * BEAT, 2 * BEAT + 0.08], 1.3, 0.15);
    const q = P(lt, 3 * BEAT, 3 * BEAT + 0.15, E.outE);
    c.chars.forEach((ch, i) => {
      const s = P(lt, 4 * BEAT + i * 0.05, 4 * BEAT + i * 0.05 + 0.5, E.outB);
      cs(ch, { s: lerp(1.6, 1, q), y: s * (20 + R[i][0] * 70), r: s * (R[i][1] - 0.5) * 18, op: lt >= 3 * BEAT ? 1 : 0 });
    });
    el.style.opacity = 1 - P(lt, 2.45, 2.6);
  };
});

// L19 There are thousands to point out to you one by one,
lineAt(53.6);
shot(53.6, 56.25, (el, at) => {
  const a = T(el, 'There are thousands', { upper: 1, size: 104, wght: 900, wdth: 100, color: C3.ink, y: 270 });
  const b = T(el, 'to point out to you', { upper: 1, size: 112, wght: 900, wdth: 125, color: C3.ink, y: 440 });
  const c = T(el, 'one by one,', { upper: 1, size: 250, wght: 900, wdth: 100, color: C3.ink, y: 710 });
  const dot = rule(el, C3.acc, { borderRadius: '50%' });
  sfx(at(0), 'slam', 0.9);
  sfx(at(BEAT), 'slam', 0.7);
  [2, 3, 4].forEach(k => sfx(at(k * BEAT), 'pop', 1.0));
  shake(at(4 * BEAT), 8);
  return lt => {
    popWords(a, lt, [0, 0.05, 0.1], 1.3, 0.15);
    popWords(b, lt, [BEAT, BEAT + 0.05, BEAT + 0.1, BEAT + 0.15, BEAT + 0.2], 1.3, 0.15);
    popWords(c, lt, [2 * BEAT, 3 * BEAT, 4 * BEAT], 1.5, 0.16);
    // pointer dot jumps to each word as it lands
    const k = lt < 3 * BEAT ? 0 : lt < 4 * BEAT ? 1 : 2;
    if (lt >= 2 * BEAT) {
      const wc = wordCenter(c, k);
      const x = 960 - c.el.offsetWidth / 2 + wc.x;
      const s = 1 + spring(lt - (2 + k) * BEAT, 3, 8) * 0.5;
      rect(dot, x - 16 * s, 850 - 16 * s, 32 * s, 32 * s);
      dot.style.opacity = 1;
    } else dot.style.opacity = 0;
    el.style.opacity = 1 - P(lt, 2.45, 2.6);
  };
});

// L20 The dangers that wait to assail you.
lineAt(56.2);
shot(56.2, 58.85, (el, at) => {
  const hz = div(el, 'rule');
  hz.style.background = `repeating-linear-gradient(-45deg, ${C3.ink} 0 34px, ${C3.bg} 34px 68px)`;
  const a = T(el, 'The dangers', { upper: 1, size: 200, wght: 900, wdth: 100, color: C3.ink, y: 320 });
  const b = T(el, 'that wait', { upper: 1, size: 104, wght: 900, wdth: 125, color: C3.ink, y: 700 });
  const c = T(el, 'to assail you.', { upper: 1, size: 136, wght: 900, wdth: 100, color: C3.ink, y: 870 });
  const rnd = mulberry(8);
  const R = c.chars.map(() => { const a = rnd() * Math.PI * 2; return [Math.cos(a) * 1300, Math.sin(a) * 900, (rnd() - 0.5) * 200]; });
  sfx(at(0), 'boom', 1.0);
  shake(at(0), 12);
  sfx(at(2 * BEAT), 'slam', 0.7);
  sfx(at(3 * BEAT), 'whoosh', 0.9);
  sfx(at(4.5 * BEAT), 'shatter', 1.1);
  shake(at(4.5 * BEAT), 16);
  return lt => {
    const hq = P(lt, 0.05, 0.3, E.outE);
    rect(hz, -200, 540 - 55 * hq, 2320, 110 * hq, `translateX(${(lt * 180) % 96}px)`);
    const aq = P(lt, 0, 0.15, E.outE);
    place(a, { s: lerp(1.5, 1, aq) });
    popWords(b, lt, [2 * BEAT, 2 * BEAT + 0.08], 1.3, 0.15);
    c.chars.forEach((ch, i) => {
      const q = P(lt, 3 * BEAT + i * 0.012, 4.5 * BEAT, E.inQ);
      cs(ch, { x: R[i][0] * (1 - q), y: R[i][1] * (1 - q), r: R[i][2] * (1 - q), op: lt >= 3 * BEAT ? 1 : 0 });
    });
    el.style.opacity = 1 - P(lt, 2.45, 2.6);
  };
});

// L21 But just buckle in with a bit of a grin,
lineAt(58.8);
shot(58.8, 61.45, (el, at) => {
  const a = T(el, 'But just', { upper: 1, size: 96, wght: 900, wdth: 125, color: C3.ink, y: 285 });
  const b = T(el, 'buckle in', { upper: 1, size: 240, wght: 900, wdth: 100, color: C3.ink, y: 500 });
  const c = T(el, [{ t: 'with a bit of a ' }, { t: 'grin,', color: C3.acc }], { serif: 1, ital: 1, size: 140, color: C3.ink, y: 730 });
  const sm = Smile(c, 5, C3.acc, 11, 0.26);
  sfx(at(0), 'slam', 0.8);
  sfx(at(0.1), 'whoosh', 0.8);
  sfx(at(BEAT), 'click', 1.3);
  shake(at(BEAT), 12);
  sfx(at(3 * BEAT), 'swish', 0.8);
  return lt => {
    popWords(a, lt, [0, 0.06], 1.3, 0.15);
    const q = P(lt, 0.05, BEAT, E.inQ);
    b.words.forEach((w, wi) => {
      const dir = wi === 0 ? -1 : 1;
      const sq = spring(lt - BEAT, 4, 9) * 16;
      w.forEach(c => cs(c, { x: dir * (1 - q) * 1400 - dir * sq }));
    });
    fadeChars(c, lt, 2 * BEAT, 0.018, 0.25, 20);
    sm.set(P(lt, 3 * BEAT, 4 * BEAT, E.ioC));
    el.style.opacity = 1 - P(lt, 2.45, 2.6);
  };
});

// L22 Just take off your coat and go to it;
lineAt(61.4);
shot(61.4, 64.05, (el, at) => {
  const g = div(el);
  const a = T(g, 'Just take off your', { upper: 1, size: 92, wght: 800, wdth: 100, color: C3.ink, y: 250 });
  const cL = T(g, 'coat', { upper: 1, size: 300, wght: 120, wdth: 125, color: C3.ink, y: 470 });
  const cH = T(g, 'coat', { upper: 1, size: 300, wght: 900, wdth: 125, color: C3.acc, y: 470 });
  const b = T(g, 'and go to it;', { upper: 1, size: 176, wght: 900, wdth: 125, color: C3.ink, y: 770 });
  const lines = [];
  const rnd = mulberry(13);
  for (let i = 0; i < 14; i++) lines.push([rule(g, C3.ink), 120 + rnd() * 840, 200 + rnd() * 700, 3 + rnd() * 6]);
  sfx(at(0), 'slam', 0.8);
  sfx(at(BEAT), 'drop', 1.0);
  sfx(at(3 * BEAT), 'slam', 1.0);
  shake(at(3 * BEAT), 10);
  sfx(at(4.6 * BEAT), 'whoosh', 1.2);
  return lt => {
    popWords(a, lt, [0, 0.05, 0.1, 0.15], 1.3, 0.15);
    cH.chars.forEach((c, i) => {
      const tt = Math.max(0, lt - BEAT - i * 0.05);
      cs(c, { y: 0.5 * 7000 * tt * tt, r: (i - 1.5) * 40 * tt });
    });
    place(cL, { op: P(lt, BEAT, BEAT + 0.3) });
    popWords(b, lt, [3 * BEAT, 3 * BEAT + 0.06, 3 * BEAT + 0.12, 3 * BEAT + 0.18], 1.4, 0.15);
    const go = P(lt, 4.8 * BEAT, 6 * BEAT, E.inE);
    place(b, { x: 2600 * go, skx: -25 * P(lt, 4.6 * BEAT, 5.2 * BEAT) });
    place(a, { x: 2600 * P(lt, 5.1 * BEAT, 6 * BEAT, E.inE) });
    place(cL, { x: 2600 * P(lt, 5.0 * BEAT, 6 * BEAT, E.inE), op: P(lt, BEAT, BEAT + 0.3) });
    const sp = P(lt, 4.6 * BEAT, 6 * BEAT);
    lines.forEach(([d, len, y, th], i) => {
      const x = lerp(-900, 2400, P(sp, i * 0.03, 0.6 + i * 0.03, E.inC));
      rect(d, x, y, len, th);
      d.style.opacity = sp > 0 && sp < 1 ? 1 : 0;
    });
  };
});

refrain(64.0, 69.2, {
  k: 1.42, wdth: 125,
  pal: { ink: C3.ink, acc: C3.acc, hit: C3.acc, dim: C3.dim, box: C3.ink },
  a: ['Just start in to', 'sing'],
  b: ['as you', 'tackle', 'the thing'],
  c: ['That', '“cannot be done,”'],
  strike: [4, 6],
  times: { A: 0, B: 4 * BEAT, C: 8 * BEAT, D: 99 },
});

// ================================================================ END LOCKUP
lineAt(69.2);
shot(69.2, T_END + 1, (el, at) => {
  const g = div(el);
  g.style.transformOrigin = '960px 560px';
  const a = T(g, 'and you’ll', { serif: 1, ital: 1, size: 150, color: C3.ink, y: 385 });
  const b = T(g, [{ t: 'DO IT' }, { t: '.', color: C3.acc }], { size: 430, wght: 900, wdth: 125, color: C3.ink, y: 640 });
  const r = rule(g, C3.ink);
  const cred = T(el, 'It Couldn’t Be Done   ·   Edgar Guest, 1917', { mono: 1, upper: 1, size: 17, ls: 0.4, color: C3.ink, y: 968 });
  sfx(at(0), 'whoosh', 0.6);
  sfx(at(2 * BEAT), 'final', 1.3);
  shake(at(2 * BEAT), 24, 6);
  flash(at(2 * BEAT), 0.7, '#0c0c0c', 0.3);
  return lt => {
    fadeChars(a, lt, 0, 0.035, 0.4, 30);
    const q = P(lt, 2 * BEAT, 2 * BEAT + 0.2, E.outE);
    const hold = Math.max(0, lt - 2 * BEAT);
    b.chars.forEach((c, i) => cs(c, { s: 1 + (i === 5 ? spring(hold - 0.12, 2.2, 5) * 0.3 : 0), op: lt >= 2 * BEAT ? 1 : 0 }));
    place(b, { s: lerp(3.2, 1, q) });
    const rw = 1180 * P(lt, 2 * BEAT + 0.4, 2 * BEAT + 1.2, E.ioE);
    rect(r, 960 - rw / 2, 850, rw, 6);
    gtf(g, { s: 1 + 0.035 * P(hold, 0, 8.5, E.outC) });
    cred.chars.forEach((c, i) => (c.style.opacity = lt > 2.6 + i * 0.018 ? 0.75 : 0));
  };
});

// ================================================================ WORLD (background, light, hud, camera)
const bg = $('bg'), bggrid = $('bggrid'), light = $('light'), vig = $('vig'), hud = $('hud'), flashEl = $('flash'), fx = $('fx');
bggrid.style.backgroundImage = `repeating-linear-gradient(90deg, ${rgba(C1.acc, 0.07)} 0 1px, transparent 1px 160px), repeating-linear-gradient(0deg, ${rgba(C1.acc, 0.045)} 0 1px, transparent 1px 135px)`;
const beam = div(light, 'rule');
const blobA = div(light, 'rule'), blobB = div(light, 'rule');
const hudEls = {
  tl: div(hud, 'h', { left: '64px', top: '50px' }),
  tr: div(hud, 'h', { right: '64px', top: '50px', textAlign: 'right' }),
  bl: div(hud, 'h', { left: '64px', bottom: '50px' }),
  br: div(hud, 'h', { right: '64px', bottom: '50px', textAlign: 'right' }),
};
hudEls.tl.textContent = 'It Couldn’t Be Done';
hudEls.bl.textContent = 'Edgar Guest, 1917';
const corners = [0, 1, 2, 3].map(i => {
  const d = div(hud, 'corner');
  const pos = [['36px', '36px'], ['auto', '36px'], ['36px', 'auto'], ['auto', 'auto']][i];
  d.style.left = i % 2 === 0 ? '36px' : 'auto';
  d.style.right = i % 2 === 1 ? '36px' : 'auto';
  d.style.top = i < 2 ? '36px' : 'auto';
  d.style.bottom = i >= 2 ? '36px' : 'auto';
  const b = '2px solid currentColor';
  if (i === 0) { d.style.borderLeft = b; d.style.borderTop = b; }
  if (i === 1) { d.style.borderRight = b; d.style.borderTop = b; }
  if (i === 2) { d.style.borderLeft = b; d.style.borderBottom = b; }
  if (i === 3) { d.style.borderRight = b; d.style.borderBottom = b; }
  return d;
});
LINE_STARTS.sort((a, b) => a - b);

function chapter(t) { return t < T_S2 ? 1 : t < T_S3 ? 2 : 3; }

function world(t) {
  const ch = chapter(t);
  const pal = ch === 1 ? C1 : ch === 2 ? C2 : C3;
  // background: soft centre lift
  if (ch === 3) {
    bg.style.background = `radial-gradient(ellipse 80% 70% at 50% 45%, ${C3.bg2}, ${C3.bg} 70%)`;
  } else {
    bg.style.background = `radial-gradient(ellipse 75% 70% at 50% 42%, ${pal.bg2}, ${pal.bg} 72%)`;
  }
  bggrid.style.opacity = ch === 1 ? 1 : 0;
  bggrid.style.transform = `translateX(${(t * 6) % 160}px)`;
  // light
  if (ch === 1) {
    beam.style.display = 'block'; blobA.style.display = blobB.style.display = 'none';
    const x = 300 + ((t * 70) % 1600);
    rect(beam, x - 350, 0, 700, 1080);
    beam.style.background = `linear-gradient(90deg, transparent, ${rgba(C1.acc, 0.06)}, transparent)`;
  } else if (ch === 2) {
    beam.style.display = 'none'; blobA.style.display = blobB.style.display = 'block';
    const ax = 600 + Math.sin(t * 0.4) * 300, ay = 400 + Math.cos(t * 0.33) * 200;
    const bx = 1350 + Math.cos(t * 0.37) * 280, by = 700 + Math.sin(t * 0.29) * 180;
    rect(blobA, ax - 700, ay - 700, 1400, 1400);
    blobA.style.background = `radial-gradient(circle, ${rgba(C2.acc2, 0.2)}, transparent 62%)`;
    rect(blobB, bx - 650, by - 650, 1300, 1300);
    blobB.style.background = `radial-gradient(circle, ${rgba(C2.acc, 0.13)}, transparent 62%)`;
  } else {
    beam.style.display = blobA.style.display = blobB.style.display = 'none';
  }
  vig.style.background = ch === 3
    ? 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, rgba(80,40,0,0.22))'
    : 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.5))';
  // hud
  const hudOn = P(t, T_S1, T_S1 + 0.4);
  hud.style.color = pal.ink;
  hud.style.opacity = hudOn * (ch === 3 ? 0.62 : 0.5);
  hudEls.tr.textContent = ch === 1 ? 'I / The Doubters' : ch === 2 ? 'II / The Shift' : 'III / Momentum';
  const n = LINE_STARTS.filter(s => s <= t + 1e-6).length;
  hudEls.br.textContent = `Line ${String(Math.min(24, n)).padStart(2, '0')} / 24`;
  hudEls.br.style.opacity = t < 69.2 ? 1 : 1 - P(t, 69.2, 69.6);
  hudEls.tl.style.opacity = hudEls.bl.style.opacity = t < 69.2 ? 1 : 1 - P(t, 69.2, 69.6);
  corners.forEach(c => (c.style.opacity = ch === 1 ? 1 : ch === 2 ? 0.5 : 0.8));
  // camera: slow push per chapter plus shakes
  const since = ch === 1 ? t - T_S1 : ch === 2 ? t - T_S2 : t - T_S3;
  let zx = 0, zy = 0, zr = 0;
  for (const [ts, amp, decay] of SHAKES) {
    const d = t - ts;
    if (d < 0 || d > 1.2) continue;
    const e = amp * Math.exp(-d * decay);
    zx += e * Math.sin(d * 71 + ts * 13);
    zy += e * Math.cos(d * 63 + ts * 7) * 0.8;
    zr += e * 0.03 * Math.sin(d * 55 + ts);
  }
  const zoom = 1 + 0.018 * Math.sin(since * 0.18) + (ch === 3 ? 0.012 * Math.sin(t * Math.PI * 2 / (BEAT * 2)) * 0 : 0);
  cam.style.transform = `translate(${zx}px,${zy}px) rotate(${zr}deg) scale(${zoom})`;
  // flashes
  let fa = 0, fc = '#ffffff';
  for (const [ts, amt, color, dur] of FLASHES) {
    const d = t - ts;
    if (d < 0 || d > dur) continue;
    const a = amt * Math.pow(1 - d / dur, 2);
    if (a > fa) { fa = a; fc = color; }
  }
  flashEl.style.background = fc;
  flashEl.style.opacity = fa;
}

window.renderFrame = function (t) {
  world(t);
  for (const s of SHOTS) {
    const on = t >= s.start && t < s.end;
    if (on !== s.on) { s.el.style.display = on ? 'block' : 'none'; s.on = on; }
  }
  for (const s of SHOTS) if (s.on) s.upd(t - s.start, t);
};
window.DURATION = T_END;
window.SFX = SFX;
window.ready = (async () => {
  await document.fonts.load("900 100px 'Archivo'");
  await document.fonts.load("italic 100px 'Instrument Serif'");
  await document.fonts.load("100px 'Instrument Serif'");
  await document.fonts.load("20px 'JetBrains Mono'");
  await document.fonts.ready;
  window.renderFrame(0);
  return true;
})();

// preview mode: open index.html?play in a browser to watch in real time
if (location.search.includes('play')) {
  window.ready.then(() => {
    const t0 = performance.now();
    const m = location.search.match(/t=([\d.]+)/);
    const off = m ? parseFloat(m[1]) : 0;
    const loop = () => { const t = off + (performance.now() - t0) / 1000; window.renderFrame(t % T_END); requestAnimationFrame(loop); };
    loop();
  });
}
