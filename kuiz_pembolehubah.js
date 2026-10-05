// Shared engine for Siri 3 & Siri 4 (Pemboleh Ubah) quizzes.
// Each quiz page defines window.QUIZ = { theme, themeDark, themeSoft, levels, questions, credits } before loading this file.
//
// Part types:
//   mcq   – { options: [...], answer: index }
//   bank  – { template: "Semakin {0} {1}, ...", accept: [[...], [...]] }  (chips come from question.chips)
//   write – { rubric: [matcher, ...], model: [...] }  (correct if ANY matcher passes)
//
// Matchers for written answers:
//   { all: [[syn, syn], [syn]], none: [...] }  every group must appear (any synonym); nothing from `none` may appear
//   { trend: { a: [...], b: [...], same: true|false, dirMap } }  "Semakin bertambah A, semakin berkurang B"
//   { compare: { win: [...], lose: [...], b: [...], winDir: 1|-1, needB, dirMap, dirPhrases } }  "S menghasilkan lebih banyak jus daripada R"
//   { num: { min, max } }  any number in the answer within range
(function () {
  'use strict';
  const QUIZ = window.QUIZ;

  const KIND = {
    PD:   { label: 'Pemboleh ubah dimanipulasi', cls: 'k-pd', color: '#22c55e' },
    PM:   { label: 'Pemboleh ubah dimalarkan', cls: 'k-pm', color: '#ec4899' },
    PB:   { label: 'Pemboleh ubah bergerak balas', cls: 'k-pb', color: '#3b82f6' },
    HUB:  { label: 'Hubungan / Kesimpulan', cls: 'k-hub', color: '#f59e0b' },
    LAIN: { label: 'Ramalan / Inferens / Lain-lain', cls: 'k-lain', color: '#64748b' }
  };

  // ---------------- text matching helpers ----------------
  const UP = new Set(['bertambah', 'meningkat', 'naik', 'tinggi', 'besar', 'banyak', 'panjang', 'laju', 'cepat', 'jauh',
    'tebal', 'lama', 'kuat', 'terang', 'berat', 'tambah', 'cergas', 'aktif', 'panas', 'pantas', 'luas', 'lebar',
    'membesar', 'memanjang', 'meninggi', 'bertambahnya', 'ramai', 'kerap', 'lasak', 'susah', 'sukar', 'payah']);
  const DOWN = new Set(['berkurang', 'menurun', 'turun', 'rendah', 'kecil', 'sedikit', 'pendek', 'perlahan', 'lambat',
    'dekat', 'nipis', 'singkat', 'lemah', 'malap', 'ringan', 'kurang', 'sikit', 'sejuk', 'sempit', 'mengecil',
    'memendek', 'berkurangnya', 'gelap', 'mudah', 'senang']);
  const NEGATE = new Set(['tidak', 'tak', 'bukan', 'x']);

  function norm(s) {
    return (s || '').toLowerCase().replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Like norm() but keeps clause punctuation as a ',' token so answers can be split into clauses.
  function normKeepPunct(s) {
    return (s || '').toLowerCase().replace(/[,.;:!?]/g, ' , ').replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9,\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function toks(s) { const n = normKeepPunct(s); return n ? n.split(' ') : []; }

  // Words that start a new clause: "B jauh APABILA A tinggi", "R lama TETAPI S cepat".
  const CLAUSE_BREAK = new Set([',', 'apabila', 'jika', 'bila', 'kalau', 'sekiranya', 'kerana', 'sebab', 'tetapi', 'tapi',
    'manakala', 'sementara', 'maka', 'jadi', 'oleh']);
  function clauseIds(t) {
    let c = 0;
    return t.map(tok => (CLAUSE_BREAK.has(tok) ? ++c : c));
  }
  function fuzzyIn(set, tok) {
    if (set.has(tok)) return true;
    if (tok.length < 5) return false;
    for (const w of set) if (w.length >= 5 && Math.abs(w.length - tok.length) <= 1 && lev(w, tok) <= 1) return true;
    return false;
  }

  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // A key token ending with * is a prefix match. Long words tolerate small spelling mistakes.
  function tokEq(t, k) {
    if (t === k) return true;
    if (t.charAt(0) === '§') return false;
    if (k.endsWith('*')) return t.startsWith(k.slice(0, -1));
    const L = k.length;
    if (L >= 5 && Math.abs(t.length - L) <= 1 && lev(t, k) <= 1) return true;
    if (L >= 8 && Math.abs(t.length - L) <= 2 && lev(t, k) <= 2) return true;
    return false;
  }

  function phraseList(keys) {
    return keys.map(k => k.split(' ').map(w => w.endsWith('*') ? norm(w.slice(0, -1)) + '*' : norm(w)).filter(Boolean))
      .filter(p => p.length).sort((a, b) => b.length - a.length);
  }
  function matchAt(t, i, p) {
    if (i + p.length > t.length) return false;
    for (let j = 0; j < p.length; j++) if (!tokEq(t[i + j], p[j])) return false;
    return true;
  }
  function contains(t, keys) {
    const ps = phraseList(keys);
    for (let i = 0; i < t.length; i++) for (const p of ps) if (matchAt(t, i, p)) return true;
    return false;
  }
  // Replace every occurrence of any key phrase with a single tag token.
  function mark(t, keys, tag) {
    const ps = phraseList(keys);
    const out = [];
    let i = 0;
    outer: while (i < t.length) {
      for (const p of ps) {
        if (matchAt(t, i, p)) { out.push(tag); i += p.length; continue outer; }
      }
      out.push(t[i]); i++;
    }
    return out;
  }

  function applyDirPhrases(t, m) {
    if (!m.dirPhrases) return t;
    const up = [], dn = [];
    Object.keys(m.dirPhrases).forEach(k => (m.dirPhrases[k] > 0 ? up : dn).push(k));
    if (up.length) t = mark(t, up, '§UP');
    if (dn.length) t = mark(t, dn, '§DN');
    return t;
  }
  function directions(t, m) {
    const map = m.dirMap || {};
    const out = [];
    t.forEach((tok, i) => {
      let d = 0;
      if (tok === '§UP') d = 1;
      else if (tok === '§DN') d = -1;
      else if (Object.prototype.hasOwnProperty.call(map, tok)) d = map[tok];
      else if (tok.charAt(0) === '§' || tok === ',') d = 0;
      else if (UP.has(tok)) d = 1;
      else if (DOWN.has(tok)) d = -1;
      else if (fuzzyIn(UP, tok)) d = 1;
      else if (fuzzyIn(DOWN, tok)) d = -1;
      if (!d) return;
      if (i > 0 && NEGATE.has(t[i - 1])) d = -d;
      out.push({ i, d });
    });
    return out;
  }

  function evalAll(t, m) {
    for (const g of m.all) if (!contains(t, g)) return false;
    if (m.none && contains(t, m.none)) return false;
    return true;
  }

  // Each direction word belongs to the nearest variable mention (ties go to the following one,
  // because Malay puts the direction first: "semakin TINGGI satah condong").
  function evalTrend(t, m) {
    t = applyDirPhrases(t, m);
    t = mark(t, m.a, '§A');
    t = mark(t, m.b, '§B');
    const tags = [];
    t.forEach((tok, i) => { if (tok === '§A' || tok === '§B') tags.push({ i, tag: tok }); });
    if (!tags.some(x => x.tag === '§A') || !tags.some(x => x.tag === '§B')) return false;
    let dA = 0, dB = 0;
    const cl = clauseIds(t);
    directions(t, m).forEach(({ i, d }) => {
      let best = null, bd = Infinity;
      const local = tags.filter(p => cl[p.i] === cl[i]);
      (local.length ? local : tags).forEach(p => {
        const dist = Math.abs(p.i - i);
        if (dist < bd || (dist === bd && p.i > i)) { bd = dist; best = p.tag; }
      });
      if (best === '§A') dA += d; else dB += d;
    });
    if (!dA || !dB) return false;
    return (Math.sign(dA) === Math.sign(dB)) === m.same;
  }

  // Per clause, the first-mentioned item is the subject and the clause's direction must suit it.
  // "R mengambil masa lama, tetapi S tidak lama" → both clauses agree. Any contradicting clause fails.
  function evalCompare(t, m) {
    t = applyDirPhrases(t, m);
    if (m.b) t = mark(t, m.b, '§B');
    t = mark(t, m.win, '§W');
    t = mark(t, m.lose, '§L');
    if (m.needB !== false && m.b && !t.includes('§B')) return false;
    const cl = clauseIds(t);
    const dirs = directions(t, m);
    let good = 0, bad = 0;
    for (let c = 0; c <= cl[cl.length - 1]; c++) {
      const subj = t.find((x, i) => cl[i] === c && (x === '§W' || x === '§L'));
      if (!subj) continue;
      const dir = Math.sign(dirs.filter(x => cl[x.i] === c).reduce((s, x) => s + x.d, 0));
      if (!dir) continue;
      if ((subj === '§W' ? dir === m.winDir : dir === -m.winDir)) good++; else bad++;
    }
    return good > 0 && bad === 0;
  }

  function evalNum(text, m) {
    const nums = (text.match(/\d+(?:[.,]\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.')));
    return nums.some(n => n >= m.min && n <= m.max);
  }

  function evalRubric(text, rubric) {
    const t = toks(text);
    if (!t.length) return false;
    return rubric.some(m => {
      if (m.all) return evalAll(t, m);
      if (m.trend) return evalTrend(t, m.trend);
      if (m.compare) return evalCompare(t, m.compare);
      if (m.num) return evalNum(text, m.num);
      return false;
    });
  }

  // ---------------- rendering ----------------
  const state = { mcq: {}, bank: {}, results: {}, graded: false };
  let activeBlank = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function fillTemplate(template, words) {
    return template.replace(/\{(\d+)\}/g, (_, n) => '<strong>' + esc(words[+n] || '___') + '</strong>');
  }

  function renderPetua() {
    const box = document.getElementById('petua');
    if (!box) return;
    box.className = 'petua';
    box.open = true;
    box.innerHTML = `
      <summary>💡 PETUA: Cara kenal pasti pemboleh ubah (baca dulu sebelum mula!)</summary>
      <div class="petua-body">
        <div class="var-grid">
          <div class="var-card k-pd-card"><h3>🔄 Dimanipulasi</h3>
            <p>Perkara yang <b>SENGAJA DIUBAH</b> / dibezakan oleh penyiasat.</p>
            <span class="ask">Tanya: "Apa yang BERBEZA antara set?"</span></div>
          <div class="var-card k-pm-card"><h3>🔒 Dimalarkan</h3>
            <p>Perkara yang <b>DIKEKALKAN SAMA</b> supaya ujian adil.</p>
            <span class="ask">Tanya: "Apa yang SAMA?"</span></div>
          <div class="var-card k-pb-card"><h3>👀 Bergerak balas</h3>
            <p><b>HASIL</b> yang diperhatikan / diukur / dikira di akhir.</p>
            <span class="ask">Tanya: "Apa yang saya LIHAT atau UKUR?"</span></div>
        </div>
        <div class="formula">
          <h3>✍️ Formula menulis HUBUNGAN (dimanipulasi → bergerak balas)</h3>
          <ol>
            <li>Jika dimanipulasi ialah <b>NOMBOR</b> (cm, bilangan, minit):<br>
              <code>Semakin bertambah [dimanipulasi], semakin bertambah/berkurang [bergerak balas].</code></li>
            <li>Jika dimanipulasi ialah <b>JENIS / ADA-TIADA</b> (jenis alat, jenis bahan):<br>
              <code>[Benda A] menghasilkan [bergerak balas] lebih banyak/tinggi berbanding [Benda B].</code><br>
              ⚠️ Jangan tulis "jumlahnya tidak sama" sahaja, tetapi sebut <b>yang mana LEBIH</b>.</li>
            <li>Jalan pintas: dalam jadual, <b>lajur kiri</b> biasanya dimanipulasi dan <b>lajur kanan</b> bergerak balas.</li>
          </ol>
        </div>
      </div>`;
  }

  function renderQuiz() {
    const container = document.getElementById('quizContainer');
    const levels = QUIZ.levels || [];
    let qNum = 1;

    QUIZ.questions.forEach((q, qi) => {
      const lvl = levels.find(l => l.from === qNum);
      if (lvl) container.appendChild(el('div', 'level-banner', `<h2>${lvl.name}</h2><p>${lvl.desc}</p>`));

      const block = el('div', 'q-block');
      block.id = 'q' + qi;
      block.appendChild(el('div', 'q-header',
        `<span>Soalan ${qNum}: ${esc(q.title)}</span><span class="q-marks">${q.parts.length} markah</span>`));
      const body = el('div', 'q-body');
      body.appendChild(el('p', 'scenario', q.scenario));

      if (q.images && q.images.length) {
        const row = el('div', 'img-row');
        q.images.forEach(im => {
          const fig = el('figure');
          const img = el('img');
          img.src = im.src; img.alt = im.cap || q.title; img.loading = 'lazy';
          fig.appendChild(img);
          if (im.cap) fig.appendChild(el('figcaption', '', im.cap));
          row.appendChild(fig);
        });
        body.appendChild(row);
      }
      if (q.svg) body.appendChild(el('div', 'svg-wrap', q.svg));
      if (q.table) {
        const tbl = el('table', 'data-table');
        tbl.innerHTML = '<thead><tr>' + q.table.headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
          q.table.rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody>';
        body.appendChild(tbl);
      }

      if (q.chips) {
        const bank = el('div', 'chip-bank');
        bank.appendChild(el('span', 'bank-label',
          '🧺 Kotak perkataan: klik tempat kosong (____), kemudian klik perkataan. Perkataan boleh diguna lebih sekali.'));
        shuffle(q.chips).forEach(c => {
          const chip = el('button', 'chip', esc(c));
          chip.type = 'button';
          chip.onclick = () => placeChip(qi, c);
          bank.appendChild(chip);
        });
        body.appendChild(bank);
      }

      q.parts.forEach((p, pi) => body.appendChild(renderPart(q, qi, p, pi)));
      block.appendChild(body);
      container.appendChild(block);
      qNum++;
    });

    if (QUIZ.credits) {
      const cr = el('div', 'credits', '<strong>Kredit gambar (Wikimedia Commons):</strong>');
      const ul = el('ul');
      QUIZ.credits.forEach(c => ul.appendChild(el('li', '', c)));
      cr.appendChild(ul);
      container.parentNode.appendChild(cr);
    }
  }

  function partId(qi, pi) { return 'q' + qi + 'p' + pi; }

  function renderPart(q, qi, p, pi) {
    const id = partId(qi, pi);
    const k = KIND[p.kind];
    const div = el('div', 'part ' + k.cls);
    div.id = id;
    div.appendChild(el('span', 'part-tag', p.tagText || k.label));
    div.appendChild(el('div', 'part-prompt', `(${String.fromCharCode(97 + pi)}) ${p.prompt}`));

    if (p.type === 'mcq') {
      const ul = el('ul', 'options-list');
      p.options.forEach((opt, oi) => {
        const li = el('li', 'option-item', esc(opt));
        li.onclick = () => {
          if (state.graded) return;
          ul.querySelectorAll('.option-item').forEach(x => x.classList.remove('selected'));
          li.classList.add('selected');
          state.mcq[id] = oi;
        };
        ul.appendChild(li);
      });
      div.appendChild(ul);
    } else if (p.type === 'bank') {
      const slots = (p.template.match(/\{\d+\}/g) || []).length;
      state.bank[id] = new Array(slots).fill(null);
      const tpl = el('div', 'template');
      tpl.innerHTML = esc(p.template).replace(/\{(\d+)\}/g, (_, n) =>
        `<button type="button" class="blank empty" data-q="${qi}" data-part="${id}" data-slot="${n}">______</button>`);
      tpl.querySelectorAll('.blank').forEach(b => { b.onclick = () => clickBlank(b); });
      div.appendChild(tpl);
    } else if (p.type === 'write') {
      const input = p.long ? el('textarea', 'write-input') : el('input', 'write-input');
      if (p.long) input.rows = 3; else input.type = 'text';
      input.id = 'in-' + id;
      input.placeholder = 'Tulis jawapan kamu di sini...';
      input.autocomplete = 'off';
      div.appendChild(input);
      if (p.hint) {
        const hb = el('button', 'hint-btn', '💡 Perlukan petunjuk?');
        hb.type = 'button';
        const hbox = el('div', 'hint-box', p.hint);
        hb.onclick = () => { hbox.style.display = hbox.style.display === 'block' ? 'none' : 'block'; };
        div.appendChild(hb);
        div.appendChild(hbox);
      }
    }
    const fb = el('div', 'feedback');
    fb.id = 'fb-' + id;
    div.appendChild(fb);
    return div;
  }

  // ---------------- word bank interaction ----------------
  function setActive(b) {
    if (activeBlank) activeBlank.classList.remove('active');
    activeBlank = b;
    if (b) b.classList.add('active');
  }
  function clickBlank(b) {
    if (state.graded) return;
    if (activeBlank === b && b.classList.contains('filled')) {
      setBlank(b, null);
      return;
    }
    setActive(b);
  }
  function setBlank(b, word) {
    state.bank[b.dataset.part][+b.dataset.slot] = word;
    b.textContent = word || '______';
    b.classList.toggle('filled', !!word);
    b.classList.toggle('empty', !word);
  }
  function placeChip(qi, word) {
    if (state.graded) return;
    const blanks = Array.from(document.querySelectorAll(`#q${qi} .blank`));
    let target = (activeBlank && blanks.includes(activeBlank)) ? activeBlank : blanks.find(b => b.classList.contains('empty'));
    if (!target) return;
    setBlank(target, word);
    const idx = blanks.indexOf(target);
    const next = blanks.slice(idx + 1).concat(blanks.slice(0, idx)).find(b => b.classList.contains('empty'));
    setActive(next || null);
  }

  // ---------------- grading ----------------
  function gradeQuiz() {
    state.graded = true;
    setActive(null);
    QUIZ.questions.forEach((q, qi) => q.parts.forEach((p, pi) => gradePart(q, qi, p, pi)));
    document.querySelectorAll('.write-input').forEach(i => { i.readOnly = true; });
    document.getElementById('quizContainer').classList.add('locked');
    updateScore();
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function gradePart(q, qi, p, pi) {
    const id = partId(qi, pi);
    const fb = document.getElementById('fb-' + id);
    let ok = false, answered = true, html = '';

    if (p.type === 'mcq') {
      const sel = state.mcq[id];
      const items = document.querySelectorAll(`#${id} .option-item`);
      items[p.answer].classList.add('is-correct');
      if (sel === undefined) {
        answered = false;
      } else {
        ok = sel === p.answer;
        if (!ok) items[sel].classList.add('is-wrong');
      }
      html = ok ? `<strong>Betul!</strong> ${p.explain || ''}`
        : `<strong>${answered ? 'Belum tepat.' : 'Tidak dijawab.'}</strong> Jawapan betul: <strong>${esc(p.options[p.answer])}</strong>. ${p.explain || ''}`;
    } else if (p.type === 'bank') {
      const filled = state.bank[id];
      answered = filled.every(Boolean);
      ok = answered && p.accept.some(a => a.every((w, i) => w === filled[i]));
      html = ok ? `<strong>Betul!</strong> ${p.explain || ''}`
        : `<strong>${answered ? 'Belum tepat.' : 'Belum lengkap.'}</strong> Jawapan betul: ${fillTemplate(p.template, p.accept[0])} ${p.explain || ''}`;
    } else {
      const val = document.getElementById('in-' + id).value;
      answered = val.trim().length > 0;
      ok = answered && evalRubric(val, p.rubric);
      const models = (p.model || []).map(m => `• ${m}`).join('<br>');
      html = `<strong>${ok ? 'Betul! (disemak automatik)' : answered ? 'Belum tepat (disemak automatik).' : 'Tidak dijawab.'}</strong> ${p.explain || ''}` +
        (models ? `<div class="model"><em>Contoh jawapan yang diterima:</em><br>${models}</div>` : '');
    }

    state.results[id] = { auto: ok, override: null, kind: p.kind, type: p.type, html };
    fb.style.display = 'block';
    paintFeedback(id);
  }

  function isCorrect(r) { return r.override === null ? r.auto : r.override; }

  // Written answers get a parent override button, since keyword marking cannot catch every correct phrasing.
  function paintFeedback(id) {
    const r = state.results[id];
    const fb = document.getElementById('fb-' + id);
    const ok = isCorrect(r);
    fb.className = 'feedback ' + (ok ? 'correct-fb' : 'incorrect-fb');
    fb.innerHTML = r.html;
    if (r.type === 'write') {
      const btn = el('button', 'override-btn', ok ? '✘ Ibu/Ayah: kira SALAH' : '✔ Ibu/Ayah: jawapan ini sebenarnya BETUL');
      btn.type = 'button';
      btn.onclick = () => {
        r.override = r.override === null ? !r.auto : null;
        paintFeedback(id);
        updateScore();
      };
      fb.appendChild(btn);
      if (r.override !== null) fb.appendChild(el('span', 'override-note', '(markah diubah oleh ibu/ayah — klik sekali lagi untuk batal)'));
    }
  }

  function updateScore() {
    const all = Object.values(state.results);
    const total = all.length;
    const got = all.filter(isCorrect).length;
    const pct = Math.round((got / total) * 100);
    const msg = pct >= 80 ? 'Hebat! Kamu sudah faham pemboleh ubah! 🌟'
      : pct >= 60 ? 'Bagus! Sedikit lagi latihan. 💪'
      : 'Jangan putus asa! Baca petua di atas dan cuba lagi. 🙂';

    const rows = Object.keys(KIND).map(k => {
      const list = all.filter(r => r.kind === k);
      if (!list.length) return '';
      const g = list.filter(isCorrect).length;
      const w = Math.round((g / list.length) * 100);
      return `<div class="score-row">${KIND[k].label}: <strong>${g} / ${list.length}</strong>
        <div class="bar"><span style="width:${w}%;background:${KIND[k].color}"></span></div></div>`;
    }).join('');

    const typeName = { mcq: 'Tahap 1 (pilih jawapan)', bank: 'Tahap 2 (kotak perkataan)', write: 'Tahap 3 (tulis sendiri)' };
    const typeRows = Object.keys(typeName).map(t => {
      const list = all.filter(r => r.type === t);
      if (!list.length) return '';
      return `<div class="score-row">${typeName[t]}: <strong>${list.filter(isCorrect).length} / ${list.length}</strong></div>`;
    }).join('');

    const banner = document.getElementById('scoreBanner');
    banner.innerHTML = `<div class="score-main">Markah: ${got} / ${total} (${pct}%) — ${msg}</div>
      <div class="score-grid">${rows}${typeRows}</div>
      <div class="score-note">Soalan bertulis (Tahap 3) disemak secara automatik menggunakan kata kunci. Ibu/Ayah boleh tukar markah dengan butang di bawah setiap jawapan.</div>`;
    banner.style.display = 'block';
  }

  function resetQuiz() {
    state.mcq = {}; state.results = {}; state.graded = false;
    document.getElementById('quizContainer').innerHTML = '';
    document.querySelectorAll('.credits').forEach(c => c.remove());
    document.getElementById('scoreBanner').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('resetBtn').style.display = 'none';
    document.getElementById('quizContainer').classList.remove('locked');
    activeBlank = null;
    renderQuiz();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // exposed for testing in the console
  window.KuizPU = { evalRubric };

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement.style;
    if (QUIZ.theme) root.setProperty('--theme', QUIZ.theme);
    if (QUIZ.themeDark) root.setProperty('--theme-dark', QUIZ.themeDark);
    if (QUIZ.themeSoft) root.setProperty('--theme-soft', QUIZ.themeSoft);
    renderPetua();
    renderQuiz();
    document.getElementById('submitBtn').onclick = gradeQuiz;
    document.getElementById('resetBtn').onclick = resetQuiz;
  });
})();
