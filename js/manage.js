// Tạo bộ từ, thêm từ (tự tra / nhập Excel-CSV / dán từ Excel / prompt AI tạo nhanh), chia sẻ.
(function () {
  const { Api, Data, LS, html, esc, toast } = Vol;
  const A = VolApp;
  const COLS = [
    ['headword', 'TỪ VỰNG'], ['meaning', 'NGHĨA'], ['ipa', 'IPA'], ['pos', 'TỪ LOẠI'], ['example', 'VÍ DỤ'],
    ['collocation', 'COLLOCATION'], ['synonyms', '3 TỪ ĐỒNG NGHĨA'], ['antonyms', '3 TỪ TRÁI NGHĨA'],
  ];
  const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  function cfg() { return LS.get('vol.config', {}); }
  async function guarded(source, url) {
    const key = { dictionary: 'api_dictionary', datamuse: 'api_datamuse' }[source];
    if (cfg()[key] === 'off') return null;
    try {
      const r = await fetch(url);
      if (r.status === 402) { Api.call('reportCost', { source, status: 402 }).catch(() => {}); return null; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  // ---------- Tra tự động một từ (nguồn miễn phí) ----------
  async function lookup(word) {
    const w = word.trim();
    const [dict, syn, ant, jja, jjb] = await Promise.all([
      guarded('dictionary', 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)),
      guarded('datamuse', 'https://api.datamuse.com/words?max=6&rel_syn=' + encodeURIComponent(w)),
      guarded('datamuse', 'https://api.datamuse.com/words?max=6&rel_ant=' + encodeURIComponent(w)),
      guarded('datamuse', 'https://api.datamuse.com/words?max=4&rel_jja=' + encodeURIComponent(w)),
      guarded('datamuse', 'https://api.datamuse.com/words?max=4&rel_jjb=' + encodeURIComponent(w)),
    ]);
    // rel_jja: danh từ hay đi sau tính từ w → "w + danh từ"; rel_jjb: tính từ hay đứng trước danh từ w → "tính từ + w"
    const coll = (jja || []).map((x) => `${w} ${x.word}`).concat((jjb || []).map((x) => `${x.word} ${w}`));
    const row = { headword: w, meaning: '', ipa: '', pos: '', example: '', collocation: '', synonyms: '', antonyms: '' };
    const senses = [], examples = [], pos = new Set(), syns = new Set(), ants = new Set();
    (Array.isArray(dict) ? dict : []).forEach((e) => {
      if (!row.ipa) row.ipa = e.phonetic || ((e.phonetics || []).find((p) => p.text) || {}).text || '';
      (e.meanings || []).forEach((m) => {
        const short = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', conjunction: 'conj.', pronoun: 'pron.' }[m.partOfSpeech] || m.partOfSpeech;
        pos.add(short);
        (m.definitions || []).slice(0, 2).forEach((d) => {
          if (senses.length < 4) senses.push({ pos: short, en: d.definition });
          if (d.example && examples.length < 3) examples.push(d.example);
          (d.synonyms || []).forEach((s) => syns.add(s));
          (d.antonyms || []).forEach((s) => ants.add(s));
        });
        (m.synonyms || []).forEach((s) => syns.add(s));
        (m.antonyms || []).forEach((s) => ants.add(s));
      });
    });
    (syn || []).forEach((x) => syns.add(x.word));
    (ant || []).forEach((x) => ants.add(x.word));
    row.pos = [...pos].join('/');
    // Dịch nghĩa và ví dụ sang tiếng Việt qua máy chủ (LanguageApp, miễn phí)
    let vi = [];
    try { vi = await Api.call('translate', { texts: senses.map((s) => s.en).concat(examples) }); } catch (e) { vi = []; }
    row.meaning = senses.map((s, i) => `${senses.length > 1 ? i + 1 + ') ' : ''}${s.pos} ${s.en}: ${vi[i] || ''}`.trim()).join('\n');
    row.example = examples.map((x, i) => `${examples.length > 1 ? i + 1 + ') ' : ''}${x}${vi[senses.length + i] ? ` (${vi[senses.length + i]})` : ''}`).join('\n');
    row.collocation = coll.slice(0, 5).map((x) => `${x}: `).join('\n');
    row.synonyms = [...syns].filter((s) => s.toLowerCase() !== w.toLowerCase()).slice(0, 3).join(', ');
    row.antonyms = [...ants].slice(0, 3).join(', ') || '(không có từ trái nghĩa trực tiếp)';
    row._found = !!senses.length;
    return row;
  }

  // ---------- TSV có ô nhiều dòng (khi dán từ Excel/Google Sheets) ----------
  function parseTSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim()));
  }

  // Chuyển các dòng (mảng ô) thành bản ghi theo tiêu đề cột chuẩn Excel VOL; nhận diện dòng phân đoạn.
  function rowsToWords(rows) {
    const norm = (s) => String(s || '').trim().toUpperCase();
    let hi = rows.findIndex((r) => r.some((c) => norm(c) === 'TỪ VỰNG'));
    let map;
    if (hi >= 0) {
      const head = rows[hi].map(norm);
      map = Object.fromEntries(COLS.map(([k, h]) => [k, head.indexOf(h)]));
    } else {
      // Không có tiêu đề: coi như thứ tự cột chuẩn bắt đầu từ STT nếu cột đầu là số, ngược lại từ TỪ VỰNG.
      const off = rows[0] && /^\d+$/.test(String(rows[0][0]).trim()) ? 1 : 0;
      map = Object.fromEntries(COLS.map(([k], i) => [k, i + off]));
      hi = -1;
    }
    const out = [];
    let section = '';
    rows.slice(hi + 1).forEach((r) => {
      const get = (k) => (map[k] >= 0 ? String(r[map[k]] === undefined || r[map[k]] === null ? '' : r[map[k]]).trim() : '');
      const hw = get('headword');
      const rest = COLS.slice(1).map(([k]) => get(k)).join('');
      if (!hw && !rest) {
        const first = String(r.find((c) => String(c).trim()) || '').trim();
        if (first && !/^\d+$/.test(first)) section = first;
        return;
      }
      if (!hw) return;
      const o = { section };
      COLS.forEach(([k]) => { o[k] = get(k); });
      out.push(o);
    });
    return out;
  }

  async function loadSheetJS() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHEETJS; s.onload = resolve; s.onerror = () => reject(new Error('Không tải được thư viện đọc Excel (kiểm tra mạng).'));
      document.head.appendChild(s);
    });
    return window.XLSX;
  }

  // Xuất bộ ra .xlsx đúng cột VOL (STT, TỪ VỰNG, NGHĨA, IPA, TỪ LOẠI, VÍ DỤ, COLLOCATION, 3 ĐỒNG NGHĨA, 3 TRÁI NGHĨA).
  // Bộ có bộ con → mỗi bộ con một sheet. File này nhập lại được bằng tab "Nhập Excel / CSV".
  async function exportDeck(d, kids) {
    const X = await loadSheetJS();
    const parts = kids && kids.length ? kids : [d];
    const wb = X.utils.book_new();
    const used = {};
    for (const part of parts) {
      const pack = await Data.words(part.deck_id);
      const rows = [['STT'].concat(COLS.map((c) => c[1]))];
      let n = 0, section = '';
      pack.words.forEach((w) => {
        if (w.section && w.section !== section) { section = w.section; rows.push([section]); }
        rows.push([++n].concat(COLS.map(([k]) => (k in w && (k + '_raw') in w ? w[k + '_raw'] : w[k]) || '')));
      });
      let name = (part === d ? 'Từ vựng' : part.title.replace(d.title + ' – ', '')).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet';
      if (used[name]) name = name.slice(0, 25) + ' ' + (++used[name]); else used[name] = 1;
      const ws = X.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 45 }, { wch: 16 }, { wch: 10 }, { wch: 55 }, { wch: 45 }, { wch: 28 }, { wch: 28 }];
      X.utils.book_append_sheet(wb, ws, name);
    }
    const file = d.title.replace(/[\\/:*?"<>|]/g, ' ').trim() + '.xlsx';
    X.writeFile(wb, file);
    return file;
  }

  function templateCSV() {
    const head = ['STT'].concat(COLS.map((c) => c[1]));
    const ex = ['1', 'resilient', '1) adj. able to recover quickly from difficulties: kiên cường, mau phục hồi', '/rɪˈzɪliənt/', 'adj.',
      '1) Coastal communities have proved remarkably resilient. (Các cộng đồng ven biển đã chứng tỏ sức chống chịu đáng kể.)',
      'remarkably / highly resilient: kiên cường đáng kể / rất mau phục hồi\nresilient economy: nền kinh tế có sức chống chịu', 'tough, hardy, adaptable', 'fragile, vulnerable, weak'];
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    return '﻿' + [head, ex].map((r) => r.map(q).join(',')).join('\r\n');
  }

  function aiPrompt(list) {
    return `Bạn là chuyên gia từ vựng IELTS (C1–C2). Với danh sách từ dưới đây, hãy lập bảng từ vựng ĐÚNG chuẩn sau và trả về dạng bảng TSV (các cột cách nhau bằng phím Tab, ô nhiều dòng đặt trong dấu ngoặc kép) để tôi dán vào Excel.

Cột (đúng thứ tự, có dòng tiêu đề): STT | TỪ VỰNG | NGHĨA | IPA | TỪ LOẠI | VÍ DỤ | COLLOCATION | 3 TỪ ĐỒNG NGHĨA | 3 TỪ TRÁI NGHĨA

Quy tắc:
- Với MỖI từ, thêm đủ word family (mỗi dạng từ một dòng riêng, đặt liền nhau: danh từ, động từ, tính từ, trạng từ, từ phủ định un-/in-/dis- nếu có).
- NGHĨA: đánh số các nghĩa phổ biến, mỗi nghĩa một dòng theo mẫu "1) n. English definition: nghĩa tiếng Việt".
- IPA chuẩn Anh-Anh, ví dụ /rɪˈzɪliənt/. TỪ LOẠI: n. (C)/(U), v., adj., adv.…
- VÍ DỤ: mỗi nghĩa một câu trình độ C1–C2 theo chủ đề IELTS, đánh số, kèm bản dịch trong ngoặc: "1) English sentence. (Bản dịch.)".
- COLLOCATION: 3–6 cụm hay gặp, có thể nhóm theo cấu trúc (ví dụ "Động từ + từ"), mỗi cụm một dòng "cụm: nghĩa tiếng Việt".
- Đúng 3 từ đồng nghĩa và 3 từ trái nghĩa, cách nhau bằng dấu phẩy; nếu không có trái nghĩa ghi "(không có từ trái nghĩa trực tiếp)".
- Không thêm lời giải thích ngoài bảng.

Danh sách từ:
${list}`;
  }

  // ---------- Bảng xem trước có thể sửa ----------
  function previewTable(rows) {
    if (!rows.length) return '<p class="muted">Chưa có từ nào.</p>';
    return `<div class="table-wrap"><table class="sheet"><thead><tr><th></th>${COLS.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-i="${i}"><td><button class="btn sm ghost danger" data-del="${i}" aria-label="Xoá dòng">✕</button></td>${COLS.map(([k]) => `<td class="pre" contenteditable="true" data-k="${k}" style="${!r[k] && k !== 'collocation' ? 'background:var(--warn-soft)' : ''}">${esc(r[k])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }

  async function viewAdd(m) {
    const id = m[1];
    const d = Data.deck(id);
    if (!d || !d.can_edit) return A.fail('decks', 'Bạn không thêm từ được vào bộ này.');
    let rows = [];
    A.shell('decks', html`
      <p class="small"><a href="#/deck/${id}">← ${d.title}</a></p>
      <h1>Thêm từ vào "${d.title}"</h1>
      <p class="small muted" id="usage"></p>
      <div class="card">
        <div class="row" role="tablist">
          <button class="btn sm" data-tab="type">Gõ từ – tự tra</button>
          <button class="btn sm" data-tab="file">Nhập Excel / CSV</button>
          <button class="btn sm" data-tab="paste">Dán từ Excel</button>
          <button class="btn sm" data-tab="ai">AI tạo nhanh</button>
        </div>
        <div id="tab" style="margin-top:12px"></div>
      </div>
      <h2>Xem trước và chỉnh sửa <span class="small muted">(ô vàng là ô còn trống — có thể sửa trực tiếp)</span></h2>
      <div id="pv"></div>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="save" disabled>Lưu 0 từ</button></div>`);
    if (!A.can.edit()) Api.call('myUsage').then((u) => {
      const el = document.getElementById('usage');
      if (el && u.limit) el.textContent = `Bạn đã dùng ${u.used.toLocaleString('vi-VN')} / ${u.limit.toLocaleString('vi-VN')} từ cho các bộ tự tạo (còn ${Math.max(0, u.limit - u.used).toLocaleString('vi-VN')}).`;
    }).catch(() => {});
    const pv = document.getElementById('pv');
    const saveBtn = document.getElementById('save');
    function redraw() {
      pv.innerHTML = previewTable(rows);
      saveBtn.disabled = !rows.length;
      saveBtn.textContent = `Lưu ${rows.length} từ`;
    }
    pv.oninput = (e) => { const td = e.target.closest('[data-k]'); if (td) rows[Number(td.parentElement.dataset.i)][td.dataset.k] = td.innerText.trim(); };
    pv.onclick = (e) => { const b = e.target.closest('[data-del]'); if (b) { rows.splice(Number(b.dataset.del), 1); redraw(); } };
    const tab = document.getElementById('tab');
    const tabs = {
      type: () => {
        tab.innerHTML = `<form id="lk" class="row"><input class="input" style="flex:1;min-width:200px" name="w" placeholder="Nhập từ hoặc nhiều từ, cách nhau bằng dấu phẩy" required><button class="btn primary">Tra và thêm</button></form>
          <p class="small muted">Nguồn miễn phí: Free Dictionary API (IPA, định nghĩa, ví dụ), Datamuse (đồng/trái nghĩa, từ hay đi kèm), Google Apps Script dịch nghĩa sang tiếng Việt. Word family và collocation có nghĩa cần bổ sung tay hoặc dùng tab "AI tạo nhanh" để đạt đủ chuẩn như bộ VOL.</p>`;
        tab.querySelector('#lk').onsubmit = async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('button');
          const list = e.target.w.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
          btn.disabled = true;
          for (const w of list) {
            btn.textContent = `Đang tra "${w}"…`;
            const r = await lookup(w);
            if (!r._found) toast(`Không tìm thấy "${w}" trong từ điển miễn phí — hãy điền tay`);
            delete r._found;
            rows.push(r); redraw();
          }
          btn.disabled = false; btn.textContent = 'Tra và thêm'; e.target.reset();
        };
      },
      file: () => {
        tab.innerHTML = `<input type="file" id="f" accept=".xlsx,.xls,.csv" class="input">
          <p class="small muted">Đúng mẫu cột: STT | TỪ VỰNG | NGHĨA | IPA | TỪ LOẠI | VÍ DỤ | COLLOCATION | 3 TỪ ĐỒNG NGHĨA | 3 TỪ TRÁI NGHĨA. File nhiều sheet sẽ tạo mỗi sheet một bộ con. Dòng chỉ có chữ ở cột đầu (ví dụ "PASSAGE 1 – …") được hiểu là tên phần.
          <a href="#" id="tpl">Tải file mẫu (.csv)</a></p><div id="sheets"></div>`;
        tab.querySelector('#tpl').onclick = (e) => {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([templateCSV()], { type: 'text/csv;charset=utf-8' }));
          a.download = 'mau_tu_vung_VOL.csv'; a.click();
        };
        tab.querySelector('#f').onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const X = await loadSheetJS();
            const wb = X.read(await file.arrayBuffer(), { type: 'array' });
            const sheets = wb.SheetNames.map((n) => ({ name: n, words: rowsToWords(X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })) })).filter((s) => s.words.length);
            if (!sheets.length) return toast('Không đọc được từ nào — kiểm tra dòng tiêu đề "TỪ VỰNG"');
            if (sheets.length === 1) { rows = rows.concat(sheets[0].words); redraw(); return; }
            tab.querySelector('#sheets').innerHTML = html`<div class="notice">File có ${sheets.length} sheet (${sheets.map((s) => s.name + ': ' + s.words.length + ' từ').join(' · ')}).</div>
              <button class="btn primary" id="multi">Tạo ${sheets.length} bộ con và lưu tất cả</button>`;
            tab.querySelector('#multi').onclick = async (ev) => {
              ev.target.disabled = true;
              try {
                for (const s of sheets) {
                  ev.target.textContent = `Đang lưu sheet ${s.name}…`;
                  const sub = await Api.call('createDeck', { title: `${d.title} – ${s.name}`, parent_id: id, visibility: d.visibility });
                  for (let k = 0; k < s.words.length; k += 500) await Api.call('addWords', { deck_id: sub.deck_id, words: s.words.slice(k, k + 500) });
                }
                await Data.loadDecks(); toast('Đã lưu'); location.hash = '#/deck/' + id;
              } catch (err) { toast(err.message); ev.target.disabled = false; }
            };
          } catch (err) { toast(err.message); }
        };
      },
      paste: () => {
        tab.innerHTML = `<textarea id="ps" class="input" rows="6" placeholder="Bôi đen các dòng trong Excel/Google Sheets (có thể kèm dòng tiêu đề), Ctrl+C rồi dán vào đây"></textarea>
          <div class="row" style="margin-top:8px"><button class="btn primary" id="go">Đọc bảng</button></div>`;
        tab.querySelector('#go').onclick = () => {
          const got = rowsToWords(parseTSV(tab.querySelector('#ps').value));
          if (!got.length) return toast('Không đọc được dòng nào');
          rows = rows.concat(got); redraw(); toast(`Đã đọc ${got.length} từ`);
        };
      },
      ai: () => {
        tab.innerHTML = `<textarea id="wl" class="input" rows="4" placeholder="Dán danh sách từ, mỗi từ một dòng hoặc cách nhau bằng dấu phẩy"></textarea>
          <div class="row" style="margin-top:8px"><button class="btn primary" id="mk">Tạo prompt và chép</button></div>
          <p class="small muted">Dán prompt vào Claude hoặc ChatGPT (gói miễn phí). Kết quả là bảng đủ 9 cột như bộ VOL, có word family. Chép bảng kết quả rồi dán vào tab "Dán từ Excel".</p><pre id="pp" class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px;max-height:240px;overflow:auto" hidden></pre>`;
        tab.querySelector('#mk').onclick = async () => {
          const list = tab.querySelector('#wl').value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).join('\n');
          if (!list) return toast('Chưa có từ nào');
          const p = aiPrompt(list);
          const pre = tab.querySelector('#pp'); pre.hidden = false; pre.textContent = p;
          try { await navigator.clipboard.writeText(p); toast('Đã chép prompt'); } catch (e) { toast('Hãy bôi đen và chép prompt bên dưới'); }
        };
      },
    };
    document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('primary', x === b)); tabs[b.dataset.tab](); }; });
    document.querySelector('[data-tab="type"]').click();
    redraw();
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        let n = 0;
        for (let k = 0; k < rows.length; k += 500) n += (await Api.call('addWords', { deck_id: id, words: rows.slice(k, k + 500) })).added;
        await Data.loadDecks();
        toast(`Đã lưu ${n} từ`);
        location.hash = '#/deck/' + id;
      } catch (e) { toast(e.message); saveBtn.disabled = false; }
    };
  }

  function viewNewDeck() {
    if (!A.can.learn()) return A.fail('decks', 'Tài khoản Viewer không tạo được bộ từ.');
    const canPublic = A.can.edit();
    A.shell('decks', `<div class="narrow"><h1>Tạo bộ từ</h1>
      <form id="nd" class="card">
        <label class="field"><span>Tiêu đề</span><input class="input" name="title" required maxlength="120"></label>
        <label class="field"><span>Mô tả (tuỳ chọn)</span><input class="input" name="description" maxlength="500"></label>
        <label class="field"><span>Chế độ</span><select class="input" name="visibility"><option value="private">Riêng tư (chỉ mình bạn)</option>${canPublic ? '<option value="public">Công khai (mọi tài khoản đã được cấp quyền)</option>' : ''}</select></label>
        ${canPublic ? '' : '<p class="small muted">Muốn chia sẻ bộ cho người khác: tạo bộ xong vào "Chia sẻ" — yêu cầu sẽ được gửi tới quản trị viên duyệt qua email.</p>'}
        <button class="btn primary">Tạo bộ</button></form></div>`);
    document.getElementById('nd').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const d = await Api.call('createDeck', { title: f.get('title'), description: f.get('description'), visibility: f.get('visibility') });
        await Data.loadDecks();
        location.hash = '#/add/' + d.deck_id;
      } catch (err) { toast(err.message); }
    };
  }

  function viewShare(m) {
    const id = m[1];
    const d = Data.deck(id);
    if (!d || !d.can_edit) return A.fail('decks', 'Bạn không chia sẻ được bộ này.');
    const owner = A.can.owner();
    A.shell('decks', html`<div class="narrow"><p class="small"><a href="#/deck/${id}">← ${d.title}</a></p><h1>Chia sẻ "${d.title}"</h1>
      <div class="card">
        <p class="small muted">${owner ? 'Bạn là Owner: chia sẻ có hiệu lực ngay.' : 'Yêu cầu chia sẻ sẽ được gửi tới quản trị viên. Khi được duyệt qua email, người nhận có thể học bộ này.'}</p>
        <form id="sh" class="row"><input class="input" style="flex:1;min-width:200px" name="emails" placeholder="email1@example.com, email2@example.com" required><button class="btn primary">Gửi</button></form>
        <p class="small">Đang chia sẻ với: ${(d.shared_with || []).join(', ') || '—'}</p>
      </div></div>`);
    document.getElementById('sh').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await Api.call('requestShare', { deck_id: id, emails: e.target.emails.value });
        toast(r.requests.map((x) => `${x.target}: ${x.status === 'approved' ? 'đã chia sẻ' : 'chờ duyệt'}`).join(' · '), 4000);
        await Data.loadDecks();
        e.target.reset();
      } catch (err) { toast(err.message); }
    };
  }

  A.addRoute(/^#\/new-deck$/, viewNewDeck);
  A.addRoute(/^#\/add\/([\w-]+)$/, viewAdd);
  A.addRoute(/^#\/share\/([\w-]+)$/, viewShare);
  window.VolManage = { parseTSV, rowsToWords, aiPrompt, templateCSV, exportDeck };
})();
