// Bộ định tuyến và các màn hình chính.
(function () {
  const { Api, Data, Progress, Speech, LS, html, raw, esc, toast, shuffle, ICON } = Vol;
  const S = VolSRS;
  const $app = () => document.getElementById('app');
  const LV_COLORS = ['var(--lv0)', 'var(--lv1)', 'var(--lv2)', 'var(--lv3)', 'var(--lv4)', 'var(--lv5)'];
  let user = LS.get('vol.user', null);
  let cleanup = null;

  const can = {
    learn: () => user && user.role !== 'viewer',
    edit: () => user && (user.role === 'editor' || user.role === 'owner'),
    owner: () => user && user.role === 'owner',
  };

  function levelOf(id) { const p = Progress.get(id); return p ? p.level : null; }
  function lvPill(lv) { return lv === null || lv === undefined ? '<span class="tag">Chưa học</span>' : `<span class="lvpill" style="background:${LV_COLORS[lv]}">${esc(S.LEVELS[lv])}</span>`; }

  // ---------- Khung ----------
  function shell(active, body) {
    const links = [['#/', 'Trang chủ', 'home'], ['#/decks', 'Bộ từ', 'decks']];
    if (can.learn()) links.push(['#/review', 'Ôn tập', 'review']);
    if (can.edit()) links.push(['#/admin', 'Quản trị', 'admin']);
    links.push(['#/settings', 'Cài đặt', 'settings']);
    $app().innerHTML = `
      <header class="topbar">
        <a class="brand" href="#/">Học từ vựng</a>
        <nav class="nav" aria-label="Điều hướng chính">${links.map(([h, t, k]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${t}</a>`).join('')}</nav>
      </header>
      <main id="main">${body}</main>`;
  }
  function loading(active) { shell(active, '<p class="muted">Đang tải…</p>'); }
  function fail(active, e) { shell(active, html`<div class="notice bad">${e.message || e}</div>`); }

  // ---------- Đăng nhập ----------
  function viewLogin(msg) {
    $app().innerHTML = `
      <main class="narrow" style="padding-top:12vh">
        <h1>Học từ vựng</h1>
        <p class="muted">Học từ vựng IELTS tận gốc: word family, IPA, nghĩa Anh – Việt, collocation, đồng/trái nghĩa; ôn ngắt quãng và luyện đủ 4 kỹ năng.</p>
        <form id="login" class="card">
          <label class="field"><span>Email của bạn</span><input class="input" type="email" name="email" required autocomplete="email" placeholder="ban@example.com"></label>
          <label class="field" id="notef" hidden><span>Lời nhắn cho quản trị viên (nếu bạn chưa có quyền)</span><input class="input" name="note" maxlength="300" placeholder="Ví dụ: học viên lớp IELTS tối thứ 3"></label>
          <button class="btn primary" style="width:100%">Gửi link đăng nhập</button>
          <p class="small muted" style="margin-bottom:0" id="loginhelp">Không cần mật khẩu. Đang trong giai đoạn thử nghiệm kín: chỉ email đã được mời mới nhận được link đăng nhập.</p>
        </form>
        <div id="msg">${msg || ''}</div>
        <p class="small muted"><a href="#/legal/privacy">Chính sách bảo mật</a> · <a href="#/legal/terms">Điều khoản</a> · <a href="#/legal/disclaimer">Miễn trừ trách nhiệm</a></p>
      </main>`;
    Api.call('appInfo').then((info) => {
      if (info.invite_only) return;
      document.getElementById('notef').hidden = false;
      document.getElementById('loginhelp').textContent = 'Không cần mật khẩu. Nếu email đã được cấp quyền, bạn sẽ nhận link đăng nhập. Nếu chưa, yêu cầu sẽ được gửi tới quản trị viên để duyệt.';
    }).catch(() => {});
    document.getElementById('login').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const out = document.getElementById('msg');
      try {
        const r = await Api.call('requestLogin', { email: f.get('email'), note: f.get('note') });
        const text = {
          sent: 'Đã gửi link đăng nhập tới email của bạn. Link có hiệu lực 15 phút.',
          requested: 'Đã gửi yêu cầu tới quản trị viên. Bạn sẽ nhận email khi được cấp quyền.',
          pending: 'Yêu cầu của bạn đang chờ quản trị viên duyệt.',
          revoked: 'Quyền truy cập của email này đã bị thu hồi. Liên hệ quản trị viên nếu cần.',
          invite_only: 'Học từ vựng đang thử nghiệm kín — email này chưa được mời. Hãy nhờ giáo viên/quản trị viên gửi lời mời tới email của bạn.',
        }[r.status];
        out.innerHTML = html`<div class="notice ${r.status === 'revoked' || r.status === 'invite_only' ? 'bad' : ''}">${text}</div>`;
      } catch (err) { out.innerHTML = html`<div class="notice bad">${err.message}</div>`; }
      btn.disabled = false;
    };
  }

  async function doLogin(token) {
    $app().innerHTML = '<main class="narrow"><p class="muted">Đang đăng nhập…</p></main>';
    try {
      const r = await Api.call('verifyLogin', { token });
      const prev = LS.get('vol.user', null);
      if (prev && prev.email !== r.user.email) Api.logout(); // đổi tài khoản trên cùng trình duyệt: xoá dữ liệu học của người trước
      Api.setSession(r.session);
      user = r.user; LS.set('vol.user', user);
      history.replaceState(null, '', location.pathname + '#/');
      await boot();
    } catch (e) { viewLogin(html`<div class="notice bad">${e.message}</div>`); }
  }

  // Nhắc ôn: khi app đang mở (hoặc cài như ứng dụng), đến giờ nhắc mà còn thẻ đến hạn thì báo một lần mỗi ngày.
  function dueCount() { return S.dueList(Object.values(Progress.items || {}), new Date()).length; }
  async function remindTick() {
    if (!user || !can.learn()) return;
    const n = dueCount();
    document.title = (n ? `(${n}) ` : '') + 'Học từ vựng';
    if (!n || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const { h, m } = S.parseHour(Progress.reminder());
    const today = now.toDateString();
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m || LS.get('vol.notified', '') === today) return;
    LS.set('vol.notified', today);
    const body = `${n} từ đang chờ ôn. Ôn trước 0 giờ để giữ đúng lịch.`;
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) reg.showNotification('Học từ vựng – đến giờ ôn', { body, icon: 'icon.svg', tag: 'vol-review' });
      else new Notification('Học từ vựng – đến giờ ôn', { body, icon: 'icon.svg' }).onclick = () => { window.focus(); location.hash = '#/review'; };
    } catch (e) { /* trình duyệt chặn thông báo */ }
  }
  setInterval(remindTick, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.addEventListener('online', () => toast('Đã có mạng – đang đồng bộ'));
  window.addEventListener('offline', () => toast('Mất mạng – tiến độ được lưu trên máy và đồng bộ sau'));

  async function boot() {
    try {
      const me = await Api.call('me');
      user = me.user; LS.set('vol.user', user); LS.set('vol.config', me.config);
      Progress.load();
      // Tải tiến độ lỗi thì vẫn hiện bộ từ (tiến độ trên máy vẫn dùng được, đồng bộ lại sau).
      const [dk, pg] = await Promise.allSettled([Data.loadDecks(), can.learn() ? Progress.pull() : null]);
      if (dk.status === 'rejected') throw dk.reason;
      if (pg.status === 'rejected') toast('Chưa tải được tiến độ từ máy chủ – đang dùng bản trên máy');
    } catch (e) {
      if (e.code === 'network' && user) { Progress.load(); Data.decks = LS.get('vol.decks', []); toast('Đang ngoại tuyến – dùng dữ liệu đã lưu'); }
      else if (!Api.session) return route();
      else { toast(e.message); }
    }
    route();
    remindTick();
  }

  // ---------- Trang chủ ----------
  function viewHome() {
    const now = new Date();
    const items = Object.values(Progress.items);
    const due = S.dueList(items, now);
    const counts = [0, 0, 0, 0, 0, 0];
    items.forEach((p) => { counts[p.level || 0]++; });
    const next = items.filter((p) => p.next_due_at && !S.isAvailable(p, now)).sort((a, b) => new Date(a.next_due_at) - new Date(b.next_due_at))[0];
    const roots = Data.decks.filter((d) => !d.parent_id);
    shell('home', `
      <h1>Chào ${esc(user.email)}</h1>
      <p class="muted small">Quyền: <span class="tag ${user.role === 'owner' ? 'owner' : ''}">${esc(user.role_label)}</span> · Giờ nhắc ôn: ${esc(Progress.reminder())}</p>
      ${can.learn() ? `
      <div class="card">
        <div class="row">
          <div><b style="font-size:28px">${due.length}</b> <span class="muted">từ đến hạn ôn</span>
          ${next ? `<div class="small muted">Lần ôn kế tiếp: ${esc(new Date(next.next_due_at).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</div>` : ''}</div>
          <span class="spacer"></span>
          <a class="btn primary" href="#/review" ${due.length ? '' : 'aria-disabled="true"'}>Ôn ngay</a>
        </div>
        <div class="bar" title="Phân bố mức độ">${counts.map((c, i) => c ? `<i style="width:${(c / Math.max(1, items.length)) * 100}%;background:${LV_COLORS[i]}"></i>` : '').join('')}</div>
        <div class="legend" style="margin-top:8px">${S.LEVELS.map((l, i) => `<span><i style="background:${LV_COLORS[i]}"></i>${l}: ${counts[i]}</span>`).join('')}</div>
      </div>` : '<div class="notice">Tài khoản Viewer chỉ xem được bộ từ. Liên hệ quản trị viên nếu muốn học và luyện tập.</div>'}
      <h2>Bộ từ</h2>
      ${decksGrid(roots)}
    `);
  }

  function deckProgress(deckId) {
    // Ước lượng theo tiền tố word_id (từ thuộc bộ con có id bắt đầu bằng deck_id).
    let n = 0, learned = 0;
    Object.values(Progress.items).forEach((p) => { if (String(p.word_id).startsWith(deckId + '-')) { n++; if (p.level >= 4) learned++; } });
    return { n, learned };
  }

  function decksGrid(list) {
    if (!list.length) return '<p class="muted">Chưa có bộ từ nào.</p>';
    list = list.slice().sort((a, b) => (a.builtin === b.builtin ? a.deck_id.localeCompare(b.deck_id) : a.builtin ? 1 : -1));
    return `<div class="grid">${list.map((d) => {
      const pr = deckProgress(d.deck_id);
      const pct = d.word_count ? Math.round((pr.n / d.word_count) * 100) : 0;
      return html`<a class="card deck" href="#/deck/${d.deck_id}">
        <div class="title">${d.title}</div>
        <div class="small muted">${d.word_count} từ · ${d.builtin ? 'Bộ có sẵn' : d.visibility === 'private' ? 'Riêng tư' : d.visibility === 'shared' ? 'Được chia sẻ' : 'Công khai'}</div>
        <div class="bar"><i style="width:${pct}%;background:var(--accent)"></i></div>
        <div class="small muted" style="margin-top:4px">Đã học ${pr.n} · Đã thuộc ${pr.learned}</div>
      </a>`;
    }).join('')}</div>`;
  }

  function viewDecks() {
    const roots = Data.decks.filter((d) => !d.parent_id);
    const builtin = roots.filter((d) => d.builtin);
    const mine = roots.filter((d) => !d.builtin);
    shell('decks', `
      <div class="row"><h1>Bộ từ</h1><span class="spacer"></span>${can.learn() ? '<a class="btn primary" href="#/new-deck">+ Tạo bộ từ</a>' : ''}</div>
      <h2>Bộ của bạn và được chia sẻ</h2>${decksGrid(mine)}
      <h2>Bộ có sẵn (VOL)</h2>${decksGrid(builtin)}
    `);
  }

  // ---------- Trang một bộ ----------
  async function viewDeck(id) {
    const d = Data.deck(id);
    if (!d) return fail('decks', 'Không tìm thấy bộ từ hoặc bạn không có quyền xem.');
    const parent = d.parent_id ? Data.deck(d.parent_id) : null;
    const kids = Data.children(id);
    const pr = deckProgress(id);
    shell('decks', `
      <p class="small"><a href="#/decks">Bộ từ</a>${parent ? html` / <a href="#/deck/${parent.deck_id}">${parent.title}</a>` : ''}</p>
      <h1>${esc(d.title)}</h1>
      <p class="muted small">${d.word_count} từ · đã học ${pr.n} · đã thuộc ${pr.learned}${d.description ? ' · ' + esc(d.description) : ''}</p>
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <label class="small">Thứ tự <select id="order" class="input" style="width:auto;min-height:34px"><option value="orig">Theo thứ tự gốc</option><option value="random">Ngẫu nhiên</option></select></label>
          <label class="small">Trạng thái <select id="filter" class="input" style="width:auto;min-height:34px">
            <option value="all">Tất cả</option><option value="new">Chưa học</option><option value="due">Đến hạn</option>
            ${S.LEVELS.slice(1).map((l, i) => `<option value="${i + 1}">${l}</option>`).join('')}</select></label>
        </div>
        <div class="modes">
          <a class="btn" data-go="flash">Flashcard</a>
          <a class="btn" href="#/sheet/${id}">Bảng từ</a>
          ${can.learn() ? `
          <a class="btn" data-go="practice" data-skill="L">Listening</a>
          <a class="btn" data-go="practice" data-skill="R">Reading</a>
          <a class="btn" data-go="practice" data-skill="W">Writing</a>
          <a class="btn" data-go="practice" data-skill="S">Speaking</a>
          <a class="btn" data-go="practice" data-skill="MIX">Tổng hợp</a>` : ''}
        </div>
      </div>
      ${kids.length ? `<h2>Theo test</h2><div class="sublist">${kids.map((k) => html`<a href="#/deck/${k.deck_id}"><b>${k.title.replace(d.title + ' – ', '')}</b><div class="small muted">${k.word_count} từ</div></a>`).join('')}</div>` : ''}
      ${d.can_edit && !d.builtin ? html`<h2>Quản lý bộ</h2><div class="row"><a class="btn" href="#/add/${id}">+ Thêm từ</a><a class="btn" href="#/share/${id}">Chia sẻ</a><button class="btn" id="deck-edit">Sửa tên / mô tả</button><button class="btn" id="deck-xlsx">Tải về Excel</button><span class="spacer"></span><button class="btn danger" id="deck-del">Xoá bộ</button></div>` : ''}
      ${d.can_edit && d.builtin && can.edit() ? html`<h2>Quản lý bộ</h2><div class="row"><a class="btn" href="#/add/${id}">+ Thêm từ</a></div>` : ''}
    `);
    const de = document.getElementById('deck-edit');
    if (de) de.onclick = () => editDeck(d);
    const dx = document.getElementById('deck-xlsx');
    if (dx) dx.onclick = async () => {
      dx.disabled = true; dx.textContent = 'Đang tạo file…';
      try { await VolManage.exportDeck(d, kids); } catch (e) { toast(e.message); }
      dx.disabled = false; dx.textContent = 'Tải về Excel';
    };
    const dd = document.getElementById('deck-del');
    if (dd) dd.onclick = () => deleteDeckDialog(d, kids);
    document.querySelectorAll('[data-go]').forEach((a) => {
      a.onclick = () => {
        const q = `order=${document.getElementById('order').value}&filter=${document.getElementById('filter').value}`;
        location.hash = a.dataset.go === 'flash' ? `#/flash/${id}?${q}` : `#/practice/${id}?skill=${a.dataset.skill}&${q}`;
      };
    });
  }

  function applyFilter(words, filter, order) {
    const now = new Date();
    let list = words;
    if (filter === 'new') list = words.filter((w) => !Progress.get(w.word_id));
    else if (filter === 'due') list = words.filter((w) => { const p = Progress.get(w.word_id); return p && S.isAvailable(p, now); });
    else if (/^[1-5]$/.test(filter || '')) list = words.filter((w) => levelOf(w.word_id) === Number(filter));
    return order === 'random' ? shuffle(list) : list;
  }

  // Hộp thoại đơn giản; trả về phần tử nội dung và hàm đóng.
  function modal(inner) {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-card card" role="dialog" aria-modal="true"><button class="icon-btn modal-x" aria-label="Đóng">✕</button>${inner}</div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onEsc); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    wrap.onclick = (e) => { if (e.target === wrap || e.target.closest('.modal-x')) close(); };
    return { el: wrap.querySelector('.modal-card'), close };
  }

  const EDIT_FIELDS = [['headword', 'Từ vựng'], ['ipa', 'IPA'], ['pos', 'Từ loại'], ['meaning', 'Nghĩa — mẫu: 1) n. English meaning: nghĩa tiếng Việt'], ['example', 'Ví dụ — mẫu: 1) Câu tiếng Anh. (Bản dịch.)'], ['collocation', 'Collocation (mỗi dòng "cụm: nghĩa")'], ['synonyms', '3 từ đồng nghĩa'], ['antonyms', '3 từ trái nghĩa'], ['section', 'Phần (PASSAGE / SECTION)']];

  const rawOf = (w, k) => ((k + '_raw') in w ? w[k + '_raw'] : w[k]) || '';
  function editWord(w, onSaved) {
    const m = modal(`<h2 style="margin-top:0">Sửa "${esc(w.word)}"</h2><form id="ew">
      ${EDIT_FIELDS.map(([k, l]) => `<label class="field"><span>${l}</span>${['meaning', 'example', 'collocation'].includes(k) ? `<textarea class="input" name="${k}" rows="4">${esc(rawOf(w, k))}</textarea>` : `<input class="input" name="${k}" value="${esc(rawOf(w, k))}">`}</label>`).join('')}
      ${can.owner() ? `<label class="field"><span><span class="tag owner">Ghi chú dời – chỉ Owner thấy</span></span><input class="input" name="admin_note" value="${esc(w.admin_note)}"></label>` : ''}
      <div class="row"><button type="button" class="btn danger" id="del">Xoá từ</button><span class="spacer"></span><button class="btn primary">Lưu</button></div></form>`);
    const f = m.el.querySelector('#ew');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fields = {};
      EDIT_FIELDS.forEach(([k]) => { fields[k] = f[k].value; });
      const payload = { word_id: w.word_id, fields };
      if (f.admin_note) payload.admin_note = f.admin_note.value;
      try { await Api.call('updateWord', payload); m.close(); toast('Đã lưu'); onSaved(); } catch (err) { toast(err.message); }
    };
    m.el.querySelector('#del').onclick = async () => {
      if (!confirm(`Xoá "${w.word}" khỏi bộ? Không hoàn tác được.`)) return;
      try { await Api.call('deleteWord', { word_id: w.word_id }); m.close(); toast('Đã xoá'); onSaved(); } catch (err) { toast(err.message); }
    };
  }

  async function comments(w, onChange) {
    const m = modal(`<h2 style="margin-top:0">Bình luận · ${esc(w.word)}</h2><div id="cl" class="small muted">Đang tải…</div>
      ${can.learn() ? '<form id="cf" class="row" style="margin-top:12px"><input class="input" style="flex:1" name="t" maxlength="1000" placeholder="Góp ý về nghĩa, ví dụ, phát âm…" required><button class="btn primary">Gửi</button></form>' : ''}`);
    const list = m.el.querySelector('#cl');
    async function load() {
      try {
        const cs = await Api.call('listComments', { target: w.word_id });
        list.innerHTML = cs.length ? cs.map((c) => html`<div style="padding:8px 0;border-bottom:1px solid var(--border)${c.resolved === 'true' ? ';opacity:.55' : ''}"><b>${c.email}</b> <span class="muted">${new Date(c.at).toLocaleString('vi-VN')}</span>${c.resolved === 'true' ? ' · đã xử lý' : ''}<div style="color:var(--text)">${c.text}</div>
          ${c.resolved !== 'true' && (can.edit() || (user && c.email === user.email)) ? raw(`<button class="btn sm" data-res="${esc(c.comment_id)}">Đánh dấu đã xử lý</button>`) : ''}</div>`).join('') : 'Chưa có bình luận.';
      } catch (e) { list.textContent = e.message; }
    }
    list.onclick = async (e) => {
      const b = e.target.closest('[data-res]');
      if (!b) return;
      try { await Api.call('resolveComment', { comment_id: b.dataset.res }); await load(); onChange(); } catch (err) { toast(err.message); }
    };
    const cf = m.el.querySelector('#cf');
    if (cf) cf.onsubmit = async (e) => {
      e.preventDefault();
      try { await Api.call('addComment', { target: w.word_id, text: cf.t.value }); cf.reset(); await load(); onChange(); } catch (err) { toast(err.message); }
    };
    load();
  }

  function editDeck(d) {
    const vis = [['private', 'Riêng tư – chỉ mình tôi'], ['shared', 'Chia sẻ – người được duyệt']].concat(can.edit() ? [['public', 'Công khai – mọi người dùng']] : []);
    const m = modal(`<h2 style="margin-top:0">Sửa thông tin bộ</h2><form id="de">
      <label class="field"><span>Tên bộ</span><input class="input" name="title" maxlength="120" required value="${esc(d.title)}"></label>
      <label class="field"><span>Mô tả</span><input class="input" name="description" maxlength="500" value="${esc(d.description)}"></label>
      ${d.parent_id ? '' : `<label class="field"><span>Chế độ</span><select class="input" name="visibility">${vis.map(([k, l]) => `<option value="${k}" ${k === d.visibility ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small muted">Muốn chia sẻ cho email cụ thể: dùng nút "Chia sẻ" (cần quản trị viên duyệt).</p>`}
      <button class="btn primary">Lưu</button></form>`);
    const f = m.el.querySelector('#de');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const p = { deck_id: d.deck_id, title: f.title.value.trim(), description: f.description.value };
      if (f.visibility) p.visibility = f.visibility.value;
      try { await Api.call('updateDeck', p); await Data.loadDecks(); m.close(); toast('Đã lưu'); viewDeck(d.deck_id); } catch (err) { toast(err.message); }
    };
  }

  function deleteDeckDialog(d, kids) {
    const m = modal(html`<h2 style="margin-top:0">Xoá bộ "${d.title}"?</h2>
      <p>Xoá vĩnh viễn <b>${d.word_count} từ</b>${kids.length ? html` trong ${kids.length} bộ con` : ''}, bình luận và lịch ôn của các từ này. <b>Không hoàn tác được.</b></p>
      ${d.visibility !== 'private' ? raw('<p class="notice bad">Bộ này đang được chia sẻ — người được chia sẻ cũng sẽ mất bộ.</p>') : ''}
      <form id="dd"><label class="field"><span>Gõ <b>xoá</b> để xác nhận</span><input class="input" name="c" autocomplete="off"></label>
      <div class="row"><button type="button" class="btn" id="cancel">Huỷ</button><span class="spacer"></span><button class="btn danger" disabled>Xoá vĩnh viễn</button></div></form>`);
    const f = m.el.querySelector('#dd');
    const btn = f.querySelector('.danger');
    f.c.oninput = () => { btn.disabled = !/^xo[áa]$/i.test(f.c.value.trim()); };
    m.el.querySelector('#cancel').onclick = m.close;
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = 'Đang xoá…';
      try {
        const r = await Api.call('deleteDeck', { deck_id: d.deck_id });
        Progress.forget((r.deleted_ids || [d.deck_id]));
        await Data.loadDecks();
        m.close(); toast(`Đã xoá "${d.title}" (${r.words} từ)`);
        location.hash = d.parent_id ? '#/deck/' + d.parent_id : '#/decks';
      } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Xoá vĩnh viễn'; }
    };
  }

  // ---------- Bảng từ (như sheet Excel) + 5 ô tick ----------
  async function viewSheet(id) {
    loading('decks');
    let pack;
    try { pack = await Data.words(id); } catch (e) { return fail('decks', e); }
    const d = Data.deck(id) || pack.deck;
    const showNote = can.owner();
    const canEditDeck = !!(d && d.can_edit);
    let ccount = {};
    try { ccount = await Api.call('commentCounts', { deck_id: id }); } catch (e) { ccount = {}; }
    const PAGE = 150;
    let shown = PAGE;
    let query = '';
    shell('decks', `
      <p class="small"><a href="#/deck/${esc(id)}">← ${esc(d.title)}</a></p>
      <div class="row"><h1 style="margin-right:auto">Bảng từ</h1>
        <input id="q" class="input" style="max-width:260px" placeholder="Tìm từ, nghĩa…" aria-label="Tìm trong bảng"></div>
      <div class="legend" style="margin:6px 0 10px">Tick mức độ (đồng bộ với flashcard): ${S.LEVELS.slice(1).map((l, i) => `<span><i style="background:${LV_COLORS[i + 1]}"></i>${i + 1}. ${l}</span>`).join('')}</div>
      ${showNote ? '<p class="small"><span class="tag owner">Cột "Ghi chú dời" chỉ mình bạn (Owner) thấy</span></p>' : ''}
      <div class="table-wrap"><table class="sheet"><thead><tr>
        <th>#</th><th>Từ vựng</th><th>IPA</th><th>Từ loại</th><th>Nghĩa</th><th>Ví dụ</th><th>Collocation</th><th>3 từ đồng nghĩa</th><th>3 từ trái nghĩa</th><th>Mức độ</th>${showNote ? '<th>Ghi chú dời</th>' : ''}<th></th>
      </tr></thead><tbody id="tb"></tbody></table></div>
      <div class="row" style="margin-top:12px"><span id="count" class="small muted"></span><span class="spacer"></span><button id="more" class="btn">Xem thêm</button></div>
    `);
    const tb = document.getElementById('tb');
    const cols = showNote ? 12 : 11;
    function ticks(w) {
      const lv = levelOf(w.word_id) || 0;
      return `<div class="ticks" data-id="${esc(w.word_id)}">${[1, 2, 3, 4, 5].map((i) => `<button class="tick ${i <= lv ? 'on' : ''}" data-lv="${i}" title="${S.LEVELS[i]}" aria-label="${S.LEVELS[i]}" aria-pressed="${i <= lv}" ${can.learn() ? '' : 'disabled'}>✓</button>`).join('')}</div>`;
    }
    function render() {
      const q = query.toLowerCase();
      const list = q ? pack.words.filter((w) => (w.headword + ' ' + w.meaning + ' ' + w.synonyms).toLowerCase().includes(q)) : pack.words;
      let sec = null;
      const rows = [];
      list.slice(0, shown).forEach((w, i) => {
        if (w.section !== sec) { sec = w.section; if (sec) rows.push(`<tr class="section"><td colspan="${cols}">${esc(sec)}</td></tr>`); }
        rows.push(`<tr>
          <td class="muted">${i + 1}</td>
          <td class="word"><button class="icon-btn" style="width:30px;height:30px;vertical-align:middle" data-say="${esc(w.word)}" aria-label="Phát âm">${ICON.speaker}</button> ${esc(w.word)}${w.headnote ? `<div class="small muted" style="font-weight:400;white-space:normal">${esc(w.headnote)}</div>` : ''}</td>
          <td class="ipa">${esc(w.ipa)}</td><td>${esc(w.pos)}</td>
          <td class="pre">${esc(w.meaning)}</td><td class="pre">${esc(w.example)}</td><td class="pre">${esc(w.collocation)}</td>
          <td class="pre sm">${esc(rawOf(w, 'synonyms'))}</td><td class="pre sm">${esc(rawOf(w, 'antonyms'))}</td><td>${ticks(w)}</td>
          ${showNote ? `<td class="note">${esc(w.admin_note)}</td>` : ''}
          <td style="white-space:nowrap">${canEditDeck ? `<button class="btn sm" data-edit="${esc(w.word_id)}" title="Sửa từ" aria-label="Sửa ${esc(w.word)}">✎</button> ` : ''}<button class="btn sm" data-cmt="${esc(w.word_id)}" title="Bình luận" aria-label="Bình luận về ${esc(w.word)}">💬${ccount[w.word_id] ? ' ' + ccount[w.word_id] : ''}</button></td></tr>`);
      });
      tb.innerHTML = rows.join('');
      document.getElementById('count').textContent = `Hiển thị ${Math.min(shown, list.length)} / ${list.length} từ`;
      document.getElementById('more').classList.toggle('hidden', shown >= list.length);
    }
    render();
    let t;
    document.getElementById('q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); shown = PAGE; render(); }, 200); };
    document.getElementById('more').onclick = () => { shown += PAGE; render(); };
    const reload = async () => { pack = await Data.words(id, true); render(); };
    const refreshCounts = async () => { try { ccount = await Api.call('commentCounts', { deck_id: id }); } catch (e) { /* bỏ qua */ } render(); };
    tb.onclick = (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) { const w = pack.words.find((x) => x.word_id === ed.dataset.edit); return editWord(w, async () => { await Data.loadDecks(); reload(); }); }
      const cm = e.target.closest('[data-cmt]');
      if (cm) { const w = pack.words.find((x) => x.word_id === cm.dataset.cmt); return comments(w, refreshCounts); }
      const say = e.target.closest('[data-say]');
      if (say) return Speech.say(say.dataset.say);
      const b = e.target.closest('.tick');
      if (!b || !can.learn()) return;
      const id2 = b.parentElement.dataset.id;
      const cur = levelOf(id2) || 0;
      const lv = Number(b.dataset.lv);
      const target = lv === cur ? lv - 1 : lv;
      const base = Progress.get(id2) || S.newProgress(id2, new Date(), Progress.reminder());
      Progress.put(S.setLevel(base, target, new Date(), Progress.reminder(), { maintenance: Progress.maintenance() }));
      b.parentElement.outerHTML = ticks({ word_id: id2 });
    };
  }

  // ---------- Flashcard ----------
  function cardBack(w, family) {
    const senses = w.senses.length ? w.senses : [{ pos: '', en: w.meaning, vi: '' }];
    return `
      <div class="hw"><b>${esc(w.word)}</b><span class="ipa muted">${esc(w.ipa)}</span><span class="tag">${esc(w.pos)}</span></div>
      ${senses.map((s, i) => `<p class="sense">${senses.length > 1 ? `<b>${i + 1}.</b> ` : ''}${s.pos ? `<span class="pos">${esc(s.pos)}</span>` : ''}<span class="vi">${esc(s.vi)}</span>${s.vi && s.en ? ' — ' : ''}<span class="en">${esc(s.en)}</span></p>`).join('')}
      ${w.examples.map((x) => `<div class="ex"><div class="en">${esc(x.en)}</div>${x.vi ? `<div class="vi">${esc(x.vi)}</div>` : ''}${x.source ? `<div class="src">${esc(x.source)}</div>` : ''}</div>`).join('')}
      <details class="more"><summary>Word family · Collocation · Đồng/trái nghĩa</summary>
        ${family.length > 1 ? `<div class="kv"><b>Word family</b><div class="chips">${family.map((f) => `<span class="chip">${esc(f.word)} <span class="muted">${esc(f.pos)}</span></span>`).join('')}</div></div>` : ''}
        ${w.collocations.length ? `<div class="kv"><b>Collocation</b>${w.collocations.map((c) => `<div class="coll"><span class="ph">${esc(c.phrase)}</span>: ${esc(c.vi)}</div>`).join('')}</div>` : ''}
        <div class="kv"><b>Đồng nghĩa</b><div class="chips">${w.synonyms.map((s) => `<span class="chip">${esc(s)}</span>`).join('') || '<span class="muted">—</span>'}</div></div>
        <div class="kv"><b>Trái nghĩa</b><div class="chips">${w.antonyms.map((s) => `<span class="chip">${esc(s)}</span>`).join('') || '<span class="muted">(không có từ trái nghĩa trực tiếp)</span>'}</div></div>
      </details>`;
  }

  // Thu nhỏ chữ cho vừa một dòng; nếu là cụm dài thì cho xuống dòng ở khoảng trắng (không ngắt giữa từ).
  function fitText(el, max, min) {
    let size = max;
    el.style.whiteSpace = 'nowrap';
    el.style.overflowWrap = 'normal';
    el.style.fontSize = size + 'px';
    while (size > min && el.scrollWidth > el.clientWidth + 1) { size -= 1; el.style.fontSize = size + 'px'; }
    if (el.scrollWidth > el.clientWidth + 1) { el.style.whiteSpace = 'normal'; el.style.overflowWrap = 'anywhere'; }
  }
  function fitBody(body) {
    let size = 18;
    body.style.setProperty('--fs', size + 'px');
    while (size > 14 && body.scrollHeight > body.clientHeight + 1) { size -= 0.5; body.style.setProperty('--fs', size + 'px'); }
  }

  // Dùng chung cho chế độ Flashcard và bước 1 của phiên ôn.
  function mountFlashcards(container, words, opts) {
    opts = opts || {};
    let i = 0;
    let flipped = false;
    const byFamily = {};
    (opts.allWords || words).forEach((w) => { (byFamily[w.family_id] = byFamily[w.family_id] || []).push(w); });
    const autoSay = () => LS.get('vol.autosay', true);
    function show() {
      const w = words[i];
      flipped = false;
      container.innerHTML = `
        <div class="progress-line"><i style="width:${((i + 1) / words.length) * 100}%"></i></div>
        <div class="row small muted" style="margin-bottom:8px"><span>Thẻ ${i + 1} / ${words.length}</span><span class="spacer"></span>${lvPill(levelOf(w.word_id))}</div>
        <div class="fc" id="fc" tabindex="0" role="button" aria-label="Lật thẻ">
          <div class="fc-tools"><button class="icon-btn" id="say" aria-label="Phát âm">${ICON.speaker}</button></div>
          <div class="fc-inner">
            <div class="fc-face fc-front"><div class="fc-word" id="fw" style="width:100%">${esc(w.word)}</div>${w.headnote ? `<div class="small muted">${esc(w.headnote)}</div>` : ""}<div class="fc-ipa ipa">${esc(w.ipa)}</div><div class="small muted">Chạm hoặc nhấn Space để lật</div></div>
            <div class="fc-face fc-back"><div class="fc-body" id="fb">${cardBack(w, byFamily[w.family_id] || [w])}</div></div>
          </div>
        </div>
        ${opts.rate ? `<div class="fc-rate"><button class="btn no" id="no">Chưa nhớ <span class="small muted">(1)</span></button><button class="btn yes" id="yes">Nhớ <span class="small muted">(2)</span></button></div>` : ''}
        <div class="fc-nav">
          <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>←</button>
          <button class="btn" id="flip">Lật thẻ</button>
          <button class="btn" id="next">${i === words.length - 1 ? 'Xong' : '→'}</button>
        </div>
        <div class="kbd">Phím tắt: Space/Enter lật · ← → chuyển thẻ${opts.rate ? ' · 1 Chưa nhớ · 2 Nhớ' : ''} · P phát âm</div>`;
      fitText(document.getElementById('fw'), Math.min(64, Math.max(30, 900 / Math.max(6, w.word.length))), 22);
      container.querySelector('#fc').onclick = (e) => { if (!e.target.closest('#say')) flip(); };
      container.querySelector('#say').onclick = () => Speech.say(w.word);
      container.querySelector('#flip').onclick = flip;
      container.querySelector('#prev').onclick = () => go(-1);
      container.querySelector('#next').onclick = () => go(1);
      if (opts.rate) {
        container.querySelector('#no').onclick = () => rate(false);
        container.querySelector('#yes').onclick = () => rate(true);
      }
      if (autoSay()) Speech.say(w.word);
    }
    function flip() {
      flipped = !flipped;
      container.querySelector('#fc').classList.toggle('flipped', flipped);
      if (flipped) fitBody(container.querySelector('#fb'));
    }
    function go(step) {
      if (i + step >= words.length) { teardown(); return opts.onDone && opts.onDone(); }
      i = Math.max(0, i + step); show();
    }
    function rate(ok) { if (opts.onRate) opts.onRate(words[i], ok); go(1); }
    function onKey(e) {
      if (e.target && e.target.matches && e.target.matches("input,textarea,select")) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key.toLowerCase() === 'p') Speech.say(words[i].word);
      else if (opts.rate && e.key === '1') rate(false);
      else if (opts.rate && e.key === '2') rate(true);
    }
    document.addEventListener('keydown', onKey);
    const onResize = () => { if (flipped && container.querySelector('#fb')) fitBody(container.querySelector('#fb')); };
    window.addEventListener('resize', onResize);
    function teardown() { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); }
    show();
    return teardown;
  }

  async function viewFlash(id, q) {
    loading('decks');
    let pack;
    try { pack = await Data.words(id); } catch (e) { return fail('decks', e); }
    const words = applyFilter(pack.words, q.get('filter'), q.get('order'));
    const d = Data.deck(id) || pack.deck;
    shell('decks', `<div class="fc-wrap"><p class="small"><a href="#/deck/${esc(id)}">← ${esc(d.title)}</a></p><div id="fcbox"></div></div>`);
    const box = document.getElementById('fcbox');
    if (!words.length) { box.innerHTML = '<div class="notice">Không có thẻ nào khớp bộ lọc.</div>'; return; }
    cleanup = mountFlashcards(box, words, {
      allWords: pack.words,
      rate: can.learn(),
      onRate: (w) => { if (!Progress.get(w.word_id)) Progress.put(S.newProgress(w.word_id, new Date(), Progress.reminder())); },
      onDone: () => { box.innerHTML = html`<div class="card"><h2 style="margin-top:0">Xong ${words.length} thẻ</h2><p class="muted">Từ mới đã được đưa vào lịch ôn: lần ôn thứ 2 vào tối nay lúc ${Progress.reminder()}.</p><div class="row"><a class="btn primary" href="#/review">Ôn tập</a><a class="btn" href="#/deck/${id}">Về bộ từ</a></div></div>`; },
    });
  }

  // ---------- Cài đặt ----------
  function viewSettings() {
    const hours = [];
    for (let h = 18; h <= 23; h++) for (const m of ['00', '30']) { const t = `${h}:${m}`; if (t <= '23:30') hours.push(t); }
    const voices = Speech.voices;
    const cur = Speech.pick();
    const theme = LS.get('vol.theme', 'auto');
    shell('settings', `
      <div class="narrow">
      <h1>Cài đặt</h1>
      <div class="card">
        ${can.learn() ? `<label class="field"><span>Giờ nhắc ôn mỗi tối (phải trước 24:00)</span>
          <select id="rh" class="input">${hours.map((h) => `<option ${h === Progress.reminder() ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
          <button class="btn sm" id="notif">Bật thông báo trên trình duyệt</button>` : ''}
        <label class="field"><span>Giọng đọc (lấy từ trình duyệt của bạn: Chrome dùng giọng Google, Safari dùng giọng Apple)</span>
          <select id="voice" class="input">${voices.length ? voices.map((v) => html`<option value="${v.voiceURI}" ${cur && v.voiceURI === cur.voiceURI ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join('') : '<option>Trình duyệt chưa cung cấp giọng tiếng Anh</option>'}</select></label>
        <label class="field"><span>Tốc độ đọc: <b id="rv">${LS.get('vol.rate', 0.9)}</b></span><input id="rate" type="range" min="0.6" max="1.2" step="0.1" value="${LS.get('vol.rate', 0.9)}" style="width:100%"></label>
        <div class="row"><button class="btn sm" id="test">Nghe thử</button>
        <label class="small"><input type="checkbox" id="autosay" ${LS.get('vol.autosay', true) ? 'checked' : ''}> Tự đọc từ khi mở thẻ</label></div>
        <label class="field"><span>Giao diện</span><select id="theme" class="input">
          <option value="auto" ${theme === 'auto' ? 'selected' : ''}>Theo hệ thống</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Sáng</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Tối</option></select></label>
      </div>
      <p><button class="btn danger" id="logout">Đăng xuất</button></p>
      <p class="small muted"><a href="#/legal/privacy">Chính sách bảo mật</a> · <a href="#/legal/terms">Điều khoản</a> · <a href="#/legal/disclaimer">Miễn trừ trách nhiệm</a> · <a href="#/legal/complaints">Khiếu nại</a></p>
      </div>`);
    const rh = document.getElementById('rh');
    if (rh) rh.onchange = async () => {
      try { await Api.call('setReminder', { reminder_hour: rh.value }); user.reminder_hour = rh.value; LS.set('vol.user', user); toast('Đã lưu giờ nhắc ' + rh.value); }
      catch (e) { toast(e.message); }
    };
    const nb = document.getElementById('notif');
    if (nb) nb.onclick = async () => {
      if (!('Notification' in window)) return toast('Trình duyệt không hỗ trợ thông báo');
      const r = await Notification.requestPermission();
      toast(r === 'granted' ? 'Đã bật thông báo' : 'Chưa được cho phép');
    };
    document.getElementById('voice').onchange = (e) => LS.set('vol.voice', e.target.value);
    document.getElementById('rate').oninput = (e) => { LS.set('vol.rate', Number(e.target.value)); document.getElementById('rv').textContent = e.target.value; };
    document.getElementById('test').onclick = () => Speech.say('Resilient communities recover quickly from setbacks.');
    document.getElementById('autosay').onchange = (e) => LS.set('vol.autosay', e.target.checked);
    document.getElementById('theme').onchange = (e) => { LS.set('vol.theme', e.target.value); applyTheme(); };
    document.getElementById('logout').onclick = async () => { await Progress.flush(); Api.logout(); user = null; location.hash = '#/'; route(); };
  }

  function applyTheme() {
    const t = LS.get('vol.theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- Quản trị ----------
  async function viewAdmin() {
    if (!can.edit()) return fail('admin', 'Bạn không có quyền quản trị.');
    loading('admin');
    let u, cfg, log;
    try { [u, cfg, log] = await Promise.all([Api.call('listUsers'), Api.call('getConfig'), Api.call('auditLog', { limit: 50 })]); } catch (e) { return fail('admin', e); }
    const isOwner = can.owner();
    const assignable = isOwner ? ['viewer', 'learner', 'editor'] : ['viewer', 'learner'];
    const label = { viewer: 'Viewer', learner: 'Học viên', editor: 'Editor', owner: 'Owner' };
    const manageable = (r) => r !== 'owner' && (isOwner || r === 'viewer' || r === 'learner');
    shell('admin', `
      <h1>Quản trị</h1>
      <p class="small muted">${isOwner ? 'Bạn là Owner: cấp/thu hồi mọi quyền, kể cả Editor. Không ai thu hồi được quyền Owner.' : 'Bạn là Editor: cấp/thu hồi quyền Viewer và Học viên. Chỉ Owner thay đổi được quyền Editor. Mọi thay đổi được báo cho Owner.'}</p>
      ${u.requests.length ? `<h2>Yêu cầu truy cập đang chờ</h2><div class="card">${u.requests.map((r) => html`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${r.requester}</b><span class="small muted">${r.note || ''}</span><span class="spacer"></span>${raw(assignable.map((k) => `<button class="btn sm" data-grant="${esc(r.requester)}" data-role="${k}">${label[k]}</button>`).join(''))}</div>`).join('')}</div>` : ''}
      <h2>Mời người dùng</h2>
      <form id="addu" class="card">
        ${cfg.invite_only === 'true' ? '<p class="small" style="margin-top:0"><span class="tag owner">Thử nghiệm kín</span> Chỉ người được mời mới đăng nhập được; người lạ không gửi được yêu cầu.</p>' : ''}
        <label class="field" style="margin-top:0"><span>Email (nhiều email: mỗi dòng một email hoặc cách nhau bằng dấu phẩy, tối đa 50)</span><textarea class="input" name="emails" rows="3" required placeholder="hocvien1@gmail.com&#10;hocvien2@gmail.com"></textarea></label>
        <div class="row"><label class="small">Quyền <select name="role" class="input" style="width:auto">${assignable.map((k) => `<option value="${k}" ${k === 'learner' ? 'selected' : ''}>${label[k]}</option>`).join('')}</select></label>
          <label class="small"><input type="checkbox" name="send" checked> Gửi email mời kèm link đăng nhập (hiệu lực 72 giờ)</label></div>
        <label class="field"><span>Lời nhắn kèm theo (tuỳ chọn)</span><input class="input" name="message" maxlength="500" placeholder="Ví dụ: Lớp IELTS tối thứ 3 – học bộ VOL 1 trước"></label>
        <button class="btn primary">Mời</button>
        <div id="invres" class="small" style="margin-top:8px"></div>
      </form>
      <h2>Người dùng</h2>
      <div class="table-wrap"><table class="sheet" style="min-width:640px"><thead><tr><th>Email</th><th>Quyền</th><th>Trạng thái</th><th>Người duyệt</th><th></th></tr></thead><tbody>
      ${u.users.map((x) => html`<tr><td>${x.email}</td><td>${manageable(x.role) && x.status === 'active' ? raw(`<select class="input" style="min-height:32px" data-role-of="${esc(x.email)}">${assignable.map((k) => `<option value="${k}" ${k === x.role ? 'selected' : ''}>${label[k]}</option>`).join('')}</select>`) : x.role_label}</td>
        <td>${x.status === 'active' ? 'Đang hoạt động' : 'Đã thu hồi'}</td><td class="small muted">${x.approved_by || ''}</td>
        <td>${manageable(x.role) ? raw(x.status === 'active' ? `<button class="btn sm danger" data-revoke="${esc(x.email)}">Thu hồi</button>` : `<button class="btn sm" data-grant="${esc(x.email)}" data-role="learner">Khôi phục (Học viên)</button>`) : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Cấu hình</h2>
      <form id="cfg" class="card">
        <label class="field"><span>Ngưỡng đạt Writing/Speaking (band LR và GRA)</span><select name="pass_band" class="input">${['6.0', '6.5', '7.0'].map((b) => `<option ${cfg.pass_band === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="field"><span>Giới hạn số từ mỗi Học viên tự tạo (0 = không giới hạn; Owner/Editor không bị giới hạn)</span><input name="max_words_per_learner" class="input" inputmode="numeric" pattern="\\d{1,6}" value="${esc(cfg.max_words_per_learner || '5000')}"></label>
        <label class="field"><span>Giờ nhắc mặc định</span><input name="reminder_hour" class="input" value="${esc(cfg.reminder_hour)}" pattern="\\d{2}:\\d{2}"></label>
        <label class="small"><input type="checkbox" name="maintenance" ${cfg.maintenance === 'true' ? 'checked' : ''}> Ôn duy trì 30 ngày/lần sau khi Nằm lòng</label><br>
        <label class="small"><input type="checkbox" name="reminder_email" ${cfg.reminder_email === 'true' ? 'checked' : ''}> Gửi email nhắc ôn hằng ngày (cần bật trình kích hoạt hourlyReminder)</label><br>
        ${isOwner ? `<label class="small"><input type="checkbox" name="invite_only" ${cfg.invite_only === 'true' ? 'checked' : ''}> Thử nghiệm kín: chỉ người được mời mới đăng nhập (bỏ chọn = cho phép người lạ gửi yêu cầu truy cập)</label><br>` : ''}
        ${isOwner ? `<label class="small"><input type="checkbox" name="notify_editors_on_access" ${cfg.notify_editors_on_access === 'true' ? 'checked' : ''}> Gửi yêu cầu truy cập cho cả Editor duyệt</label><br>` : ''}
        <p class="small muted">Nguồn dữ liệu miễn phí (tự tắt nếu đòi phí): ${['api_dictionary', 'api_datamuse', 'api_languagetool'].map((k) => html`<label><input type="checkbox" name="${k}" ${cfg[k] !== 'off' ? 'checked' : ''}> ${k.replace('api_', '')}</label>`).join(' · ')}</p>
        <button class="btn primary">Lưu cấu hình</button>
      </form>
      <h2>Nhật ký gần đây</h2>
      <div class="table-wrap"><table class="sheet" style="min-width:640px"><tbody>${log.map((l) => html`<tr><td class="small muted">${new Date(l.at).toLocaleString('vi-VN')}</td><td>${l.actor}</td><td>${l.action}</td><td>${l.target}</td></tr>`).join('')}</tbody></table></div>
    `);
    const main = document.getElementById('main');
    const setRole = async (email, role) => {
      try { await Api.call('setRole', { email, role }); toast('Đã cập nhật quyền'); viewAdmin(); } catch (e) { toast(e.message); }
    };
    main.onclick = (e) => {
      const g = e.target.closest('[data-grant]');
      if (g) return setRole(g.dataset.grant, g.dataset.role);
      const r = e.target.closest('[data-revoke]');
      if (r && confirm('Thu hồi quyền của ' + r.dataset.revoke + '?')) setRole(r.dataset.revoke, 'revoke');
    };
    main.onchange = (e) => { const s = e.target.closest('[data-role-of]'); if (s) setRole(s.dataset.roleOf, s.value); };
    document.getElementById('addu').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button'); btn.disabled = true;
      const txt = { invited: 'đã cấp quyền + gửi email mời', granted: 'đã cấp quyền (không gửi email)', granted_no_mail: 'đã cấp quyền, nhưng chưa gửi được email (hết hạn mức hôm nay) — báo họ tự vào trang và nhập email', exists: 'đã có quyền này', invalid: 'email không hợp lệ', forbidden: 'bạn không đổi được quyền của tài khoản này' };
      try {
        const r = await Api.call('inviteUsers', { emails: f.emails.value, role: f.role.value, message: f.message.value, send_mail: f.send.checked });
        const ok = r.results.filter((x) => ['invited', 'granted', 'granted_no_mail'].includes(x.status)).length;
        toast(`Đã mời ${ok}/${r.results.length} email`);
        await viewAdmin();
        document.getElementById('invres').innerHTML = r.results.map((x) => html`<div><b>${x.email}</b>: ${txt[x.status] || x.status}</div>`).join('');
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
    document.getElementById('cfg').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const values = { max_words_per_learner: f.max_words_per_learner.value.trim() || '0', pass_band: f.pass_band.value, reminder_hour: f.reminder_hour.value, maintenance: String(f.maintenance.checked), reminder_email: String(f.reminder_email.checked) };
      if (f.notify_editors_on_access) values.notify_editors_on_access = String(f.notify_editors_on_access.checked);
      if (f.invite_only) values.invite_only = String(f.invite_only.checked);
      ['api_dictionary', 'api_datamuse', 'api_languagetool'].forEach((k) => { values[k] = f[k].checked ? 'on' : 'off'; });
      try { const c = await Api.call('updateConfig', { values }); LS.set('vol.config', c); toast('Đã lưu cấu hình'); } catch (err) { toast(err.message); }
    };
  }

  // ---------- Bộ định tuyến ----------
  const ROUTES = [
    [/^#\/login\/([0-9a-f]+)$/, (m) => doLogin(m[1]), true],
    [/^#\/legal\/(\w+)$/, (m) => window.VolLegal ? VolLegal.view(m[1], shell, !!Api.session) : null, true],
    [/^#\/?$/, () => viewHome()],
    [/^#\/decks$/, () => viewDecks()],
    [/^#\/deck\/([\w-]+)$/, (m) => viewDeck(m[1])],
    [/^#\/sheet\/([\w-]+)$/, (m) => viewSheet(m[1])],
    [/^#\/flash\/([\w-]+)$/, (m, q) => viewFlash(m[1], q)],
    [/^#\/settings$/, () => viewSettings()],
    [/^#\/admin$/, () => viewAdmin()],
  ];
  const extra = [];

  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const [path, qs] = (location.hash || '#/').split('?');
    const q = new URLSearchParams(qs || '');
    for (const [re, fn, open] of ROUTES.concat(extra)) {
      const m = path.match(re);
      if (!m) continue;
      if (!open && !Api.session) return viewLogin();
      window.scrollTo(0, 0);
      return fn(m, q);
    }
    if (!Api.session) return viewLogin();
    fail('home', 'Không tìm thấy trang.');
  }

  window.VolApp = {
    get user() { return user; }, can, shell, loading, fail, levelOf, lvPill, applyFilter, mountFlashcards, deckProgress,
    addRoute(re, fn, open) { extra.push([re, fn, open]); },
    setCleanup(fn) { cleanup = fn; },
  };

  applyTheme();
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => { if (Api.session && !location.hash.startsWith('#/login/')) boot(); else route(); });
})();
