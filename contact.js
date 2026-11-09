// お問い合わせフォームを、受け口（Google Apps Script）へ送る。
// 送り先とボット判定（Turnstile）のサイトキーは form の data-endpoint / data-sitekey に書く。どちらも公開してよい値。
// 秘密鍵はここに無い（受け口の Apps Script のスクリプト プロパティにだけある）。
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const endpoint = form.dataset.endpoint;
  const sitekey = form.dataset.sitekey;
  const status = document.getElementById('form-status');
  const button = form.querySelector('button[type=submit]');
  const startedAt = Date.now(); // 開いてから送るまでの秒数を受け口で確かめる（速すぎる送信は機械）
  const MAX_FILE = 5 * 1024 * 1024;
  const OK_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'docx', 'xlsx', 'pptx', 'csv', 'txt'];
  let widgetId = null;
  // 受け口が「どの項目ではじいたか」を返した時の案内（受け口の logic.js の field と同じ名前）
  const FIELD_HELP = {
    name: 'お名前は 50 文字まででご記入ください。',
    email: 'メールアドレスの形をご確認ください（例 example@abc.com）。',
    tel: '電話番号は数字とハイフンで、20 文字までご記入ください。',
    kind: 'ご相談の種類を選んでください。',
    hope: 'ご希望を選んでください。',
    message: 'お問い合わせ内容は 5〜3000 文字でご記入ください。',
    consent: 'プライバシーポリシーへの同意にチェックを入れてください。',
    file_type: '添付できるのは PDF・画像・Word・Excel・PowerPoint・CSV・テキストです。',
    file_size: '添付は 5MB までです。'
  };

  function say(text, isError) {
    status.textContent = text; // textContent なので、文字が HTML として動くことはない
    status.classList.toggle('is-error', !!isError);
  }

  // Turnstile を読み込み、送信ボタンの上に置く
  if (sitekey) {
    window.onTurnstileLoad = function () {
      widgetId = window.turnstile.render('#turnstile-slot', { sitekey, language: 'ja', theme: 'light' });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    s.async = true;
    document.head.appendChild(s);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!endpoint) { say('ただいまフォームを準備中です。お手数ですが g.ryota.maruoka@gmail.com までメールでご連絡ください。', true); return; }
    const fd = new FormData(form);
    const file = form.querySelector('input[type=file]').files[0];
    if (file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!OK_EXT.includes(ext)) { say('添付できるのは PDF・画像・Word・Excel・PowerPoint・CSV・テキストです。', true); return; }
      if (file.size > MAX_FILE) { say('添付は 5MB までです。大きいファイルは、返信のメールでお送りください。', true); return; }
    }
    // 受け口と同じ長さの決まりを、送る前にここでも確かめる（前後の空白は受け口で取られるので、取ってから数える）
    const msgLen = String(fd.get('お問い合わせ内容') || '').trim().length;
    if (msgLen < 5 || msgLen > 3000) { say(`お問い合わせ内容は 5〜3000 文字でご記入ください（今は ${msgLen} 文字です）。`, true); return; }
    if (!String(fd.get('お名前') || '').trim()) { say('お名前をご記入ください。', true); return; }
    const token = (sitekey && window.turnstile && widgetId !== null) ? window.turnstile.getResponse(widgetId) : '';
    if (sitekey && !token) { say('「人間であることを確認」が終わってから、もう一度送信してください。', true); return; }

    button.disabled = true;
    say('送信しています…');
    try {
      const body = {
        name: fd.get('お名前'), email: fd.get('メールアドレス'), tel: fd.get('電話番号') || '',
        kind: fd.get('ご相談の種類'), hope: fd.get('ご希望'), message: fd.get('お問い合わせ内容'),
        consent: fd.get('プライバシーポリシー同意') === 'on',
        website: fd.get('website') || '', startedAt, turnstileToken: token
      };
      if (file) body.file = { name: file.name, data: await readFile(file) };
      // text/plain で送る（ブラウザの事前確認が要らない形。中身は JSON）
      const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      const out = await res.json();
      if (out.ok) {
        form.reset();
        form.querySelectorAll('label.file input').forEach(i => i.dispatchEvent(new Event('change')));
        say('受け付けました。内容を確認して、折り返しご連絡します。');
      } else if (out.error === 'busy') {
        say('ただいま混み合っています。時間をおいてもう一度お試しください。', true);
      } else if (out.field && FIELD_HELP[out.field]) {
        say(FIELD_HELP[out.field], true);
      } else {
        say('送信できませんでした。少し時間をおいて、ページを読み込み直してからもう一度お試しください。解決しない場合は g.ryota.maruoka@gmail.com までご連絡ください。', true);
      }
    } catch (e) {
      say('送信できませんでした。通信の状態をご確認のうえ、もう一度お試しください。', true);
    } finally {
      button.disabled = false;
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    }
  });
})();
