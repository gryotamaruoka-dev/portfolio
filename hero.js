// ヒーローの絵: 散らばった伝票（小さな紙片）が、1枚の表に整う。
// WebGL2 のインスタンス描画で、紙片1枚＝四角1つ。角丸・罫線・中の文字の帯・浮いている時の影は、
// フラグメントシェーダーが距離の式（SDF）で描く。画像もライブラリも使わない。
// 位置はバネの式で CPU が毎フレーム進め、まとめて GPU に送る（数百枚なので軽い）。
// 表の置き場所と大きさは CSS の .hero-ledger が決め、ここはその枠を読んで列と行を割る。

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_a; // x, y, 回転, 収まり具合(0=浮いている 1=表の中)
layout(location=2) in vec4 i_b; // 種, 種類(0=本文 1=見出し行 2=朱 3=空), 右寄せ, 光り
uniform vec2 u_res;
uniform vec2 u_half;
uniform float u_pad;
out vec2 v_p;
out vec4 v_b;
out float v_settle;
void main() {
  vec2 local = a_corner * (u_half + u_pad);
  float c = cos(i_a.z), s = sin(i_a.z);
  vec2 world = i_a.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 clip = world / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_p = local; v_b = i_b; v_settle = i_a.w;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
in vec4 v_b;
in float v_settle;
uniform vec2 u_half;
uniform float u_px;
uniform vec3 u_white, u_ink, u_shu;
out vec4 o;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float aa = 0.7;
  float r = 1.5 * u_px;
  float d = box(v_p, u_half, r);
  float body = 1.0 - smoothstep(-aa, aa, d);

  // 浮いている紙片だけに落ちる影
  float ds = box(v_p - vec2(0.0, 3.0 * u_px), u_half, r);
  float shadow = (1.0 - v_settle) * 0.16 * (1.0 - smoothstep(0.0, 9.0 * u_px, ds));

  float kind = v_b.y;
  bool head = kind > 0.5 && kind < 1.5;
  vec3 col = head ? u_ink : u_white;

  // 罫線（表に収まると細い線に見えるよう薄くする）
  float bw = u_px;
  float edge = smoothstep(-bw - aa, -bw + aa, d);
  col = mix(col, u_ink, edge * mix(0.62, 0.26, v_settle) * (head ? 0.0 : 1.0));

  // 中の文字の帯
  if (kind < 2.5) {
    float pad = min(9.0 * u_px, u_half.x * 0.3);
    float inner = 2.0 * (u_half.x - pad);
    float len = inner * mix(0.3, 0.86, hash(v_b.x));
    float bh = min(2.3 * u_px, u_half.y * 0.24);
    float cx = mix(-u_half.x + pad + len * 0.5, u_half.x - pad - len * 0.5, v_b.z);
    float bar = 1.0 - smoothstep(-aa, aa, box(v_p - vec2(cx, 0.0), vec2(len * 0.5, bh), bh));
    vec3 bc = head ? u_white : (kind > 1.5 ? u_shu : u_ink);
    float ba = head ? 0.92 : (kind > 1.5 ? 0.95 : 0.46);
    bc = mix(bc, u_shu, v_b.w);
    ba = mix(ba, 1.0, v_b.w);
    col = mix(col, bc, bar * ba);
  }
  o = vec4(col * body, body + shadow * (1.0 - body));
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
  return sh;
}

function cssColor(el, name) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// 同じ種から同じ並びを出す乱数（置き直しても表の中身が変わらないように）
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** 動かせたら true。WebGL2 が無い時は false（CSS の罫線の絵が残る） */
export function initHero(root) {
  const canvas = root.querySelector('.hero-canvas');
  const ledger = root.querySelector('.hero-ledger');
  if (!canvas || !ledger) return false;
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return false;

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (err) {
    console.warn('hero: WebGL の準備に失敗したので、罫線の絵のままにします。', err);
    return false;
  }
  gl.useProgram(prog);
  const U = Object.fromEntries(['u_res', 'u_half', 'u_pad', 'u_px', 'u_white', 'u_ink', 'u_shu'].map(n => [n, gl.getUniformLocation(prog, n)]));

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  for (const [loc, off] of [[1, 0], [2, 16]]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform3fv(U.u_white, cssColor(root, '--white'));
  gl.uniform3fv(U.u_ink, cssColor(root, '--ink'));
  gl.uniform3fv(U.u_shu, cssColor(root, '--shu'));

  const countEl = root.querySelector('[data-count]');
  const totalEl = root.querySelector('[data-total]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // 状態。座標はすべて CSS のピクセル（描く時に dpr を掛ける）
  let dpr = 1, W = 0, H = 0, cols = 0, rows = 0, cw = 0, ch = 0, n = 0;
  let cells = [];           // {x,y,vx,vy,a,va, tx,ty, hx,hy,ha, ph, delay, settle, seed, kind, align, flash}
  let data = new Float32Array(0);
  let mode = 'chaos';       // 'chaos' | 'sort'
  let modeAt = 0;           // その状態に入った時刻(ms)
  let resortTimer = 0;
  let lastCount = -1, lastFlash = 0;
  let doneAt = 0;           // 全部そろった時刻(ms)。0 はまだ
  let lost = false;         // WebGL の描く場所を失った（罫線の絵に戻して、以後は動かさない）
  // power: 動かした直後が 1、止めると 0 へ（止めたカーソルの下でも、紙片が表に戻れるように）
  const pointer = { x: 0, y: 0, on: false, power: 0 };
  let box = { x: 0, y: 0, w: 0, h: 0 };

  function measure() {
    const cr = canvas.getBoundingClientRect(), lr = ledger.getBoundingClientRect();
    W = cr.width; H = cr.height;
    box = { x: lr.left - cr.left, y: lr.top - cr.top, w: lr.width, h: lr.height };
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    gl.viewport(0, 0, bw, bh);
  }

  function layout() {
    measure();
    const narrow = box.w < 480;
    const nc = Math.max(5, Math.round(box.w / (narrow ? 50 : 62)));
    const rowH = narrow ? 21 : 24;
    const nr = Math.max(6, Math.floor(box.h / rowH));
    const rebuilt = nc !== cols || nr !== rows;
    cols = nc; rows = nr; cw = box.w / cols; ch = box.h / rows; n = cols * rows;
    if (rebuilt) { build(); lastCount = -1; root.classList.remove('is-done'); } // 作り直したら、判と数も最初から
    for (let i = 0; i < n; i++) {
      const c = cells[i], col = i % cols, row = (i / cols) | 0;
      c.tx = box.x + (col + 0.5) * cw;
      c.ty = box.y + (row + 0.5) * ch;
      // 散らばる場所: 表の枠より一回り広い範囲（見出しの文には掛からない側へ寄せる）
      // 左（見出しの文）と下（表の下の1行）には出さない。スマホでは上のボタンにも掛けない
      c.hx = box.x + (c.rx * 1.1 - 0.02) * box.w;
      c.hy = box.y + (c.ry * (narrow ? 1.0 : 1.08) - (narrow ? 0.0 : 0.08)) * box.h;
      c.hx = Math.min(W - cw * 0.4, Math.max(cw * 0.6, c.hx));
      c.hy = Math.min(H - ch, Math.max(ch, c.hy));
    }
    if (totalEl) totalEl.textContent = String(n);
  }

  function build() {
    const rnd = mulberry(20261117);
    // 列の性格: 0列目は番号、数字の列は右寄せ、右から2列目は「状態」（朱が混じる）
    const numeric = Array.from({ length: cols }, (_, c) => c === 0 || rnd() < 0.42);
    const statusCol = cols - 2;
    cells = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = (i / cols) | 0;
      let kind = 0;
      if (row === 0) kind = 1;
      else if (col === statusCol && rnd() < 0.3) kind = 2;
      else if (col !== 0 && rnd() < 0.09) kind = 3;
      const rx = rnd(), ry = rnd();
      cells.push({
        x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, tx: 0, ty: 0, hx: 0, hy: 0,
        rx, ry, ha: (rnd() - 0.5) * 2.4, ph: rnd() * 6.283,
        delay: row * 26 + col * 9 + rnd() * 140,
        settle: 0, seed: col === 0 ? 0.02 + rnd() * 0.1 : rnd(), kind, align: numeric[col] ? 1 : 0, flash: 0,
        fresh: true,
      });
    }
    data = new Float32Array(n * 8);
    // GPU 側の置き場は作り直した時に1回だけ取り、毎フレームは中身だけ入れ替える
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  }

  function place() { // 作ったばかりの紙片を散らばった場所に置く
    for (const c of cells) if (c.fresh) { c.x = c.hx; c.y = c.hy; c.a = c.ha; c.fresh = false; }
  }

  function setMode(m, now) {
    mode = m; modeAt = now;
    root.classList.remove('is-done');
  }

  function scatter(px, py) {
    const now = performance.now();
    setMode('chaos', now);
    for (const c of cells) {
      const dx = c.x - px, dy = c.y - py, d = Math.hypot(dx, dy) || 1;
      const f = 520 / (1 + d / 120);
      c.vx += dx / d * f + (Math.random() - 0.5) * 160;
      c.vy += dy / d * f + (Math.random() - 0.5) * 160;
      c.va += (Math.random() - 0.5) * 14;
      c.rx = Math.random(); c.ry = Math.random(); c.ha = (Math.random() - 0.5) * 2.4;
    }
    layout();
    clearTimeout(resortTimer);
    resortTimer = setTimeout(() => setMode('sort', performance.now()), 1700);
    wake();
  }

  function step(dt, now) {
    const t = now / 1000, since = now - modeAt;
    const R = 120, R2 = R * R;
    let settled = 0;
    pointer.power = Math.max(0, pointer.power - dt * 1.8);
    const push = pointer.on ? pointer.power : 0;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      let gx, gy, ga, k, damp, ka;
      const sorting = mode === 'sort' && since >= c.delay;
      if (sorting) { gx = c.tx; gy = c.ty; ga = 0; k = 120; damp = 15; ka = 90; }
      else {
        gx = c.hx + Math.sin(t * 0.5 + c.ph) * 14;
        gy = c.hy + Math.cos(t * 0.4 + c.ph * 1.7) * 12;
        ga = c.ha + Math.sin(t * 0.6 + c.ph) * 0.14;
        k = 7; damp = 3.2; ka = 6;
      }
      let ax = (gx - c.x) * k - c.vx * damp, ay = (gy - c.y) * k - c.vy * damp;
      let aa = (ga - c.a) * ka - c.va * (sorting ? 13 : 3);
      if (push > 0) {
        const dx = c.x - pointer.x, dy = c.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * Math.min(1, push * 2); // 近いほど強く押しのける
          ax += dx / d * f * f * 5200; ay += dy / d * f * f * 5200;
          aa += (dx > 0 ? 1 : -1) * f * 26;
        }
      }
      c.vx += ax * dt; c.vy += ay * dt; c.va += aa * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
      const off = Math.abs(c.x - c.tx) + Math.abs(c.y - c.ty);
      const home = sorting && off < 0.6 && Math.abs(c.a) < 0.01;
      if (home) settled++;
      const want = sorting ? Math.max(0, 1 - off / 60) : 0;
      c.settle += (want - c.settle) * Math.min(1, dt * 10);
      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 1.1);
    }
    // 全部そろった後は、ときどき1件が朱く光る（新しい行が入ってくる感じ）
    if (settled !== n) doneAt = 0; else if (!doneAt) doneAt = now;
    // 光るのはそろってから5秒まで（ずっと動き続ける物を画面に残さない）
    if (settled === n && now - doneAt < 5000 && now - lastFlash > 620) {
      lastFlash = now;
      const c = cells[cols + ((Math.random() * (n - cols)) | 0)];
      if (c && c.kind === 0) c.flash = 1;
    }
    return settled;
  }

  function draw() {
    for (let i = 0; i < n; i++) {
      const c = cells[i], o = i * 8;
      data[o] = c.x * dpr; data[o + 1] = c.y * dpr; data[o + 2] = c.a; data[o + 3] = c.settle;
      data[o + 4] = c.seed; data[o + 5] = c.kind; data[o + 6] = c.align; data[o + 7] = c.flash;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    // 隣どうしの罫線が重なって1本に見えるよう、半ピクセルずつ広げる
    gl.uniform2f(U.u_half, (cw * 0.5 + 0.5) * dpr, (ch * 0.5 + 0.5) * dpr);
    gl.uniform1f(U.u_pad, 12 * dpr);
    gl.uniform1f(U.u_px, dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }

  function report(settled) {
    if (settled === lastCount) return;
    lastCount = settled;
    if (countEl) countEl.textContent = String(settled);
    root.classList.toggle('is-done', settled === n && mode === 'sort');
  }

  // 動きを減らす設定の時: 最初から整った表を1回だけ描く
  function still() {
    if (lost) return;
    for (const c of cells) { c.x = c.tx; c.y = c.ty; c.a = 0; c.vx = c.vy = c.va = 0; c.settle = 1; c.flash = 0; c.fresh = false; }
    mode = 'sort';
    draw(); lastCount = -1; report(n);
  }

  let raf = 0, last = 0, visible = true;
  function frame(now) {
    raf = 0;
    if (lost || !visible || document.hidden || reduce.matches) return;
    const dt = Math.min(0.032, Math.max(0, (now - last) / 1000)) || 0.016;
    last = now;
    // 大きな dt でバネが暴れないよう、2回に分けて進める
    step(dt / 2, now - dt * 500);
    const settled = step(dt / 2, now);
    draw();
    report(settled);
    // そろって5秒たち、光りも押しのけも無ければ止まる（次に動かすのは、カーソル・クリック・大きさの変化）
    const idle = settled === n && now - doneAt >= 5000 && pointer.power === 0 && !cells.some(c => c.flash > 0);
    if (!idle) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (lost) return;
    if (reduce.matches) { still(); return; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  layout(); place();
  if (reduce.matches) still();
  else { setMode('chaos', performance.now()); resortTimer = setTimeout(() => setMode('sort', performance.now()), 650); wake(); }

  new ResizeObserver(() => { layout(); place(); if (reduce.matches) still(); else wake(); }).observe(root);
  new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) wake(); }).observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  reduce.addEventListener('change', () => { if (reduce.matches) still(); else wake(); });

  const local = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  root.addEventListener('pointermove', ev => { if (ev.pointerType === 'touch') return; [pointer.x, pointer.y] = local(ev); pointer.on = true; pointer.power = 1; wake(); });
  root.addEventListener('pointerleave', () => { pointer.on = false; });
  ledger.addEventListener('click', ev => {
    if (reduce.matches || ev.target.closest('button, a')) return;
    scatter(...local(ev));
  });
  root.querySelector('[data-scatter]')?.addEventListener('click', () => {
    if (reduce.matches) return;
    scatter(box.x + box.w / 2, box.y + box.h / 2);
  });
  // 描く場所を失ったら（スマホで裏に回した時など）、CSS の罫線の絵に戻して終わる。復帰は頼まない
  canvas.addEventListener('webglcontextlost', () => { lost = true; cancelAnimationFrame(raf); raf = 0; clearTimeout(resortTimer); root.classList.remove('gl-on', 'is-done'); });

  // 画面の細かさ（devicePixelRatio）が変わった時（別のモニタへ動かした時）に描き直す
  const watchDpr = () => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      layout(); if (reduce.matches) still(); else wake();
      watchDpr();
    }, { once: true });
  };
  watchDpr();

  return true;
}
