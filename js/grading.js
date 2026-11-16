// Chấm câu Writing/Speaking ở cấp câu (ước lượng tham khảo theo IELTS band descriptors – public version).
// Tiêu chí: Lexical Resource (LR), Grammatical Range & Accuracy (GRA); Speaking thêm Fluency (FC) và Pronunciation (P) ở mức chỉ báo.
// Ngưỡng đạt mặc định 6.5 (Owner chốt). Không dùng dịch vụ trả phí: luật cục bộ + LanguageTool public API (tuỳ chọn).
(function (root) {
  const COMPLEX = [
    /\b(although|though|even though|whereas|while|unless|provided that|as long as|so that|in order to|despite|in spite of|not only|whether)\b/i,
    /\b(which|who|whom|whose|where)\b/i,
    /\b(because|since|if|when|once|until|before|after)\b/i,
    /\b(that)\b/i,
    /\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i, // bị động
    /\b(had|has|have)\s+(been\s+)?\w+(ed|en)\b/i, // hoàn thành
    /\b(would|could|might|should)\s+(have\s+)?\w+/i,
    /^\s*\w+ing\b[^,]*,/i, // mệnh đề phân từ đầu câu
  ];
  const STOP = new Set('a an the of to in on at for and or but is are was were be been it this that these those with by as from i you he she we they my your his her our their its me him us them do does did not no so very can will just have has had'.split(' '));

  function tokens(s) { return (String(s).toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:[-'][a-z]+)*/g) || []); }

  // Động từ bất quy tắc thông dụng: nguyên mẫu quá_khứ phân_từ (dạng thay thế cách bằng |).
  const IRREGULAR = {};
  ('arise arose arisen|bear bore borne|beat beat beaten|become became become|begin began begun|bend bent bent|bind bound bound|bite bit bitten|blow blew blown|break broke broken|bring brought brought|build built built|burn burnt burnt|buy bought bought|catch caught caught|choose chose chosen|come came come|cost cost cost|cut cut cut|deal dealt dealt|dig dug dug|do did done|draw drew drawn|drink drank drunk|drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|flee fled fled|fly flew flown|forbid forbade forbidden|forget forgot forgotten|forgive forgave forgiven|freeze froze frozen|get got gotten|give gave given|go went gone|grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held|hurt hurt hurt|keep kept kept|know knew known|lay laid laid|lead led led|lean leant leant|leave left left|lend lent lent|let let let|lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant|meet met met|overcome overcame overcome|pay paid paid|put put put|quit quit quit|read read read|ride rode ridden|ring rang rung|rise rose risen|run ran run|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set|shake shook shaken|shed shed shed|shine shone shone|shoot shot shot|show showed shown|shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept|slide slid slid|speak spoke spoken|spend spent spent|spin spun spun|split split split|spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung|strike struck struck|strive strove striven|swear swore sworn|sweep swept swept|swim swam swum|swing swung swung|take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown|undergo underwent undergone|understand understood understood|undertake undertook undertaken|wake woke woken|wear wore worn|weave wove woven|win won won|withdraw withdrew withdrawn|withstand withstood withstood|write wrote written|be was were been|outweigh outweighed outweighed|overtake overtook overtaken|uphold upheld upheld|foresee foresaw foreseen|mislead misled misled')
    .split('|').forEach((row) => { const [b, ...rest] = row.split(' '); IRREGULAR[b] = rest; });

  // Các dạng chấp nhận của từ mục tiêu (biến tố đơn giản).
  function inflections(word) {
    const w = word.toLowerCase();
    const out = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing', w + 'er', w + 'est', w + 'ly']);
    (IRREGULAR[w] || []).forEach((x) => out.add(x));
    // số nhiều gốc Hy Lạp/La-tinh và gấp đôi phụ âm l kiểu Anh (cancel → cancelled)
    if (w.endsWith('is')) out.add(w.slice(0, -2) + 'es');
    if (w.endsWith('on')) out.add(w.slice(0, -2) + 'a');
    if (w.endsWith('um')) out.add(w.slice(0, -2) + 'a');
    if (w.endsWith('us')) out.add(w.slice(0, -2) + 'i');
    if (/[aeiou]l$/.test(w)) { out.add(w + 'led'); out.add(w + 'ling'); out.add(w + 'ler'); }
    if (w.endsWith('fe')) out.add(w.slice(0, -2) + 'ves');
    else if (w.endsWith('f')) out.add(w.slice(0, -1) + 'ves');
    if (w.endsWith('e')) { out.add(w.slice(0, -1) + 'ing'); out.add(w + 'd'); }
    if (w.endsWith('y')) { out.add(w.slice(0, -1) + 'ies'); out.add(w.slice(0, -1) + 'ied'); out.add(w.slice(0, -1) + 'ier'); out.add(w.slice(0, -1) + 'iest'); out.add(w.slice(0, -1) + 'ily'); }
    if (/[^aeiou][aeiou][bdgmnprt]$/.test(w)) { const c = w[w.length - 1]; out.add(w + c + 'ed'); out.add(w + c + 'ing'); out.add(w + c + 'er'); }
    if (w.endsWith('ise')) { const z = w.slice(0, -3) + 'ize'; inflections.base(z).forEach((x) => out.add(x)); }
    if (w.endsWith('ize')) { const s = w.slice(0, -3) + 'ise'; inflections.base(s).forEach((x) => out.add(x)); }
    return out;
  }
  inflections.base = (w) => [w, w + 's', w + 'd', w.slice(0, -1) + 'ing'];

  // Tìm từ mục tiêu trong câu. Trả về { used, exact, family, found }.
  function findTarget(sentence, target, family) {
    const toks = tokens(sentence);
    const text = ' ' + toks.join(' ') + ' ';
    const VP = root.VolParse || (typeof VolParse !== "undefined" ? VolParse : null) || (typeof require === "function" ? require("./parse.js") : null);
    const forms = VP ? VP.answerForms(target) : [target.toLowerCase()];
    for (const f of forms) {
      const words = tokens(f);
      if (words.length > 1) {
        // cụm từ: các từ nội dung xuất hiện theo thứ tự (cho phép chèn tân ngữ / chia động từ ở từ đầu)
        const head = inflections(words[0]);
        for (let i = 0; i < toks.length; i++) {
          if (!head.has(toks[i])) continue;
          let j = i + 1, k = 1;
          while (k < words.length && j < toks.length && j - i <= words.length + 4) { if (toks[j] === words[k]) k++; j++; }
          if (k === words.length) return { used: true, exact: true, found: toks.slice(i, j).join(' ') };
        }
      } else if (words.length === 1) {
        const inf = inflections(words[0]);
        const hit = toks.find((t) => inf.has(t));
        if (hit) return { used: true, exact: true, found: hit };
      }
    }
    for (const fam of family || []) {
      if (fam.toLowerCase() === target.toLowerCase()) continue;
      const inf = inflections(fam.toLowerCase());
      const hit = toks.find((t) => inf.has(t));
      if (hit) return { used: true, exact: false, family: fam, found: hit };
    }
    return { used: !!text.includes(' ' + target.toLowerCase() + ' '), exact: false };
  }

  function jaccard(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  // Collocation của từ có xuất hiện trong câu không (bỏ "sb/sth", tách lựa chọn "a / b").
  function collocationHit(sentence, collocations, target) {
    const text = ' ' + tokens(sentence).join(' ') + ' ';
    const tgt = tokens(target)[0] || '';
    for (const c of collocations || []) {
      const variants = expandSlashes(c.phrase.replace(/\b(sb|sth|sb's|one's)\b/g, ' ').replace(/[+…().]/g, ' '));
      for (const v of variants) {
        const ws = tokens(v).filter((x) => x !== tgt && !STOP.has(x));
        if (ws.length && ws.every((x) => text.includes(' ' + x) )) return c;
      }
    }
    return null;
  }
  function expandSlashes(p) {
    // "local / long-term resident" → ["local resident", "long-term resident"] (đơn giản hoá: lấy từng lựa chọn quanh dấu /)
    const parts = p.split(/\s*\/\s*/);
    if (parts.length === 1) return [p];
    const first = parts[0].split(' '), last = parts[parts.length - 1].split(' ');
    const prefix = first.slice(0, -1).join(' '), suffix = last.slice(1).join(' ');
    const opts = [first[first.length - 1]].concat(parts.slice(1, -1), [last[0]]);
    return opts.map((o) => [prefix, o, suffix].filter(Boolean).join(' '));
  }

  function complexity(sentence) {
    return COMPLEX.reduce((n, re) => n + (re.test(sentence) ? 1 : 0), 0);
  }

  // ltMatches: kết quả LanguageTool (có thể rỗng nếu tắt/lỗi mạng).
  function grade(input) {
    const { sentence, word, family, collocations, examples, ltMatches, mode, speech } = input;
    const passBand = Number(input.passBand || 6.5);
    const toks = tokens(sentence);
    const errors = [];
    const tips = [];
    const target = findTarget(sentence, word, family);
    const nWords = toks.length;

    if (nWords < 6) errors.push({ type: 'length', explain_vi: 'Câu quá ngắn (dưới 6 từ). Hãy viết một câu hoàn chỉnh có ngữ cảnh rõ ràng.' });
    if (!target.used) errors.push({ type: 'target', explain_vi: `Chưa dùng từ "${word}".` });
    else if (!target.exact) errors.push({ type: 'form', explain_vi: `Bạn dùng "${target.found}" (cùng họ với "${target.family}"), chưa phải "${word}". Hãy dùng đúng từ đang học.` });
    const copied = (examples || []).some((e) => jaccard(e.en, sentence) >= 0.8);
    if (copied) errors.push({ type: 'copy', explain_vi: 'Câu gần như giống hệt câu ví dụ. Hãy tự đặt câu theo ý của bạn.' });

    const lt = (ltMatches || []).filter((m) => !(m.rule && /UPPERCASE_SENTENCE_START|WHITESPACE|EN_QUOTES|DASH_RULE/.test(m.rule.id)));
    let grammarErr = 0, spellErr = 0, styleErr = 0;
    lt.forEach((m) => {
      const cat = (m.rule && m.rule.category && m.rule.category.id) || '';
      const span = sentence.substr(m.offset, m.length);
      const fix = (m.replacements || []).slice(0, 2).map((r) => r.value).join(' / ');
      if (cat === 'TYPOS') spellErr++;
      else if (cat === 'STYLE' || cat === 'REDUNDANCY' || cat === 'CASING' || cat === 'PUNCTUATION') styleErr++;
      else grammarErr++;
      errors.push({ type: cat === 'TYPOS' ? 'spelling' : 'grammar', span, fix, explain_vi: m.message });
    });

    // ---- GRA ----
    const cx = complexity(sentence);
    let GRA;
    if (cx >= 2 && nWords >= 15) GRA = 8;
    else if (cx >= 1 && nWords >= 12) GRA = 7;
    else if (cx >= 1) GRA = 6.5;
    else if (nWords >= 8) GRA = 6;
    else GRA = 5.5;
    if (grammarErr === 1) GRA = Math.min(GRA, 6.5);
    if (grammarErr >= 2) GRA = Math.min(GRA, 6) - 0.5 * (grammarErr - 2);
    if (styleErr && GRA > 7) GRA = 7;
    GRA = Math.max(4, GRA);

    // ---- LR ----
    const coll = target.exact ? collocationHit(sentence, collocations, word) : null;
    const content = toks.filter((t) => !STOP.has(t));
    const longWords = content.filter((t) => t.length >= 8).length;
    const diversity = content.length ? new Set(content).size / content.length : 0;
    let LR = target.exact ? 6 : target.used ? 5 : 4.5;
    if (target.exact && coll) LR += 1;
    if (target.exact && longWords >= 2) LR += 0.5;
    if (target.exact && diversity >= 0.85 && content.length >= 6) LR += 0.5;
    if (spellErr) LR -= 0.5 * spellErr;
    if (copied) LR = Math.min(LR, 5);
    LR = Math.max(4, Math.min(8, LR));

    const band = { LR: round(LR), GRA: round(GRA) };
    // ---- Speaking: chỉ báo P và FC ----
    if (mode === 'S' && speech) {
      const conf = speech.confidence;
      let P = target.exact ? 6.5 : 5.5;
      if (conf !== null && conf !== undefined) { if (conf >= 0.85) P += 0.5; else if (conf < 0.6) P -= 1; }
      const wpm = speech.seconds ? (nWords / speech.seconds) * 60 : 0;
      let FC = nWords >= 15 && wpm >= 100 ? 7 : nWords >= 10 && wpm >= 80 ? 6.5 : nWords >= 8 ? 6 : 5;
      band.P = round(Math.max(4, Math.min(8, P)));
      band.FC = round(FC);
    }

    const blocking = errors.some((e) => ['length', 'target', 'form', 'copy'].includes(e.type)) || grammarErr >= 2;
    const passed = !blocking && band.LR >= passBand && band.GRA >= passBand;

    // ---- Gợi ý nâng lên band 8.0 ----
    let corrected = sentence;
    lt.slice().sort((a, b) => b.offset - a.offset).forEach((m) => {
      if (m.replacements && m.replacements[0]) corrected = corrected.slice(0, m.offset) + m.replacements[0].value + corrected.slice(m.offset + m.length);
    });
    if (!target.exact) tips.push(`Dùng đúng "${word}" thay cho từ khác.`);
    if (!coll && (collocations || []).length) {
      const pick = collocations.slice(0, 3).map((c) => `"${c.phrase}" (${c.vi})`).join('; ');
      tips.push(`Lexical Resource: thêm một collocation tự nhiên của "${word}", ví dụ ${pick}.`);
    }
    if (cx < 2) tips.push('Grammatical Range: kết hợp một cấu trúc phức như mệnh đề quan hệ (", which …"), mệnh đề nhượng bộ ("Although …, …") hoặc mệnh đề phân từ ("Having …, …") để câu linh hoạt hơn.');
    if (longWords < 2) tips.push('Lexical Resource: thay từ phổ thông bằng từ ít phổ biến hơn nhưng chính xác (ví dụ "important" → "pivotal", "big" → "substantial").');
    if (grammarErr || spellErr) tips.push('Accuracy: sửa các lỗi được đánh dấu — band 8.0 yêu cầu phần lớn câu không lỗi.');
    if (mode === 'S') tips.push('Speaking: nói liền mạch, thêm một lý do hoặc ví dụ cá nhân để phát triển ý (Fluency & Coherence).');
    const model = (examples || []).map((e) => e.en).filter((s) => s && tokens(s).length >= 8).sort((a, b) => complexity(b) - complexity(a))[0] || '';

    return { passed, target_used: target.used, form_ok: target.exact, errors, band, corrected: corrected !== sentence ? corrected : '', upgrade_8: { tips, model }, collocation: coll };
  }

  function round(x) { return Math.round(x * 2) / 2; }

  // Prompt để dán vào Claude/ChatGPT khi muốn AI viết lại câu ở band 8.0 (chế độ manual-copy, 0 đồng).
  function aiPrompt(input, result) {
    return [
      'Bạn là giám khảo IELTS. Chấm câu sau ở cấp câu theo IELTS band descriptors (public version):',
      input.mode === 'S' ? '- Speaking: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation (dựa trên bản ghi chữ).' : '- Writing: Lexical Resource, Grammatical Range & Accuracy.',
      `Từ mục tiêu: "${input.word}" — nghĩa: ${input.meaningVi || ''}.`,
      input.question ? `Câu hỏi: ${input.question}` : '',
      `Câu của học viên: "${input.sentence}"`,
      '',
      'Trả lời bằng tiếng Việt, gồm:',
      '1. Từ mục tiêu dùng đúng nghĩa, đúng từ loại, đúng ngữ cảnh chưa? Giải thích.',
      '2. Liệt kê từng lỗi (ngữ pháp, từ vựng, collocation) và cách sửa.',
      '3. Band ước lượng từng tiêu chí (ghi rõ chỉ là ước lượng ở cấp câu). Ngưỡng đạt: 6.5.',
      '4. Viết lại CHÍNH câu này ở band 8.0 (giữ ý của học viên) và giải thích từng điểm nâng cấp.',
      result && result.band ? `(Hệ thống tự chấm sơ bộ: LR ${result.band.LR}, GRA ${result.band.GRA}.)` : '',
    ].filter(Boolean).join('\n');
  }

  // Gọi LanguageTool (miễn phí). Gặp 402/đòi phí → báo costGuard; lỗi khác → trả [] để chấm bằng luật cục bộ.
  async function languageTool(text, onCost) {
    try {
      const body = new URLSearchParams({ text, language: 'en-GB', enabledOnly: 'false' });
      const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', body });
      if (r.status === 402 || r.status === 403) { if (onCost) onCost(r.status); return null; }
      if (!r.ok) return null;
      const j = await r.json();
      return j.matches || [];
    } catch (e) { return null; }
  }

  const api = { grade, findTarget, inflections, collocationHit, complexity, aiPrompt, languageTool, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VolGrade = api;
})(typeof self !== 'undefined' ? self : this);
