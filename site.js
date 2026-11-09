// STUDIO が公開サイトで自前の JS で動かしている所を、手元で同じように動かす。
// 編集画面から抜いた HTML にはリンク先と開閉の動きが入っていないため。

// 見出しの文字（Work / News / Overview / Contact）で節を探し、そこへ飛ぶ
function sectionOf(word) {
  return [...document.querySelectorAll('h2, h3, p')]
    .find(el => el.textContent.trim() === word && !el.closest('header, footer'))
    ?.closest('section, .box.sd');
}
document.querySelectorAll('header a, footer a').forEach(a => {
  if (a.getAttribute('href')) return; // privacy.html など、行き先がもう決まっている物はそのまま
  const word = a.textContent.trim();
  // ヘッダーの左端（名前のロゴ）とフッターの Top は先頭へ戻す
  if (a === document.querySelector('header a') || word === 'Top') { a.href = '#'; return; }
  const target = sectionOf(word);
  if (!target) return;
  target.id ||= word.toLowerCase();
  a.href = '#' + target.id;
});

// スマホのメニュー（三本線）を押すとリンクを出す
const header = document.querySelector('header');
const menu = header?.querySelector('button');
menu?.addEventListener('click', () => header.classList.toggle('is-open'));
header?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => header.classList.remove('is-open')));

// 添付欄: 選んだファイルの名前を「ファイルを選択」の所に出す
document.querySelectorAll('label.file input[type=file]').forEach(input => {
  const label = input.parentElement;
  const text = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  if (!text) return;
  const empty = text.textContent;
  input.addEventListener('change', () => {
    text.textContent = input.files.length ? [...input.files].map(f => f.name).join('、') : empty;
  });
});

// 自己紹介の More / Close
document.querySelectorAll('button').forEach(btn => {
  if (!/More/.test(btn.textContent) || btn.closest('header')) return;
  const panel = btn.nextElementSibling;
  btn.addEventListener('click', () => btn.parentElement.classList.toggle('is-open'));
  if (panel) panel.classList.add('more-panel');
});
