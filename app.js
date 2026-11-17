// トップページの動き。フォームの送信は contact.js、予約とタブは booking.js（どちらも本番と同じ物）。
import { initHero } from './hero.js?v=2';

// ---- ヒーロー（動かせた時だけ、CSS の罫線の絵から切り替える）
const hero = document.getElementById('hero');
if (hero) {
  hero.classList.add('gl-on');
  let ok = false;
  try { ok = initHero(hero); } catch (err) { console.warn('hero:', err); }
  if (!ok) hero.classList.remove('gl-on');
}

// ---- スマホのメニュー
const header = document.querySelector('.hd');
const menu = header?.querySelector('.hd-menu');
function setMenu(open) {
  header.classList.toggle('is-open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
}
if (header && menu) {
  menu.addEventListener('click', () => {
    const open = !header.classList.contains('is-open');
    setMenu(open);
    // ボタンはメニューより後ろにあるので、開いたら最初のリンクへ移す（Tab でメニューに入れるように）
    if (open) header.querySelector('nav a')?.focus();
  });
  header.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && header.classList.contains('is-open')) { setMenu(false); menu.focus(); }
  });
}

// メニューの外を押したら閉じる
document.addEventListener('pointerdown', ev => {
  if (header?.classList.contains('is-open') && !header.contains(ev.target)) setMenu(false);
});

// ---- 「予約する」を2回目に押した時も、予約のタブを開いてそこへ進む。
// 行き先（#booking）が URL にもう入っていると hashchange が起きず、booking.js がタブを開き直さないため
document.querySelectorAll('a[href="#booking"], a[href="#contact-form"]').forEach(a => {
  a.addEventListener('click', ev => {
    if (location.hash !== a.getAttribute('href')) return;
    ev.preventDefault(); // ブラウザの「#booking へ飛ぶ」を止め、booking.js の動き（タブを開いてタブの頭へ）だけにする
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
});

// ---- 今いる節を、メニューに下線で示す
const navLinks = [...document.querySelectorAll('.hd nav a[href^="#"]')];
const sections = navLinks.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
if (sections.length && 'IntersectionObserver' in window) {
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    for (const en of entries) en.isIntersecting ? seen.add(en.target.id) : seen.delete(en.target.id);
    navLinks.forEach(a => {
      if (seen.has(a.getAttribute('href').slice(1))) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  sections.forEach(s => io.observe(s));
}

// ---- 実績の行に乗せた時、カーソルの横に写真を出す（マウスなど細かいポインタの画面だけ）
const rows = [...document.querySelectorAll('.row[data-peek]')];
const fine = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
if (rows.length) {
  const peek = document.createElement('div');
  peek.className = 'peek';
  peek.setAttribute('aria-hidden', 'true');
  const img = new Image();
  img.alt = '';
  peek.append(img);
  document.body.append(peek);
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, on = false;
  const tick = () => {
    x += (tx - x) * 0.16; y += (ty - y) * 0.16;
    peek.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    raf = on || Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0;
  };
  const aim = (ev, row) => {
    // 読んでいる行の文字を隠さないよう、行の上（入らなければ下）に出す。横はカーソルに付いていく
    const w = 250, r = row.getBoundingClientRect();
    tx = Math.min(innerWidth - w - 16, Math.max(16, ev.clientX - w / 2));
    ty = r.top - w - 14 >= 72 ? r.top - w - 14 : Math.min(innerHeight - w - 14, r.bottom + 14);
  };
  rows.forEach(row => {
    row.addEventListener('pointerenter', ev => {
      if (!fine.matches || ev.pointerType !== 'mouse') return;
      img.src = row.dataset.peek;
      aim(ev, row);
      if (!on) { x = tx; y = ty; }
      on = true;
      peek.classList.add('is-on');
      if (!raf) raf = requestAnimationFrame(tick);
    });
    row.addEventListener('pointermove', ev => { if (on) aim(ev, row); });
    row.addEventListener('pointerleave', () => { on = false; peek.classList.remove('is-on'); });
  });
}

// ---- 添付欄: 選んだファイルの名前を「ファイルを選択」の所に出す
document.querySelectorAll('label.file input[type=file]').forEach(input => {
  const label = input.parentElement;
  const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!text) return;
  const empty = text.textContent;
  input.addEventListener('change', () => {
    text.textContent = input.files.length ? [...input.files].map(f => f.name).join('、') : empty;
  });
});
