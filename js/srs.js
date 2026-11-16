// Lịch lặp lại ngắt quãng 6 lần tiếp xúc (theo Owner chốt 16/11/2026).
// Lần 1: học lần đầu (ngày D) → level 0
// Lần 2: tối D lúc giờ nhắc R → đạt: 1 Chưa thuộc
// Lần 3: D+1 lúc R            → đạt: 2 Khó thuộc
// Lần 4: +3 ngày lúc R        → đạt: 3 Hơi thuộc
// Lần 5: +7 ngày lúc R        → đạt: 4 Đã thuộc
// Lần 6: +7 ngày lúc R        → đạt: 5 Nằm lòng
// Trượt: lùi 1 cấp (không dưới 0), hẹn lại R ngày hôm sau.
// Mọi phép tính ngày/giờ theo giờ địa phương của trình duyệt.
(function (root) {
  const LEVELS = ['Mới', 'Chưa thuộc', 'Khó thuộc', 'Hơi thuộc', 'Đã thuộc', 'Nằm lòng'];
  // Số ngày tới lần ôn kế tiếp sau khi ĐẠT và lên cấp L.
  const INTERVAL_DAYS = { 1: 1, 2: 3, 3: 7, 4: 7 };
  const MAINTENANCE_DAYS = 30;
  const SKILLS = ['L', 'R', 'W', 'S'];
  const OPEN_HOUR = 6; // thẻ ngày sau mở từ 06:00

  function parseHour(reminder) {
    const [h, m] = String(reminder || '22:00').split(':').map(Number);
    return { h: Math.min(23, Math.max(0, h || 0)), m: Math.min(59, Math.max(0, m || 0)) };
  }

  function atTime(date, h, m) {
    const d = new Date(date.getTime());
    d.setHours(h, m, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date.getTime());
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Ngày đến hạn = R của ngày (now + n), mở từ 06:00 ngày đó.
  function dueInDays(now, n, reminder) {
    const { h, m } = parseHour(reminder);
    const day = addDays(now, n);
    return { dueAt: atTime(day, h, m), availableAt: atTime(day, OPEN_HOUR, 0) };
  }

  // Lần 2 (cùng tối): trước R → R hôm nay; sau R → +1 giờ nếu còn trong ngày, không thì R hôm sau.
  function sameEvening(now, reminder) {
    const { h, m } = parseHour(reminder);
    const r = atTime(now, h, m);
    if (now < r) return { dueAt: r, availableAt: r };
    const plus1 = new Date(now.getTime() + 3600 * 1000);
    if (plus1 <= endOfDay(now)) return { dueAt: plus1, availableAt: plus1 };
    return dueInDays(now, 1, reminder);
  }

  function iso(x) {
    return x ? x.toISOString() : null;
  }

  function newProgress(wordId, now, reminder) {
    const next = sameEvening(now, reminder);
    return {
      word_id: wordId,
      level: 0,
      contacts: 1,
      lapses: 0,
      first_seen_at: iso(now),
      last_review_at: iso(now),
      next_due_at: iso(next.dueAt),
      available_at: iso(next.availableAt),
      skill_cursor: hash(String(wordId)) % SKILLS.length,
      manual_override: false,
    };
  }

  // passed: true/false. Trả về bản ghi mới (không sửa bản cũ).
  function review(p, passed, now, reminder, opts) {
    const maintenance = opts && opts.maintenance;
    const q = { ...p, contacts: (p.contacts || 0) + 1, last_review_at: iso(now), manual_override: false };
    if (passed) {
      q.level = Math.min(5, (p.level || 0) + 1);
      q.skill_cursor = ((p.skill_cursor || 0) + 1) % SKILLS.length;
      let next = null;
      if (q.level < 5) next = dueInDays(now, INTERVAL_DAYS[q.level], reminder);
      else if (maintenance) next = dueInDays(now, MAINTENANCE_DAYS, reminder);
      q.next_due_at = next ? iso(next.dueAt) : null;
      q.available_at = next ? iso(next.availableAt) : null;
    } else {
      q.level = Math.max(0, (p.level || 0) - 1);
      q.lapses = (p.lapses || 0) + 1;
      const next = dueInDays(now, 1, reminder);
      q.next_due_at = iso(next.dueAt);
      q.available_at = iso(next.availableAt);
    }
    return q;
  }

  // Tick tay trong bảng: đặt cấp, lịch tính lại từ lúc tick.
  function setLevel(p, level, now, reminder, opts) {
    const L = Math.max(0, Math.min(5, level | 0));
    const q = { ...p, level: L, manual_override: true, last_review_at: iso(now) };
    let next;
    if (L === 0) next = sameEvening(now, reminder);
    else if (L < 5) next = dueInDays(now, INTERVAL_DAYS[L], reminder);
    else next = opts && opts.maintenance ? dueInDays(now, MAINTENANCE_DAYS, reminder) : null;
    q.next_due_at = next ? iso(next.dueAt) : null;
    q.available_at = next ? iso(next.availableAt) : null;
    return q;
  }

  function isAvailable(p, now) {
    return !!p.available_at && new Date(p.available_at) <= now;
  }

  function isOverdue(p, now) {
    return !!p.next_due_at && new Date(p.next_due_at) <= now;
  }

  // Danh sách thẻ cần ôn: đã mở, quá hạn lâu nhất lên trước.
  function dueList(progressList, now) {
    return progressList.filter((p) => isAvailable(p, now))
      .sort((a, b) => new Date(a.next_due_at) - new Date(b.next_due_at));
  }

  function skillFor(p) {
    return SKILLS[(p.skill_cursor || 0) % SKILLS.length];
  }

  const api = { LEVELS, SKILLS, INTERVAL_DAYS, newProgress, review, setLevel, isAvailable, isOverdue, dueList, skillFor, parseHour };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VolSRS = api;
})(typeof self !== 'undefined' ? self : this);
