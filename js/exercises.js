// Bài tập 4 kỹ năng, luyện tập tự do (#/practice) và phiên ôn ngắt quãng (#/review).
(function () {
  const { Api, Data, Progress, Speech, LS, html, esc, toast, shuffle, ICON } = Vol;
  const S = VolSRS;
  const G = VolGrade;
  const P = VolParse;
  const A = VolApp;
  const MAX_SESSION = 30;

  // Câu hỏi Speaking kiểu IELTS (tự soạn), chọn theo chủ đề gần với ví dụ của từ.
  const QUESTIONS = [
    ['work job career company business office employ', 'Do you work or are you a student? Tell me about it.'],
    ['study school university student learn course education teacher', 'What do you find most challenging about studying?'],
    ['home house live city town neighbour resident area', 'What do you like most about the area where you live?'],
    ['technology computer phone internet online digital device data', 'How has technology changed the way people communicate?'],
    ['environment climate pollution nature forest energy waste green', 'What can individuals do to protect the environment?'],
    ['health food diet exercise disease medical hospital doctor', 'What do people in your country do to stay healthy?'],
    ['travel tourist holiday trip journey transport visit', 'Tell me about a memorable trip you have taken.'],
    ['money price cost pay buy shop market economy trade goods', 'Do you think people spend too much money on things they do not need?'],
    ['history ancient museum culture tradition heritage past', 'Why is it important to learn about history?'],
    ['art music film book read write creative', 'How important are the arts in people\'s lives?'],
    ['science research experiment scientist discovery evidence', 'Should governments spend more money on scientific research?'],
    ['government law policy rule public society', 'What role should the government play in people\'s lives?'],
    ['family child parent young old generation', 'How have family relationships changed in recent years?'],
    ['sport team game competition win fitness', 'Why do some people enjoy watching sport so much?'],
    ['media news advertising television newspaper information', 'How do advertisements influence what people buy?'],
    ['animal species wildlife bird fish habitat', 'Why should we protect endangered animals?'],
    ['city urban traffic building population', 'What are the advantages and disadvantages of living in a big city?'],
    ['change develop improve growth future', 'How do you think your country will change in the next twenty years?'],
    ['problem difficult challenge solve risk', 'Describe a difficult problem you solved and how you did it.'],
    ['', 'Describe a recent experience in which this idea was important to you.'],
  ];

  function meaningVi(w) { const s = w.senses[0]; return s ? (s.vi || s.en) : w.meaning; }
  function meaningEn(w) { const s = w.senses[0]; return s ? s.en : ''; }
  function norm(s) { return String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim(); }
  function sameFamily(a, b) { return a.family_id === b.family_id; }

  function pickDistractors(w, pool, n, key) {
    const seen = new Set([norm(key(w))]);
    const fams = new Set();
    const wstem = String(w.word).toLowerCase().replace(/^(un|in|im|il|ir|dis|non|mis)/, '').slice(0, 5);
    const out = [];
    const pos0 = (x) => String(x.pos || '').replace(/[^a-z]/gi, ' ').trim().split(' ')[0].toLowerCase();
    const same = pool.filter((x) => pos0(x) === pos0(w));
    const ordered = shuffle(same).concat(shuffle(pool.filter((x) => pos0(x) !== pos0(w))));
    for (const x of ordered) {
      const stem = String(x.word).toLowerCase().replace(/^(un|in|im|il|ir|dis|non|mis)/, '').slice(0, 5);
      if (x.word_id === w.word_id || sameFamily(x, w) || fams.has(x.family_id) || fams.has(stem) || stem === wstem) continue;
      const k = norm(key(x));
      if (!k || seen.has(k)) continue;
      seen.add(k); fams.add(x.family_id); fams.add(stem); out.push(x);
      if (out.length >= n) break;
    }
    return out;
  }

  // Tìm từ mục tiêu trong một danh sách văn bản [{en, vi}] để đục lỗ.
  function clozeIn(texts, w) {
    const forms = P.answerForms(w.word);
    for (const ex of texts) {
      const en = ex.en.replace(/^…\s*/, '');
      for (const f of forms) {
        if (f.includes(' ')) {
          const i = en.toLowerCase().indexOf(f);
          if (i >= 0) return { text: en.slice(0, i) + '_____' + en.slice(i + f.length), answer: en.slice(i, i + f.length), vi: ex.vi, part: ex.part };
          continue;
        }
        const inf = G.inflections(f);
        const m = [...en.matchAll(/[A-Za-z]+(?:[-'’][A-Za-z]+)*/g)].find((t) => inf.has(t[0].toLowerCase()));
        if (m) return { text: en.slice(0, m.index) + '_____' + en.slice(m.index + m[0].length), answer: m[0], vi: ex.vi, part: ex.part };
      }
    }
    return null;
  }
  function cloze(w) { return clozeIn(shuffle(w.examples), w); }
  // Đoạn văn gốc chứa từ (Reading) hoặc câu trong transcript (Listening, bỏ tên người nói).
  function passageCloze(w, paras, sentenceOnly) {
    if (!paras || !paras.length) return null;
    let texts = shuffle(paras);
    if (sentenceOnly) {
      texts = [];
      paras.forEach((p) => p.en.split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/).forEach((sen) => {
        const en = sen.replace(/^[A-Z][A-Z .']{1,30}:\s*/, '').trim();
        if (en.split(' ').length >= 5 && en.split(' ').length <= 40) texts.push({ en, vi: '', part: p.part, para: p });
      }));
      texts = shuffle(texts);
    }
    const c = clozeIn(texts, w);
    if (c && sentenceOnly) {
      const hit = texts.find((t) => t.en.replace(/^…\s*/, '') === c.text.replace('_____', c.answer));
      if (hit) c.paraVi = hit.para.vi;
    }
    return c;
  }

  function buildItem(w, skill, pool, paras) {
    const c = cloze(w);
    const pc = skill === 'R' ? passageCloze(w, paras, false) : skill === 'L' ? passageCloze(w, paras, true) : null;
    let types;
    if (skill === 'L') types = pc ? ['listen-passage', 'listen-passage', 'listen-type', 'listen-mcq'] : ['listen-type', 'listen-mcq'].concat(c ? ['listen-cloze'] : []);
    else if (skill === 'R') types = pc ? ['read-passage', 'read-passage', 'read-passage-type'] : c ? ['read-cloze-mcq', 'read-cloze-type'] : ['read-meaning-mcq'];
    else if (skill === 'W') types = ['write'];
    else types = ['speak'];
    if (skill === 'R' && w.synonyms.length) types.push('read-syn');
    const type = types[Math.floor(Math.random() * types.length)];
    const item = { w, skill, type, cloze: /passage/.test(type) ? pc : c };
    if (type === 'listen-mcq') {
      const ds = pickDistractors(w, pool, 3, meaningVi);
      item.options = shuffle([w].concat(ds)).map((x) => ({ label: meaningVi(x), right: x === w }));
    } else if (type === 'read-cloze-mcq' || type === 'read-meaning-mcq' || type === 'read-passage') {
      const ds = pickDistractors(w, pool, 3, (x) => x.word);
      item.options = shuffle([w].concat(ds)).map((x) => ({ label: type !== 'read-meaning-mcq' && x === w ? item.cloze.answer : x.word, right: x === w }));
    } else if (type === 'read-syn') {
      const right = w.synonyms[0];
      const ds = pickDistractors(w, pool.filter((x) => x.synonyms.length), 3, (x) => x.synonyms[0]);
      item.options = shuffle([{ label: right, right: true }].concat(ds.map((x) => ({ label: x.synonyms[0], right: false }))));
    } else if (type === 'speak') {
      const bag = new Set(G.tokens(w.examples.map((e) => e.en).join(' ') + ' ' + w.senses.map((s) => s.en).join(' ')));
      let best = QUESTIONS[QUESTIONS.length - 1][1], score = 0;
      QUESTIONS.forEach(([kw, q]) => { const s = kw.split(' ').filter((k) => k && bag.has(k)).length; if (s > score) { score = s; best = q; } });
      item.question = best;
    }
    return item;
  }

  const subOf = (w) => String(w.word_id).replace(/-[^-]+$/, '');
  async function loadParas(words) {
    const out = {};
    for (const sub of [...new Set(words.map(subOf))]) out[sub] = await Data.passages(sub);
    return out;
  }

  const TITLES = {
    'listen-type': 'Nghe và gõ lại từ', 'listen-mcq': 'Nghe và chọn nghĩa đúng', 'listen-cloze': 'Nghe câu và điền từ còn thiếu',
    'read-cloze-mcq': 'Đọc và chọn từ điền vào chỗ trống', 'read-cloze-type': 'Đọc và gõ từ còn thiếu', 'read-meaning-mcq': 'Đọc nghĩa và chọn từ đúng',
    'read-syn': 'Chọn từ đồng nghĩa', 'read-passage': 'Đọc đoạn văn gốc và chọn từ điền vào chỗ trống', 'read-passage-type': 'Đọc đoạn văn gốc và gõ từ còn thiếu',
    'listen-passage': 'Nghe câu trong bài nghe gốc và gõ từ còn thiếu', write: 'Writing: đặt câu với từ', speak: 'Speaking: nói một câu dùng từ',
  };
  const SKILL_NAME = { L: 'Listening', R: 'Reading', W: 'Writing', S: 'Speaking' };

  // Chạy một chuỗi bài tập. onResult(item, passed, detail) sau mỗi bài; onFinish(results).
  function runExercises(box, items, opts) {
    let i = 0;
    const results = [];
    const cleanups = [];
    function done(item, passed, detail) {
      results.push({ item, passed });
      if (opts.onResult) opts.onResult(item, passed, detail || {});
    }
    function next() {
      cleanups.splice(0).forEach((f) => f());
      if (i >= items.length) return opts.onFinish(results);
      render(items[i++]);
    }
    function header(item) {
      return html`<div class="fc-top small muted"><span>${i} / ${items.length}</span><div class="progress-line"><i style="width:${(i / items.length) * 100}%"></i></div><span class="tag">${SKILL_NAME[item.skill]}</span></div>
        <h2 style="margin-top:0">${TITLES[item.type]}</h2>`;
    }
    function feedbackCard(item, ok, extra) {
      const w = item.w;
      return `<div class="feedback ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Chính xác!' : 'Chưa đúng'}</b>
        <div style="margin-top:6px"><b>${esc(w.word)}</b> <span class="ipa muted">${esc(w.ipa)}</span> <span class="tag">${esc(w.pos)}</span>
        <button class="icon-btn" style="width:32px;height:32px;vertical-align:middle" data-say="${esc(w.word)}" aria-label="Phát âm">${ICON.speaker}</button></div>
        <div>${esc(meaningVi(w))}${meaningEn(w) ? ' — <span class="muted">' + esc(meaningEn(w)) + '</span>' : ''}</div>
        ${w.examples[0] ? `<div class="ex"><div class="en">${esc(w.examples[0].en)}</div><div class="vi">${esc(w.examples[0].vi)}</div></div>` : ''}
        ${item.cloze && /passage/.test(item.type) && (item.cloze.vi || item.cloze.paraVi) ? `<details style="margin-top:6px"><summary class="small">Bản dịch đoạn văn</summary><p class="small">${esc(item.cloze.vi || item.cloze.paraVi)}</p></details>` : ''}
        ${extra || ''}</div>
        <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="nx">Tiếp tục<kbd class="on-desk">Enter</kbd></button></div>`;
    }
    function bindNext(el) {
      el.querySelector('#nx').onclick = next;
      el.querySelector('#nx').focus();
      el.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => Speech.say(b.dataset.say); });
    }

    function render(item) {
      const w = item.w;
      const t = item.type;
      if (t === 'listen-type' || t === 'listen-cloze' || t === 'read-cloze-type' || t === 'read-passage-type' || t === 'listen-passage') return renderType(item);
      if (item.options) return renderMcq(item);
      if (t === 'write' || t === 'speak') return renderProduce(item);
      return renderType(item);
    }

    // ---- Gõ đáp án (nghe/đọc) + gợi ý từng ký tự ----
    function renderType(item) {
      const w = item.w;
      const answer = item.type === 'listen-type' ? w.word : item.cloze.answer;
      const accept = new Set(item.type === 'listen-type' ? P.answerForms(w.word) : [answer.toLowerCase()]);
      const letters = [...answer];
      const maxHints = Math.max(1, Math.ceil(letters.filter((c) => /[a-z]/i.test(c)).length / 2));
      let hints = 0;
      const revealed = new Set();
      const speakText = item.type === 'listen-cloze' || item.type === 'listen-passage' ? item.cloze.text.replace('_____', answer) : w.word;
      const isListen = item.skill === 'L';
      box.innerHTML = header(item) + `
        <div class="card">
          ${isListen ? `<div class="row" style="justify-content:center"><button class="btn primary" id="play">${ICON.speaker} Nghe${item.type === 'listen-type' ? '' : ' câu'}</button><button class="btn" id="slow">Nghe chậm</button></div>` : ''}
          ${item.type !== 'listen-type' ? html`${item.cloze.part ? html`<p class="small muted">Trích ${item.cloze.part} – đề gốc</p>` : ''}<p class="passage" style="font-size:${item.type === 'read-passage-type' ? 17 : 18}px">${item.cloze.text}</p>${item.cloze.vi && !/passage/.test(item.type) ? html`<p class="muted small">${item.cloze.vi}</p>` : ''}` : `<p class="muted small" style="text-align:center">${esc(w.pos)}</p>`}
          ${!isListen ? html`<p class="small muted">Gợi ý nghĩa: ${meaningVi(w)}</p>` : ''}
          <div class="hint-mask" id="mask" aria-live="polite"></div>
          <input class="input" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Gõ từ bạn ${isListen ? 'nghe được' : 'chọn'}…" aria-label="Câu trả lời">
          <div class="row" style="margin-top:10px">
            <button class="btn" id="hint">Gợi ý (<span id="hl">${maxHints}</span>)</button>
            <button class="btn ghost" id="idk">Tôi không biết</button><span class="spacer"></span>
            <button class="btn primary" id="check">Kiểm tra</button>
          </div>
        </div><div id="fb"></div>`;
      const say = (rate) => Speech.say(speakText, rate);
      if (isListen) { box.querySelector('#play').onclick = () => say(); box.querySelector('#slow').onclick = () => say(0.7); setTimeout(() => say(), 250); }
      const mask = box.querySelector('#mask');
      const drawMask = () => { mask.textContent = hints ? letters.map((c, k) => (/[a-z]/i.test(c) && !revealed.has(k) ? '_' : c)).join('') : ''; };
      box.querySelector('#hint').onclick = () => {
        if (hints >= maxHints) return;
        hints++;
        const k = letters.findIndex((c, idx) => /[a-z]/i.test(c) && !revealed.has(idx));
        if (hints > 1 && k >= 0) revealed.add(k);
        box.querySelector('#hl').textContent = maxHints - hints;
        drawMask();
      };
      const input = box.querySelector('#ans');
      input.focus();
      const finish = (ok, given) => {
        box.querySelector('.card').querySelectorAll('button,input').forEach((b) => { b.disabled = true; });
        const passed = ok && hints < maxHints;
        box.querySelector('#fb').innerHTML = feedbackCard(item, ok, ok ? (hints ? `<div class="small muted">Dùng ${hints} gợi ý${passed ? '' : ' — quá nhiều gợi ý nên chưa tính là thuộc'}</div>` : '') : html`<div class="small">Đáp án: <b>${answer}</b>${given ? ` · Bạn gõ: ${given}` : ''}</div>`);
        bindNext(box);
        done(item, passed, { answer: given, hints });
      };
      box.querySelector('#check').onclick = () => {
        const v = norm(input.value);
        if (!v) return input.focus();
        finish(accept.has(v), input.value);
      };
      box.querySelector('#idk').onclick = () => finish(false, '');
      const onKey = (e) => {
        if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); box.querySelector('#check').click(); }
        else if (e.key === 'Enter' && box.querySelector('#nx')) { e.preventDefault(); next(); }
        else if (e.key === 'Control' && isListen) say();
      };
      document.addEventListener('keydown', onKey);
      cleanups.push(() => document.removeEventListener('keydown', onKey));
    }

    // ---- Trắc nghiệm ABCD + 50:50 ----
    function renderMcq(item) {
      const w = item.w;
      const isListen = item.skill === 'L';
      let prompt = '';
      if (item.type === 'listen-mcq') prompt = `<div class="row" style="justify-content:center"><button class="btn primary" id="play">${ICON.speaker} Nghe từ</button></div>`;
      else if (item.type === 'read-cloze-mcq') prompt = html`<p class="passage" style="font-size:18px">${item.cloze.text}</p>${item.cloze.vi ? html`<p class="muted small">${item.cloze.vi}</p>` : ''}`;
      else if (item.type === 'read-passage') prompt = html`<p class="small muted">Trích ${item.cloze.part} – đề gốc</p><p class="passage" style="font-size:17px">${item.cloze.text}</p>`;
      else if (item.type === 'read-meaning-mcq') prompt = html`<p style="font-size:18px"><b>${meaningVi(w)}</b></p><p class="muted">${meaningEn(w)}</p>`;
      else if (item.type === 'read-syn') prompt = html`<p style="font-size:18px">Từ nào gần nghĩa nhất với <b>${w.word}</b> (${meaningVi(w)})?</p>`;
      box.innerHTML = header(item) + `<div class="card">${prompt}
        <div class="choices">${item.options.map((o, k) => html`<button class="btn choice" data-k="${k}"><b>${'ABCD'[k]}.</b>&nbsp;${o.label}</button>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn" id="fifty">Gợi ý 50:50</button><span class="spacer"></span><span class="small muted on-desk">Phím 1–4 để chọn</span></div>
        </div><div id="fb"></div>`;
      if (isListen) { const say = () => Speech.say(w.word); box.querySelector('#play').onclick = say; setTimeout(say, 250); }
      let used5050 = false;
      box.querySelector('#fifty').onclick = (e) => {
        used5050 = true; e.target.disabled = true;
        const wrong = item.options.map((o, k) => (o.right ? -1 : k)).filter((k) => k >= 0);
        shuffle(wrong).slice(0, 2).forEach((k) => { box.querySelector(`[data-k="${k}"]`).disabled = true; });
      };
      const choose = (k) => {
        const o = item.options[k];
        if (!o || box.querySelector('#nx')) return;
        box.querySelectorAll('.choice').forEach((b, idx) => { b.disabled = true; if (item.options[idx].right) b.classList.add('right'); });
        if (!o.right) box.querySelector(`[data-k="${k}"]`).classList.add('wrong');
        box.querySelector('#fifty').disabled = true;
        box.querySelector('#fb').innerHTML = feedbackCard(item, o.right, used5050 ? '<div class="small muted">Đã dùng gợi ý 50:50</div>' : '');
        bindNext(box);
        done(item, o.right, { choice: o.label, used5050 });
      };
      box.querySelectorAll('.choice').forEach((b) => { b.onclick = () => choose(Number(b.dataset.k)); });
      const onKey = (e) => {
        if (/^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
        else if (e.key === 'Enter' && box.querySelector('#nx')) { e.preventDefault(); next(); }
        else if (e.key === 'Control' && isListen) Speech.say(w.word);
      };
      document.addEventListener('keydown', onKey);
      cleanups.push(() => document.removeEventListener('keydown', onKey));
    }

    // ---- Writing / Speaking ----
    function renderProduce(item) {
      const w = item.w;
      const speak = item.type === 'speak';
      const model = (w.examples.find((e) => G.tokens(e.en).length >= 8) || w.examples[0] || {}).en || '';
      const canMic = Speech.canListen();
      box.innerHTML = header(item) + `<div class="card">
        <div class="row"><b style="font-size:22px">${esc(w.word)}</b><span class="ipa muted">${esc(w.ipa)}</span><span class="tag">${esc(w.pos)}</span>
          <button class="icon-btn" data-say="${esc(w.word)}" aria-label="Phát âm">${ICON.speaker}</button></div>
        <p style="margin:6px 0">${esc(meaningVi(w))} <span class="muted">— ${esc(meaningEn(w))}</span></p>
        ${speak ? html`<p class="notice">Hãy dùng <b>${w.word}</b> để trả lời: <i>${item.question}</i></p>` : html`<p class="notice">Đặt một câu của riêng bạn có dùng <b>${w.word}</b>, đúng nghĩa và ngữ cảnh (gợi ý: chủ đề IELTS như giáo dục, môi trường, công việc, công nghệ).</p>`}
        ${w.collocations.length ? html`<p class="small muted">Collocation: ${w.collocations.slice(0, 3).map((c) => c.phrase).join(' · ')}</p>` : ''}
        <div id="modelBox" class="hidden"><div class="ex"><div class="en">${model}</div></div><p class="small muted">Đọc câu mẫu, sau đó bấm "Ẩn câu mẫu" và tự đặt câu theo ý bạn.</p></div>
        ${speak ? `<div class="row" style="margin:10px 0">${canMic ? `<button class="btn mic" id="mic">${ICON.mic} Bắt đầu nói</button>` : '<span class="small muted">Trình duyệt này không hỗ trợ nhận giọng nói (dùng Chrome, Edge hoặc Safari). Bạn có thể gõ câu trả lời.</span>'}</div>` : ''}
        <textarea class="input" id="ans" rows="3" placeholder="${speak ? 'Lời bạn nói sẽ hiện ở đây (có thể sửa nếu máy nghe sai)…' : 'Viết câu của bạn…'}"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn" id="model">Xem câu mẫu</button><span class="spacer"></span><button class="btn primary" id="check">Chấm</button></div>
      </div><div id="fb"></div>`;
      box.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => Speech.say(b.dataset.say); });
      const ta = box.querySelector('#ans');
      let speech = null;
      let rec = null;
      const modelBtn = box.querySelector('#model');
      modelBtn.onclick = () => {
        const mb = box.querySelector('#modelBox');
        const show = mb.classList.contains('hidden');
        mb.classList.toggle('hidden', !show);
        modelBtn.textContent = show ? 'Ẩn câu mẫu' : 'Xem câu mẫu';
      };
      const mic = box.querySelector('#mic');
      if (mic) mic.onclick = () => {
        if (rec) { rec.stop(); return; }
        mic.classList.add('on'); mic.innerHTML = ICON.mic + ' Dừng';
        rec = Speech.listen((text) => { ta.value = text; }, (res, error) => {
          mic.classList.remove('on'); mic.innerHTML = ICON.mic + ' Nói lại'; rec = null;
          if (error) toast(error === 'not-allowed' ? 'Chưa được phép dùng micro' : 'Không nhận được giọng nói, thử lại');
          else if (res) { speech = res; if (res.text) ta.value = res.text; }
        });
        if (!rec) { mic.classList.remove('on'); toast('Không bật được micro'); }
      };
      cleanups.push(() => { if (rec) rec.stop(); });
      box.querySelector('#check').onclick = async () => {
        const sentence = ta.value.trim();
        if (!sentence) return ta.focus();
        const btn = box.querySelector('#check');
        btn.disabled = true; btn.textContent = 'Đang chấm…';
        const cfg = LS.get('vol.config', {});
        let lt = [];
        if (cfg.api_languagetool !== 'off') {
          const r = await G.languageTool(sentence, (status) => Api.call('reportCost', { source: 'languagetool', status }).catch(() => {}));
          lt = r || [];
        }
        const family = (opts.allWords || []).filter((x) => x.family_id === w.family_id).map((x) => x.word);
        const res = G.grade({ sentence, word: w.word, family, collocations: w.collocations, examples: w.examples, ltMatches: lt, mode: speak ? 'S' : 'W', speech, passBand: cfg.pass_band || 6.5 });
        const bandTxt = Object.entries(res.band).map(([k, v]) => `${k} ${v}`).join(' · ');
        const errs = res.errors.map((e) => html`<li>${e.span ? html`<b>${e.span}</b>${e.fix ? ' → ' + e.fix : ''}: ` : ''}${e.explain_vi}</li>`).join('');
        const prompt = G.aiPrompt({ sentence, word: w.word, meaningVi: meaningVi(w), mode: speak ? 'S' : 'W', question: item.question }, res);
        btn.textContent = 'Chấm lại'; btn.disabled = false;
        box.querySelector('#fb').innerHTML = `<div class="feedback ${res.passed ? 'ok' : 'bad'}">
          <b>${res.passed ? 'Đạt' : 'Chưa đạt'}</b> <span class="small">(ngưỡng ${esc(cfg.pass_band || '6.5')} · ${esc(bandTxt)} · ước lượng ở cấp câu, chỉ tham khảo)</span>
          ${errs ? `<ul>${errs}</ul>` : '<p>Không phát hiện lỗi.</p>'}
          ${res.corrected ? html`<p><b>Câu đã sửa lỗi:</b> ${res.corrected}</p>` : ''}
          <p style="margin-bottom:4px"><b>Nâng lên band 8.0:</b></p>${res.upgrade_8.tips.length ? `<ul>${res.upgrade_8.tips.map((t) => html`<li>${t}</li>`).join('')}</ul>` : '<p>Câu đã có collocation, cấu trúc phức và không phát hiện lỗi — tiệm cận band 8.0. Hãy thử thêm một ý phát triển (lý do, hệ quả) để câu tự nhiên hơn.</p>'}
          ${res.upgrade_8.model ? html`<p class="small"><b>Câu mẫu trình độ cao:</b> <i>${res.upgrade_8.model}</i></p>` : ''}
          <p class="small muted">Muốn AI viết lại chính câu của bạn ở band 8.0? Bấm "Chép prompt chấm chi tiết" rồi dán vào Claude hoặc ChatGPT (miễn phí).</p>
          <div class="row"><button class="btn sm" id="cp">Chép prompt chấm chi tiết</button></div></div>
          <div class="row" style="margin-top:12px"><span class="small muted">Có thể sửa câu và bấm "Chấm lại".</span><span class="spacer"></span><button class="btn primary" id="nx">Tiếp tục</button></div>`;
        box.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(prompt); toast('Đã chép prompt'); } catch (e) { window.prompt('Chép prompt:', prompt); } };
        item.lastResult = { passed: res.passed, sentence, band: res.band };
        box.querySelector('#nx').onclick = () => { done(item, item.lastResult.passed, item.lastResult); next(); };
      };
    }

    next();
    return () => cleanups.splice(0).forEach((f) => f());
  }

  function summary(box, results, title, backHref) {
    const ok = results.filter((r) => r.passed).length;
    const wrong = results.filter((r) => !r.passed);
    box.innerHTML = html`<div class="card"><h2 style="margin-top:0">${title}</h2>
      <p><b style="font-size:28px">${ok}/${results.length}</b> bài đạt</p>
      ${wrong.length ? html`<p class="muted">Cần ôn lại:</p><div class="chips">${{ __html: wrong.map((r) => `<span class="chip">${esc(r.item.w.word)}</span>`).join('') }}</div>` : ''}
      <div class="row" style="margin-top:12px"><a class="btn primary" href="#/">Về trang chủ</a><a class="btn" href="${backHref}">Quay lại</a></div></div>`;
  }

  // ---------- Luyện tập tự do ----------
  async function viewPractice(m, q) {
    const id = m[1];
    if (!A.can.learn()) return A.fail('decks', 'Tài khoản Viewer không làm bài tập được.');
    A.loading('decks');
    let pack;
    try { pack = await Data.words(id); } catch (e) { return A.fail('decks', e); }
    const skill = q.get('skill') || 'MIX';
    const words = A.applyFilter(pack.words, q.get('filter'), q.get('order') || 'random').slice(0, 20);
    const d = Data.deck(id) || pack.deck;
    A.shell('decks', html`<div class="ex-card"><p class="small"><a href="#/deck/${id}">← ${d.title}</a></p><div id="exbox"></div></div>`);
    const box = document.getElementById('exbox');
    if (!words.length) { box.innerHTML = '<div class="notice">Không có từ nào khớp bộ lọc.</div>'; return; }
    const skills = ['L', 'R', 'W', 'S'];
    const paras = await loadParas(words);
    const items = words.map((w, k) => buildItem(w, skill === 'MIX' ? skills[k % 4] : skill, pack.words, paras[subOf(w)]));
    A.setCleanup(runExercises(box, items, {
      allWords: pack.words,
      onResult: (item, passed, detail) => {
        if (!Progress.get(item.w.word_id)) Progress.put(S.newProgress(item.w.word_id, new Date(), Progress.reminder()));
        Progress.log({ word_id: item.w.word_id, skill: item.skill, type: item.type, passed, mode: 'practice', detail });
      },
      onFinish: (results) => summary(box, results, 'Hoàn thành luyện tập', '#/deck/' + id),
    }));
  }

  // ---------- Phiên ôn ngắt quãng ----------
  async function viewReview() {
    if (!A.can.learn()) return A.fail('review', 'Tài khoản Viewer không có lịch ôn.');
    const now = new Date();
    const due = S.dueList(Object.values(Progress.items), now).slice(0, MAX_SESSION);
    if (!due.length) {
      const next = Object.values(Progress.items).filter((p) => p.next_due_at).sort((a, b) => new Date(a.next_due_at) - new Date(b.next_due_at))[0];
      return A.shell('review', `<div class="narrow"><h1>Ôn tập</h1><div class="notice">Không có từ nào đến hạn.${next ? ' Lần ôn kế tiếp: ' + esc(new Date(next.available_at).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '.' : ' Hãy học từ mới bằng Flashcard trong một bộ từ.'}</div><a class="btn primary" href="#/decks">Chọn bộ từ</a></div>`);
    }
    A.loading('review');
    const bySub = {};
    due.forEach((p) => { const sub = String(p.word_id).replace(/-[^-]+$/, ''); (bySub[sub] = bySub[sub] || []).push(p); });
    const words = [];
    const pool = [];
    try {
      for (const sub of Object.keys(bySub)) {
        let pack;
        try { pack = await Data.words(sub); } catch (e) {
          if (e.code === 'notfound' || e.code === 'forbidden') { Progress.forget([sub]); continue; } // bộ đã bị xoá / hết quyền xem
          throw e;
        }
        pool.push(...pack.words);
        bySub[sub].forEach((p) => { const w = pack.words.find((x) => x.word_id === p.word_id); if (w) words.push(w); });
      }
    } catch (e) { return A.fail('review', e); }
    A.shell('review', `<div class="ex-card"><div class="page-head"><h1>Ôn tập · ${words.length} từ</h1><a class="small" href="#/">Thoát</a></div>
      <ol class="steps small"><li class="on">Flashcard</li><li id="step2">Bài kỹ năng</li></ol>
      <div id="stage"></div></div>`);
    const box = document.getElementById('stage');
    const flashOk = {};
    A.setCleanup(A.mountFlashcards(box, words, {
      allWords: pool, rate: true,
      onRate: (w, ok) => { flashOk[w.word_id] = ok; },
      onDone: async () => {
        const unrated = words.filter((w) => flashOk[w.word_id] === undefined);
        if (unrated.length) { toast(`Còn ${unrated.length} thẻ chưa đánh giá Nhớ/Chưa nhớ`); }
        box.innerHTML = '<div class="notice">Xong bước 1. Bắt đầu bài tổng hợp…</div>';
        const st2 = document.getElementById('step2'); if (st2) st2.classList.add('on');
        const paras = await loadParas(words);
        const items = words.map((w) => buildItem(w, S.skillFor(Progress.get(w.word_id)), pool, paras[subOf(w)]));
        A.setCleanup(runExercises(box, items, {
          allWords: pool,
          onResult: (item, passed, detail) => {
            const p = Progress.get(item.w.word_id);
            const q = S.review(p, passed, new Date(), Progress.reminder(), { maintenance: Progress.maintenance() });
            Progress.put(q);
            Progress.log({ word_id: item.w.word_id, skill: item.skill, type: item.type, passed, mode: 'review', flash: flashOk[item.w.word_id], level: q.level, detail });
          },
          onFinish: (results) => summary(box, results, 'Hoàn thành phiên ôn', '#/review'),
        }));
      },
    }));
  }

  A.addRoute(/^#\/practice\/([\w-]+)$/, viewPractice);
  A.addRoute(/^#\/review$/, viewReview);
  window.VolExercises = { buildItem, cloze, runExercises };
})();
