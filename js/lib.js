// Thư viện dùng chung: gọi API, phiên, bộ nhớ đệm, tiến độ, giọng đọc, tiện ích DOM.
(function () {
  const CFG = window.VOL_CONFIG || { API_URL: '/api' };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy hoặc bị chặn */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
  };

  // ---------- API ----------
  const Api = {
    session: LS.get('vol.session', null),
    async call(action, payload) {
      let res;
      try {
        res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload: payload || {}, session: Api.session }) });
      } catch (e) {
        throw Object.assign(new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'), { code: 'network' });
      }
      const data = await res.json().catch(() => ({ ok: false, error: { code: 'server', message: 'Máy chủ trả về dữ liệu lỗi' } }));
      if (!data.ok) {
        if (data.error && data.error.code === 'auth' && Api.session) { Api.logout(); location.hash = '#/'; }
        throw Object.assign(new Error(data.error.message), { code: data.error.code });
      }
      return data.data;
    },
    setSession(s) { Api.session = s; LS.set('vol.session', s); },
    logout() { Api.session = null; ['vol.session', 'vol.user', 'vol.progress', 'vol.pending', 'vol.notified', 'vol.decks'].forEach(LS.del); Object.assign(Progress, { items: {}, pending: {}, attempts: [] }); },
  };

  // ---------- IndexedDB (bộ nhớ đệm bộ từ) ----------
  const Cache = {
    db: null,
    async open() {
      if (Cache.db !== null) return Cache.db;
      Cache.db = await new Promise((resolve) => {
        try {
          const r = indexedDB.open('vol-vocab', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
      return Cache.db;
    },
    mem: new Map(),
    async get(k) {
      if (Cache.mem.has(k)) return Cache.mem.get(k);
      const db = await Cache.open();
      if (!db) return undefined;
      return new Promise((resolve) => {
        try {
          const r = db.transaction('kv').objectStore('kv').get(k);
          r.onsuccess = () => { if (r.result !== undefined) Cache.mem.set(k, r.result); resolve(r.result); };
          r.onerror = () => resolve(undefined);
        } catch (e) { resolve(undefined); }
      });
    },
    async set(k, v) {
      Cache.mem.set(k, v);
      const db = await Cache.open();
      if (!db) return;
      try { db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* bỏ qua */ }
    },
  };

  // ---------- Dữ liệu bộ từ ----------
  const Data = {
    decks: [],
    async loadDecks() { Data.decks = await Api.call('listDecks'); LS.set('vol.decks', Data.decks); return Data.decks; },
    deck(id) { return Data.decks.find((d) => d.deck_id === id); },
    children(id) { return Data.decks.filter((d) => d.parent_id === id); },
    // Lấy từ của bộ (có cache theo updated_at); trả về từ đã tách cột.
    async words(deckId, force) {
      const d = Data.deck(deckId);
      const key = 'words:' + deckId + ':' + (Api.session ? Api.session.slice(-12) : '');
      const cached = await Cache.get(key);
      let pack = cached;
      if (force || !cached || !d || cached.updated_at !== d.updated_at) {
        pack = await Api.call('deckWords', { deck_id: deckId });
        pack.updated_at = pack.deck.updated_at;
        await Cache.set(key, pack);
      }
      const notes = pack.admin_notes || {};
      return { deck: pack.deck, words: pack.words.map((w) => Object.assign(VolParse.parseWord(w), { admin_note: notes[w.word_id] || '' })) };
    },
  };

  // Đoạn văn gốc của bộ con (bài đọc / transcript), có cache.
  Data.passages = async function (subId) {
    const key = 'passages:' + subId;
    let v = await Cache.get(key);
    if (!v) {
      try { v = await Api.call('deckPassages', { deck_id: subId }); } catch (e) { v = []; }
      await Cache.set(key, v);
    }
    return v;
  };

  // ---------- Tiến độ (đồng bộ máy chủ, lưu tạm trên máy) ----------
  const Progress = {
    items: {},
    pending: {},
    attempts: [],
    timer: null,
    load() {
      Progress.items = LS.get('vol.progress', {});
      const q = LS.get('vol.pending', null);
      if (q) { Object.assign(Progress.pending, q.items || {}); Progress.attempts = (q.attempts || []).concat(Progress.attempts); }
      if (Object.keys(Progress.pending).length || Progress.attempts.length) Progress.schedule();
    },
    persistQueue() { LS.set('vol.pending', { items: Progress.pending, attempts: Progress.attempts.slice(-500) }); },
    async pull() {
      const r = await Api.call('getProgress');
      Object.entries(r.items || {}).forEach(([k, v]) => {
        const cur = Progress.items[k];
        if (!cur || String(v.last_review_at || '') >= String(cur.last_review_at || '')) Progress.items[k] = v;
      });
      LS.set('vol.progress', Progress.items);
    },
    get(id) { return Progress.items[id] || null; },
    put(p) {
      Progress.items[p.word_id] = p;
      Progress.pending[p.word_id] = p;
      LS.set('vol.progress', Progress.items);
      Progress.persistQueue();
      Progress.schedule();
    },
    log(a) { Progress.attempts.push(Object.assign({ at: new Date().toISOString() }, a)); Progress.persistQueue(); Progress.schedule(); },
    schedule() { clearTimeout(Progress.timer); Progress.timer = setTimeout(Progress.flush, 4000); },
    async flush() {
      const items = Progress.pending;
      const attempts = Progress.attempts;
      if (!Object.keys(items).length && !attempts.length) return;
      Progress.pending = {}; Progress.attempts = [];
      try { await Api.call('saveProgress', { items, attempts }); }
      catch (e) { Progress.pending = Object.assign(items, Progress.pending); Progress.attempts = attempts.concat(Progress.attempts); }
      Progress.persistQueue();
    },
    // Bỏ lịch ôn của các từ thuộc bộ đã xoá (word_id = <deck_id>-<số>); máy chủ cũng nhận bản ghi xoá.
    forget(deckIds) {
      const gone = Object.keys(Progress.items).filter((k) => deckIds.includes(k.replace(/-[^-]+$/, '')));
      gone.forEach((k) => { delete Progress.items[k]; delete Progress.pending[k]; });
      LS.set('vol.progress', Progress.items);
      Progress.persistQueue();
      return gone.length;
    },
    reminder() { const u = LS.get('vol.user', {}); return (u && u.reminder_hour) || (LS.get('vol.config', {}).reminder_hour) || '22:00'; },
    maintenance() { return LS.get('vol.config', {}).maintenance === 'true'; },
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Progress.flush(); });
  window.addEventListener('pagehide', () => Progress.flush());
  window.addEventListener('online', () => Progress.flush());

  // ---------- Giọng đọc của trình duyệt ----------
  const Speech = {
    voices: [],
    init() {
      if (!('speechSynthesis' in window)) return;
      const load = () => { Speech.voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang)); };
      load();
      speechSynthesis.onvoiceschanged = load;
    },
    pick() {
      const want = LS.get('vol.voice', '');
      return Speech.voices.find((v) => v.voiceURI === want) || Speech.voices.find((v) => /en[-_]GB/i.test(v.lang)) || Speech.voices[0] || null;
    },
    say(text, rate) {
      if (!('speechSynthesis' in window) || !text) return false;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = Speech.pick();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = rate || LS.get('vol.rate', 0.9);
      speechSynthesis.speak(u);
      return true;
    },
    canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    // Nhận giọng nói → văn bản. Trả về { stop() }.
    listen(onResult, onEnd) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return null;
      const r = new SR();
      r.lang = (Speech.pick() && Speech.pick().lang) || 'en-GB';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;
      let finalText = '';
      let conf = [];
      const started = Date.now();
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) { finalText += res[0].transcript + ' '; conf.push(res[0].confidence || 0); } else interim += res[0].transcript;
        }
        onResult((finalText + interim).trim(), false);
      };
      r.onerror = (e) => { if (onEnd) onEnd(null, e.error); };
      r.onend = () => { if (onEnd) onEnd({ text: finalText.trim(), confidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null, seconds: (Date.now() - started) / 1000 }); };
      r.start();
      return { stop: () => r.stop() };
    },
  };
  Speech.init();

  // ---------- Tiện ích DOM ----------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // Mẫu HTML an toàn: giá trị chèn vào được mã hoá, trừ kết quả html`` lồng nhau hoặc raw().
  function html(strings, ...vals) {
    const s = strings.reduce((out, str, i) => out + str + (i < vals.length ? (vals[i] && vals[i].__html !== undefined ? vals[i].__html : esc(vals[i])) : ''), '');
    return raw(s);
  }
  function raw(s) { const o = new String(s); o.__html = String(s); return o; }
  function toast(msg, ms) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const ICON = {
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>',
  };

  window.Vol = { CFG, LS, Api, Cache, Data, Progress, Speech, esc, html, raw, toast, shuffle, ICON };
})();
