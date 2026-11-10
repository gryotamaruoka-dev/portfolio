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
    email: 'メールアドレスの形をご確認ください。半角の英数字でご記入ください（例 example@abc.com）。',
    message_links: 'お問い合わせ内容の URL（http で始まる物）は3つまでにしてください。資料は添付でもお送りいただけます。',
    tel: '電話番号は数字とハイフンで、20 文字までご記入ください。',
    kind: 'ご相談の種類を選んでください。',
    hope: 'ご希望を選んでください。',
    message: 'お問い合わせ内容は 5〜3000 文字でご記入ください。',
    consent: 'プライバシーポリシーへの同意にチェックを入れてください。',
    file_type: '添付の形を確かめられませんでした。PDF・画像・Word・Excel・PowerPoint・CSV・テキスト（UTF-8）でお送りください。',
    file_size: '添付は 5MB までです。',
    file_empty: '添付のファイルが空（0バイト）です。ファイルを選び直してください。'
  };

  // fieldMsg: その案内が「欄の誤り」から出た物か（欄を全部直した時に消してよいのは、これだけ）
  let statusFromFields = false;
  function say(text, isError, fieldMsg) {
    status.textContent = text; // textContent なので、文字が HTML として動くことはない
    status.classList.toggle('is-error', !!isError);
    statusFromFields = !!fieldMsg;
  }

  // Turnstile は、フォームに触れた時に初めて読み込み、送信ボタンの上に置く。
  // なぜ: Turnstile の枠（challenges.cloudflare.com）は、ブラウザの機能を調べる時に自分の枠の中で
  // 警告をコンソールに出す（こちらのコードでは消せない）。ページを開いただけの人には出さないため。
  let turnstileRequested = false;
  let turnstileFailed = false;
  const MAIL = 'g.ryota.maruoka@gmail.com';
  function loadTurnstile() {
    if (!sitekey || turnstileRequested) return;
    turnstileRequested = true;
    window.onTurnstileLoad = function () {
      widgetId = window.turnstile.render('#turnstile-slot', { sitekey, language: 'ja', theme: 'light' });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    s.async = true;
    // 広告ブロッカーや会社のネットワークで読めない時は、メールでの連絡を案内する（何度押しても送れないままにしない）
    s.onerror = () => { turnstileFailed = true; };
    document.head.appendChild(s);
  }
  ['focusin', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, loadTurnstile, { once: true }));

  // ブラウザの吹き出しを止め、自分で確かめる（JS が動かない時は、HTML の required などがそのまま効く）
  form.noValidate = true;

  const q = (sel) => form.querySelector(sel);
  // 欄ごとに: 赤くする物（mark）・案内を置く場所の直前の要素（after）・カーソルを移す物（focus）
  const FIELDS = {
    name: { mark: () => [q('[name="お名前"]')], after: () => q('[name="お名前"]'), focus: () => q('[name="お名前"]') },
    email: { mark: () => [q('[name="メールアドレス"]')], after: () => q('[name="メールアドレス"]'), focus: () => q('[name="メールアドレス"]') },
    tel: { mark: () => [q('[name="電話番号"]')], after: () => q('[name="電話番号"]'), focus: () => q('[name="電話番号"]') },
    kind: { mark: () => [q('[name="ご相談の種類"]')], after: () => q('[name="ご相談の種類"]').parentElement, focus: () => q('[name="ご相談の種類"]') },
    hope: { mark: () => [q('[role="radiogroup"]')], after: () => q('[role="radiogroup"]'), focus: () => q('[name="ご希望"]') },
    message: { mark: () => [q('[name="お問い合わせ内容"]')], after: () => q('[name="お問い合わせ内容"]'), focus: () => q('[name="お問い合わせ内容"]') },
    file: { mark: () => [q('input[type=file]')], after: () => q('input[type=file]').closest('label'), focus: () => q('input[type=file]') },
    consent: { mark: () => [q('[name="プライバシーポリシー同意"]')], after: () => q('[name="プライバシーポリシー同意"]').parentElement, focus: () => q('[name="プライバシーポリシー同意"]') }
  };
  // 受け口（gas-contact/src/logic.js の isEmail）と一字一句同じ形。全角・日本語の文字は通さない
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const TEL_RE = /^[0-9０-９+\-ー－() ]*$/;

  /** 受け口（gas-contact/src/logic.js）と同じ決まりで全部の欄を確かめ、[{key, msg}] を画面の上から順に返す */
  function validateAll(fd, file) {
    const out = [];
    const v = (n) => String(fd.get(n) || '').trim();
    const name = v('お名前'), email = v('メールアドレス'), tel = v('電話番号'), msg = v('お問い合わせ内容');
    if (!name) out.push({ key: 'name', msg: 'お名前をご記入ください。' });
    else if (name.length > 50) out.push({ key: 'name', msg: 'お名前は 50 文字まででご記入ください。' });
    if (!email) out.push({ key: 'email', msg: 'メールアドレスをご記入ください。' });
    else if (email.length > 254 || !EMAIL_RE.test(email)) out.push({ key: 'email', msg: 'メールアドレスの形をご確認ください。半角の英数字でご記入ください（例 example@abc.com）。' });
    if (tel && (tel.length > 20 || !TEL_RE.test(tel))) out.push({ key: 'tel', msg: '電話番号は数字とハイフンで、20 文字までご記入ください。' });
    if (!v('ご相談の種類')) out.push({ key: 'kind', msg: 'ご相談の種類を選んでください。' });
    if (!v('ご希望')) out.push({ key: 'hope', msg: 'ご希望を選んでください。' });
    if (!msg) out.push({ key: 'message', msg: 'お問い合わせ内容をご記入ください。' });
    else if (msg.length < 5 || msg.length > 3000) out.push({ key: 'message', msg: `お問い合わせ内容は 5〜3000 文字でご記入ください（今は ${msg.length} 文字です）。` });
    else if ((msg.match(/https?:\/\//gi) || []).length > 3) out.push({ key: 'message', msg: FIELD_HELP.message_links });
    if (file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!OK_EXT.includes(ext)) out.push({ key: 'file', msg: '添付できるのは PDF・画像・Word・Excel・PowerPoint・CSV・テキストです。' });
      else if (file.size === 0) out.push({ key: 'file', msg: '添付のファイルが空（0バイト）です。ファイルを選び直してください。' });
      else if (file.size > MAX_FILE) out.push({ key: 'file', msg: '添付は 5MB までです。大きいファイルは、返信のメールでお送りください。' });
    }
    if (fd.get('プライバシーポリシー同意') !== 'on') out.push({ key: 'consent', msg: 'プライバシーポリシーへの同意にチェックを入れてください。' });
    return out;
  }

  /** 欄の下に赤い案内を出し、欄を赤くして、読み上げにもつなぐ */
  function showError(key, msg) {
    const f = FIELDS[key];
    const id = 'err-' + key;
    let p = document.getElementById(id);
    if (!p) {
      p = document.createElement('p');
      p.id = id;
      p.className = 'field-error';
      f.after().insertAdjacentElement('afterend', p);
    }
    p.textContent = msg; // textContent なので HTML として動かない
    f.mark().forEach(el => { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id); });
  }

  function clearError(key) {
    const p = document.getElementById('err-' + key);
    if (p) p.remove();
    FIELDS[key].mark().forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
  }

  // 直したら、その欄の案内を消す
  const KEY_OF = { 'お名前': 'name', 'メールアドレス': 'email', '電話番号': 'tel', 'ご相談の種類': 'kind', 'ご希望': 'hope', 'お問い合わせ内容': 'message', 'ファイル': 'file', 'プライバシーポリシー同意': 'consent' };
  // 送れた直後に送信をもう一度押されても、空のフォームの案内で「受け付けました」を消さない（何か入力するまでは押しても何もしない）
  let justSent = false;
  ['input', 'change'].forEach(evName => form.addEventListener(evName, (ev) => {
    const key = KEY_OF[ev.target.name];
    if (!key) return; // Turnstile の隠し欄など、フォームの欄でない物は無視する
    justSent = false;
    if (document.getElementById('err-' + key)) clearError(key);
    if (!form.querySelector('.field-error') && statusFromFields) say('', false);
  }));

  // 選んだ添付を外すボタン（ブラウザによっては、選び直しを取り消しても前のファイルが残るため）
  const fileInput = q('input[type=file]');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'file-remove';
  removeBtn.textContent = '添付を外す';
  removeBtn.hidden = true;
  fileInput.closest('label').insertAdjacentElement('afterend', removeBtn);
  fileInput.addEventListener('change', () => { removeBtn.hidden = !fileInput.files.length; });
  removeBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    // ファイル欄そのものは透明で見えないので、見えている「ファイルを選択」に目印を移す
    const lbl = fileInput.closest('label');
    lbl.tabIndex = -1;
    lbl.focus();
  });

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
    if (justSent) return;
    const fd = new FormData(form);
    const file = form.querySelector('input[type=file]').files[0];
    // ブラウザの吹き出し（必須・メールの形など）は、画面によっては出ずにスクロールするだけなので使わず、
    // ここで全部の欄を確かめ、欄の下に赤い文で案内する（2026-11-10 本人「案内文が出ない」）
    const problems = validateAll(fd, file);
    if (problems.length) {
      problems.forEach(pr => showError(pr.key, pr.msg));
      const first = problems[0];
      say(problems.length > 1 ? `${first.msg}（ほか ${problems.length - 1} か所も確かめてください）` : first.msg, true, true);
      const el = FIELDS[first.key].focus();
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    const token = (sitekey && window.turnstile && widgetId !== null) ? window.turnstile.getResponse(widgetId) : '';
    if (sitekey && !token) {
      if (turnstileFailed || !window.turnstile) {
        say(`送信前の確認（Cloudflare）を読み込めませんでした。広告ブロッカーなどを止めて読み込み直すか、お手数ですが ${MAIL} までメールでご連絡ください。`, true);
      } else {
        say('「人間であることを確認」が終わってから、もう一度送信してください。', true);
      }
      return;
    }

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
      let out;
      try { out = await res.json(); } catch { out = { ok: false, error: 'server' }; }
      if (out.ok) {
        form.reset();
        Object.keys(FIELDS).forEach(clearError);
        form.querySelectorAll('label.file input').forEach(i => i.dispatchEvent(new Event('change')));
        justSent = true; // 上の change で false に戻るので、その後に立てる
        say('受け付けました。内容を確認して、折り返しご連絡します。');
      } else if (out.error === 'busy') {
        say('ただいま混み合っています。時間をおいてもう一度お試しください。', true);
      } else if (out.field && Object.prototype.hasOwnProperty.call(FIELD_HELP, out.field)) {
        const key = out.field.startsWith('file') ? 'file' : out.field.startsWith('message') ? 'message' : out.field;
        if (FIELDS[key]) {
          showError(key, FIELD_HELP[out.field]);
          const el = FIELDS[key].focus();
          if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }
        say(FIELD_HELP[out.field], true, !!FIELDS[key]);
      } else {
        say(`送信できませんでした。少し時間をおいて、ページを読み込み直してからもう一度お試しください。解決しない場合は ${MAIL} までご連絡ください。`, true);
      }
    } catch (e) {
      say(`送信できませんでした。通信の状態をご確認のうえ、もう一度お試しください。解決しない場合は ${MAIL} までご連絡ください。`, true);
    } finally {
      button.disabled = false;
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    }
  });
})();
