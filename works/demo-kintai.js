// 打刻フォームの見本の動き（tools/build_works.py が書き出す。手で直さない）
document.getElementById('gf').addEventListener('submit', function (ev) { ev.preventDefault(); });

(function () {
  var $ = function (id) { return document.getElementById(id); };
  function kind() { var r = document.querySelector('input[name=kind]:checked'); return r ? r.value : ''; }
  function td(t) { var c = document.createElement('td'); c.textContent = t; return c; }
  $('send').addEventListener('click', function () {
    var ok = true;
    $('q1').classList.toggle('err', !$('who').value); $('q2').classList.toggle('err', !kind());
    if (!$('who').value || !kind()) return;
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var ts = d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + d.getHours() + ':' + p(d.getMinutes());
    var tr = document.createElement('tr'); tr.className = 'new';
    [ts, $('who').value, kind(), $('memo').value].forEach(function (t) { tr.appendChild(td(t)); });
    $('rows').appendChild(tr);
    $('gf').style.display = 'none'; $('done').classList.add('on'); document.querySelector('.screen').scrollTop = 0;
  });
  function reset() { $('gf').reset(); $('q1').classList.remove('err'); $('q2').classList.remove('err'); }
  $('clr').addEventListener('click', reset);
  $('again').addEventListener('click', function () { reset(); $('done').classList.remove('on'); $('gf').style.display = ''; });
})();
