// Tách các cột thô theo chuẩn Excel VOL thành cấu trúc dùng cho giao diện.
// Cùng luật với tools/excel_to_json.py (tests/parse.test.mjs đối chiếu toàn bộ dữ liệu).
(function (root) {
  const NUM = /^\s*(\d+)\)\s*/;
  const POS_PREFIX = /^((?:n|v|adj|adv|prep|conj|pron|det|phr\.? ?v|phrasal verb|idiom|phrase|interj|exclam|abbr|modal)\.?(?:\s*\([^)]*\))?(?:\/[a-z.]+)*)\s+/i;
  const NONE_MARK = /^\(?\s*không có/i;

  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\r\n?/g, '\n').replace(/ /g, ' ').normalize('NFC')
      .split('\n').map((l) => l.trim()).join('\n').trim();
  }

  function numberedLines(text) {
    const items = [];
    let cur = null;
    for (const line of text.split('\n')) {
      if (!line) continue;
      const m = line.match(NUM);
      if (m) {
        if (cur !== null) items.push(cur);
        cur = line.slice(m[0].length);
      } else if (cur === null) cur = line;
      else cur += ' ' + line;
    }
    if (cur !== null) items.push(cur);
    return items;
  }

  function parseSenses(text) {
    return numberedLines(clean(text)).map((item, i) => {
      let pos = '';
      const m = item.match(POS_PREFIX);
      if (m) { pos = m[1]; item = item.slice(m[0].length); }
      const idx = item.lastIndexOf(': ');
      if (idx === -1) return { n: i + 1, pos, en: item.trim(), vi: '' };
      return { n: i + 1, pos, en: item.slice(0, idx).trim(), vi: item.slice(idx + 2).trim() };
    });
  }

  function parseExamples(text) {
    return numberedLines(clean(text)).map((item) => {
      let s = item.replace(/\s+$/, '');
      let vi = '';
      if (s.endsWith(')')) {
        let depth = 0;
        for (let k = s.length - 1; k >= 0; k--) {
          if (s[k] === ')') depth++;
          else if (s[k] === '(') {
            depth--;
            if (depth === 0) { vi = s.slice(k + 1, -1).trim(); s = s.slice(0, k).replace(/\s+$/, ''); break; }
          }
        }
      }
      const sources = [...s.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const en = s.replace(/\s*\[[^\]]+\]\s*/g, ' ').trim();
      vi = vi.replace(/\s*\[[^\]]+\]\s*/g, ' ').trim();
      return { en, vi, source: sources.join('; ') };
    });
  }

  function parseCollocations(text) {
    const out = [];
    let group = '';
    for (let line of clean(text).split('\n')) {
      line = line.trim().replace(/^[•\-– ]+/, '').trim();
      if (!line) continue;
      let idx = line.indexOf(': ');
      if (idx === -1 && line.endsWith(':')) idx = line.length - 1;
      if (idx === -1) { group = line; continue; }
      out.push({ group, phrase: line.slice(0, idx).trim(), vi: line.slice(idx + 1).trim() });
    }
    return out;
  }

  function parseList(text) {
    text = clean(text);
    if (!text || NONE_MARK.test(text)) return [];
    return text.replace(/\n/g, ', ').split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
  }

  // Ô TỪ VỰNG có thể kèm dòng ghi chú, ví dụ "complementary\n(⚠ đồng âm: complimentary …)".
  function splitHeadword(h) {
    const lines = clean(h).split('\n');
    return { word: lines[0].trim(), headnote: lines.slice(1).join(' ').trim() };
  }

  // Dạng dùng để chấm bài gõ: bỏ phần tuỳ chọn "(that)", "sb/sth"…; trả về các đáp án chấp nhận được.
  const PRON = "(?:sb|sth|sb's|one's|its|someone|something)";
  // "hinge on / upon" → ["hinge on", "hinge upon"]; "local / long-term resident" → ["local resident", "long-term resident"]
  function expandSlashes(p) {
    const parts = p.split(/\s*\/\s*/);
    if (parts.length === 1) return [p];
    const first = parts[0].split(' '), last = parts[parts.length - 1].split(' ');
    const prefix = first.slice(0, -1).join(' '), suffix = last.slice(1).join(' ');
    const opts = [first[first.length - 1]].concat(parts.slice(1, -1), [last[0]]);
    return opts.map((o) => [prefix, o, suffix].filter(Boolean).join(' '));
  }
  function answerForms(word) {
    const w = String(word).toLowerCase();
    const noPron = w.replace(new RegExp('\\b' + PRON + '(\\s*/\\s*' + PRON + ')*', 'g'), ' ').replace(/\s+/g, ' ').trim();
    const forms = new Set([w]);
    [noPron, noPron.replace(/\s*\([^)]*\)\s*/g, ' '), noPron.replace(/[()]/g, '')].forEach((v) => {
      expandSlashes(v.replace(/\s+/g, ' ').trim()).forEach((x) => forms.add(x.replace(/\s+/g, ' ').trim()));
    });
    return [...forms].filter(Boolean);
  }

  // Từ một bản ghi thô (các cột Excel) → bản ghi đầy đủ.
  function parseWord(raw) {
    const hw = splitHeadword(raw.headword || '');
    return {
      ...raw,
      word: hw.word,
      headnote: hw.headnote,
      senses: parseSenses(raw.meaning),
      examples: parseExamples(raw.example),
      collocations: parseCollocations(raw.collocation),
      synonyms: parseList(raw.synonyms),
      antonyms: parseList(raw.antonyms),
      synonyms_raw: raw.synonyms || '', // giữ nguyên ô gốc để sửa / xuất Excel không mất định dạng
      antonyms_raw: raw.antonyms || '',
    };
  }

  const api = { clean, parseSenses, parseExamples, parseCollocations, parseList, parseWord, splitHeadword, answerForms, expandSlashes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VolParse = api;
})(typeof self !== 'undefined' ? self : this);
