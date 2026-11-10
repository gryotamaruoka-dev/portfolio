// お問い合わせの節のタブ（カレンダーから予約／フォームで問い合わせ）と、予約（TimeRex のカレンダー）の読み込み。
// カレンダーは、予約のタブが選ばれていて、節が画面に近づいた時に読み込む。
// 開いた直後には外の物を読まない（表示を遅くしない・コンソールを汚さないため）。
// 予約ページの URL は index.html の #timerex_calendar の data-url に書く。
(function () {
  var box = document.getElementById('timerex_calendar');
  var tabs = document.getElementById('contact-tabs');
  var fallback = document.getElementById('booking-fallback');
  if (!box || !tabs) return;
  var section = tabs.closest('section');
  var tabCal = document.getElementById('tab-calendar'), tabForm = document.getElementById('tab-form');
  var panels = { calendar: document.getElementById('booking'), form: document.getElementById('panel-form') };
  var current = 'calendar', near = false, started = false;

  // 読めない時は、空の枠を畳んで予約ページへのリンクを出す
  function fail() { box.hidden = true; if (fallback) fallback.hidden = false; }
  function frame() { return box.querySelector('iframe'); }
  // 隠れている間に読み込まれると枠の高さが合わないので、見えた時に合わせ直す
  function fit() { var f = frame(); if (f && f.iFrameResizer) { try { f.iFrameResizer.resize(); } catch (err) {} } }
  function start() {
    if (started || !near || current !== 'calendar') return;
    started = true;
    if (!/^https:\/\/timerex\.net\/s\//.test(box.getAttribute('data-url') || '')) return fail();
    var s = document.createElement('script');
    s.src = 'https://asset.timerex.net/js/embed.js';
    s.id = 'timerex_embed';
    s.onload = function () {
      try {
        window.TimerexCalendar();
        var f = frame();
        if (!f) return fail();
        f.title = '相談の予約のカレンダー（TimeRex）';
        f.addEventListener('load', fit);
      } catch (err) { fail(); }
    };
    // とても遅い・枠だけ止められた時に、空白のままにしない
    setTimeout(function () { if (!frame()) fail(); }, 15000);
    s.onerror = fail;
    document.body.appendChild(s);
  }
  function select(name, focus) {
    current = name;
    tabCal.setAttribute('aria-selected', String(name === 'calendar'));
    tabForm.setAttribute('aria-selected', String(name === 'form'));
    tabCal.tabIndex = name === 'calendar' ? 0 : -1;
    tabForm.tabIndex = name === 'form' ? 0 : -1;
    panels.calendar.hidden = name !== 'calendar';
    panels.form.hidden = name !== 'form';
    if (focus) (name === 'calendar' ? tabCal : tabForm).focus();
    start();
    if (name === 'calendar') fit();
  }
  // 行き先（#booking・#contact-form）でタブを選ぶ。事例ページのボタンから来た時のため
  function fromHash(scroll) {
    var h = location.hash;
    if (h !== '#booking' && h !== '#contact-form') return;
    select(h === '#booking' ? 'calendar' : 'form');
    if (scroll) tabs.scrollIntoView({ block: 'start' });
  }

  section.classList.add('tabs-on');
  tabCal.addEventListener('click', function () { select('calendar'); });
  tabForm.addEventListener('click', function () { select('form'); });
  tabs.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    select(current === 'calendar' ? 'form' : 'calendar', true);
  });
  select('calendar');
  fromHash(true);
  window.addEventListener('hashchange', function () { fromHash(true); });
  // 画像が読み終わると上の節の高さが変わるので、読み終わった時にもう一度その場所へ合わせる
  if (document.readyState !== 'complete') window.addEventListener('load', function () { fromHash(true); });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); near = true; start(); }
    }, { rootMargin: '600px 0px' });
    io.observe(section);
  } else { near = true; start(); }
})();
