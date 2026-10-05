// Shared engine for Siri 5 & Siri 6 (Karangan BM).
// Each page defines window.KARANGAN = { theme, themeDark, themeSoft, minWords, levels, items, credits } before loading this file.
//
// item = { title, tajuk, image: {src, cap}, mode: 'latih' | 'tulis', topicWords: [...stems],
//          activities: [...] (latih only), hints: { pendahuluan, isi: [{t, k:[...]}], penutup, kosaKata }, model: [paragraphs] }
// activity types:
//   pilih  – { items: [{t, ok, why}] }                 click every isi that belongs to the title
//   susun  – { sentences: [...] } (correct order)      arrange sentences
//   bina   – { sentence: '...' }                       arrange shuffled words into a sentence
//   kosong – { template: '{0}, ...', chips, accept: [[...], ...] }  one list of accepted words per blank
(function () {
  'use strict';
  const K = window.KARANGAN;

  // ---------------- language rules for the checker ----------------
  const SLANG = {
    x: 'tidak', tak: 'tidak', tk: 'tidak', takde: 'tiada', takda: 'tiada', xde: 'tiada', xda: 'tiada', tade: 'tiada',
    nak: 'hendak / mahu', dah: 'sudah / telah', je: 'sahaja', jer: 'sahaja', jek: 'sahaja', kat: 'di / kepada',
    pastu: 'selepas itu', lps: 'lepas', dgn: 'dengan', yg: 'yang', sy: 'saya', utk: 'untuk', tu: 'itu', ni: 'ini',
    camtu: 'seperti itu', camni: 'seperti ini', camne: 'bagaimana', mcm: 'seperti', macam: 'seperti', sbb: 'kerana / sebab',
    korang: 'kamu semua', kitorang: 'kami', kitaorang: 'kami', diorang: 'mereka', dorang: 'mereka', dlm: 'dalam', pd: 'pada',
    tgk: 'melihat', tengok: 'melihat', sikit: 'sedikit', byk: 'banyak', lg: 'lagi', mmg: 'memang', sgt: 'sangat',
    org: 'orang', smp: 'sampai', pon: 'pun', tapi: 'tetapi', tp: 'tetapi', jgn: 'jangan', blh: 'boleh', bole: 'boleh',
    kena: 'perlu / mesti', gi: 'pergi', bg: 'beri', bagitau: 'memberitahu', bgtau: 'memberitahu', cakap: 'berkata',
    best: 'seronok', syok: 'seronok', lepak: 'berehat', ape: 'apa', apa2: 'apa-apa', mane: 'mana', sape: 'siapa', dekat: 'di (tempat)',
    jom: 'marilah', ok: 'baiklah', okay: 'baiklah', kalo: 'kalau', klu: 'kalau', abis: 'habis', ckp: 'berkata'
  };
  // "dekat" is also a real word (near). Only flag it as a place preposition: "dekat sekolah" style is too subtle, so skip.
  delete SLANG.dekat;
  const ENGLISH = new Set(['and', 'so', 'then', 'because', 'but', 'the', 'very', 'happy', 'sad', 'school', 'teacher', 'friend',
    'friends', 'sorry', 'thank', 'thanks', 'yes', 'no', 'wow', 'nice', 'tired', 'fun', 'game', 'games', 'finally', 'after', 'before', 'my', 'we']);
  const PLACES = ['rumah', 'sekolah', 'kelas', 'kantin', 'padang', 'taman', 'pantai', 'kampung', 'zoo', 'tandas', 'dalam', 'luar',
    'atas', 'bawah', 'tepi', 'hadapan', 'depan', 'belakang', 'sana', 'sini', 'situ', 'pasar', 'tapak', 'kawasan', 'surau',
    'masjid', 'hospital', 'perpustakaan', 'hutan', 'sungai', 'bandar', 'kem', 'dewan', 'kebun', 'tengah', 'antara', 'mana',
    'muzium', 'tempat', 'laut', 'bilik', 'dapur', 'halaman', 'jalan', 'kedai', 'pejabat', 'stesen'];
  const JOINED_PLACE = new RegExp('^(di|ke)(' + PLACES.join('|') + ')$');
  const PASSIVE_EXCEPT = new Set(['kanan', 'pekan', 'ikan', 'bukan', 'akan', 'jalan', 'taman']);

  const ISI_PW = ['pertama', 'mula-mula', 'selain itu', 'seterusnya', 'di samping itu', 'kemudian', 'selepas itu', 'akhir sekali', 'kedua', 'ketiga', 'setelah', 'tambahan pula',
    'setibanya', 'keesokan', 'pada sebelah', 'sebaik sahaja', 'pada mulanya', 'sebelum', 'apabila'];
  const PENUTUP_PW = ['kesimpulannya', 'sebagai kesimpulan', 'akhirnya', 'konklusinya', 'tuntasnya', 'secara keseluruhan'];
  const GENERIC = ['gembira', 'seronok', 'penat', 'letih', 'puas', 'bangga', 'sedih', 'takut', 'teruja', 'bersyukur', 'syukur',
    'pengalaman', 'kenangan', 'pengajaran', 'berharap', 'harap', 'semoga', 'insya', 'lupakan', 'kesimpulan', 'akhirnya',
    'pagi', 'petang', 'malam', 'tengah hari', 'pukul', 'jam', 'sabtu', 'ahad', 'isnin', 'selasa', 'rabu', 'khamis', 'jumaat',
    'minggu', 'cuti', 'hari', 'sempena', 'terima kasih', 'tajuk'];

  // ---------------- small helpers ----------------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function shuffle(arr) {
    let a;
    do {
      a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    } while (arr.length > 1 && a.every((x, i) => x === arr[i]));
    return a;
  }
  function wordCount(t) { return (t.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length; }
  function hasStem(textLower, stems) {
    return stems.some(s => s.length <= 3 ? new RegExp('\\b' + s + '\\b').test(textLower) : textLower.includes(s));
  }

  // ---------------- essay checker ----------------
  function tokenSpans(s) {
    const out = []; const re = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g; let m;
    while ((m = re.exec(s))) out.push({ w: m[0], lw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    return out;
  }

  function sentenceIssues(s) {
    const t = tokenSpans(s);
    const spans = [];
    t.forEach((tk, i) => {
      const next = t[i + 1];
      if (Object.prototype.hasOwnProperty.call(SLANG, tk.lw)) {
        spans.push({ start: tk.start, end: tk.end, msg: `Bahasa pasar/singkatan. Gunakan: "${SLANG[tk.lw]}"` });
      } else if (ENGLISH.has(tk.lw)) {
        spans.push({ start: tk.start, end: tk.end, msg: 'Perkataan bahasa Inggeris. Gunakan perkataan Bahasa Melayu.' });
      } else if (JOINED_PLACE.test(tk.lw)) {
        const m = tk.lw.match(JOINED_PLACE);
        spans.push({ start: tk.start, end: tk.end, msg: `"${m[1]}" sebelum tempat mesti dijarakkan: "${m[1]} ${m[2]}"` });
      } else if (/^[a-z]+2$/i.test(tk.w)) {
        const base = tk.w.slice(0, -1);
        spans.push({ start: tk.start, end: tk.end, msg: `Kata ganda ditulis penuh: "${base}-${base}"` });
      } else if (tk.lw === 'di' && next && /kan$|kannya$/.test(next.lw) && !PASSIVE_EXCEPT.has(next.lw) && next.lw.length > 5) {
        spans.push({ start: tk.start, end: next.end, msg: `Kata kerja pasif mesti dirapatkan: "di${next.lw}"` });
      } else if (next && tk.lw === next.lw && tk.lw.length > 1) {
        spans.push({ start: tk.start, end: next.end, msg: `Kata ganda perlu tanda sempang: "${tk.lw}-${tk.lw}"` });
      }
    });
    const first = t[0];
    if (first && /^[a-z]/.test(first.w)) {
      spans.push({ start: first.start, end: first.end, msg: 'Ayat mesti bermula dengan huruf besar.' });
    }
    return spans;
  }

  function renderSentence(s, item, notes) {
    const spans = sentenceIssues(s).sort((a, b) => a.start - b.start);
    let html = '', pos = 0;
    spans.forEach(sp => {
      if (sp.start < pos) return;
      html += esc(s.slice(pos, sp.start)) + `<mark class="err" title="${esc(sp.msg)}">${esc(s.slice(sp.start, sp.end))}</mark>`;
      notes.err.push(`<b>${esc(s.slice(sp.start, sp.end))}</b> — ${esc(sp.msg)}`);
      pos = sp.end;
    });
    html += esc(s.slice(pos));

    const lower = s.toLowerCase();
    const wc = wordCount(s);
    if (wc >= 4 && !hasStem(lower, item.topicWords) && !hasStem(lower, GENERIC)) {
      notes.off.push(esc(s.trim()));
      return `<mark class="off" title="Adakah ayat ini berkaitan dengan tajuk? Jika tidak, buang ayat ini.">${html}</mark>`;
    }
    if (wc > 30) {
      notes.long.push(esc(s.trim().slice(0, 60)) + '…');
      return `<mark class="long" title="Ayat terlalu panjang (${wc} patah perkataan). Pecahkan kepada dua ayat.">${html}</mark>`;
    }
    return html;
  }

  function analyse(text, item) {
    const paras = text.replace(/\r/g, '').split(/\n+/).map(p => p.trim()).filter(Boolean);
    const notes = { err: [], off: [], long: [], punct: [] };
    const lower = text.toLowerCase();
    const viewParas = paras.map((p, pi) => {
      // "." always ends a sentence; "!" and "?" only when a capital letter follows (so 'laungan "Merdeka!" sebanyak' stays one sentence).
      const sentences = p.split(/(?<=\.["'”’]?)\s+|(?<=[!?]["'”’]?)\s+(?=[A-Z])/).filter(Boolean);
      let html = sentences.map(s => renderSentence(s + ' ', item, notes)).join('');
      if (!/[.!?]$/.test(p)) {
        html += '<mark class="err" title="Tiada noktah di hujung perenggan.">&nbsp;?&nbsp;</mark>';
        notes.punct.push(`Perenggan ${pi + 1} tiada noktah (.) di hujung.`);
      }
      return `<p>${html}</p>`;
    });

    const wc = wordCount(text);
    const minW = K.minWords || 80;
    const isiPW = ISI_PW.filter(w => lower.includes(w));
    const lastPara = (paras[paras.length - 1] || '').toLowerCase();
    const penutupOK = PENUTUP_PW.some(w => lastPara.includes(w));
    const pendOK = paras.length > 0 && hasStem(paras[0].toLowerCase(), item.topicWords);
    const isiHits = (item.hints.isi || []).map(x => ({ t: x.t, ok: x.k.some(k => lower.includes(k)) }));
    const isiGot = isiHits.filter(x => x.ok).length;

    const line = (ok, txt) => `<li>${ok ? '✅' : '⚠️'} ${txt}</li>`;
    let html = '<h4>📋 Senarai semak</h4><ul class="check-list">' +
      line(wc >= minW, `Panjang karangan: <b>${wc}</b> patah perkataan (sasaran sekurang-kurangnya ${minW}).`) +
      line(paras.length >= 4, `Bilangan perenggan: <b>${paras.length}</b> (sasaran: 1 pendahuluan + 2–3 isi + 1 penutup = 4–5 perenggan).`) +
      line(pendOK, pendOK ? 'Pendahuluan menyebut tentang tajuk.' : 'Pendahuluan (perenggan pertama) belum menyebut tajuk dengan jelas.') +
      line(isiPW.length >= 2, isiPW.length ? `Penanda wacana isi digunakan: <b>${isiPW.join(', ')}</b>.` : 'Belum guna penanda wacana seperti <b>Pertama, Selain itu, Akhir sekali</b>.') +
      line(penutupOK, penutupOK ? 'Perenggan penutup bermula dengan penanda kesimpulan.' : 'Perenggan terakhir belum guna <b>Kesimpulannya / Akhirnya</b>.') +
      line(isiGot >= 3, `Isi daripada petunjuk yang ditulis: <b>${isiGot} / ${isiHits.length}</b>`) +
      line(notes.err.length + notes.punct.length === 0, `Kesalahan bahasa / ejaan / tanda baca dikesan: <b>${notes.err.length + notes.punct.length}</b>`) +
      line(notes.off.length === 0, `Ayat yang mungkin TERKELUAR daripada tajuk: <b>${notes.off.length}</b>`) +
      '</ul>';

    html += '<ul class="check-list" style="margin-left:18px">' + isiHits.map(x => `<li>${x.ok ? '✅' : '⬜'} ${esc(x.t)}</li>`).join('') + '</ul>';
    html += '<h4>🖍️ Karangan kamu (letak tetikus / sentuh tanda berwarna untuk penjelasan)</h4>' +
      '<div class="legend"><span><mark class="err">merah</mark> kesalahan bahasa</span><span><mark class="off">kuning</mark> semak: berkaitan dengan tajuk?</span><span><mark class="long">oren</mark> ayat terlalu panjang</span></div>' +
      `<div class="essay-view">${viewParas.join('')}</div>`;
    const all = notes.err.concat(notes.punct);
    if (all.length) html += '<h4>❌ Senarai kesalahan bahasa</h4><ul class="issue-list">' + all.map(n => `<li>${n}</li>`).join('') + '</ul>';
    if (notes.off.length) html += '<h4>🤔 Ayat ini berkaitan dengan tajuk?</h4><ul class="issue-list">' + notes.off.map(n => `<li>${n}</li>`).join('') + '</ul>' +
      '<p style="font-size:0.88em">Tanya diri sendiri: "Adakah ayat ini tentang <b>' + esc(item.title) + '</b>?" Jika tidak, buang atau tukar ayat itu.</p>';
    html += '<p style="font-size:0.8em;color:#64748b">Nota: Semakan automatik ini hanya mengesan kesalahan biasa. Ia bukan semakan tatabahasa penuh, jadi minta ibu/ayah baca juga.</p>';
    return html;
  }

  // ---------------- rendering ----------------
  const state = { acts: {}, graded: false };
  let activeBlank = null;

  function renderPetua() {
    const box = document.getElementById('petua');
    box.className = 'petua';
    box.open = true;
    box.innerHTML = `<summary>💡 PETUA: Struktur karangan (baca dulu!) ▾</summary>
      <div class="petua-body">
        <div class="struct-grid">
          <div class="struct-card c-pend"><h3>1️⃣ Pendahuluan (1 perenggan)</h3><ul>
            <li><b>Bila?</b> Pada hari Sabtu yang lalu...</li><li><b>Di mana?</b> ...di sekolah saya...</li>
            <li><b>Siapa?</b> ...saya dan rakan-rakan...</li><li><b>Apa?</b> ...mengadakan gotong-royong.</li></ul></div>
          <div class="struct-card c-isi"><h3>2️⃣ Isi (2–3 perenggan)</h3><ul>
            <li>Satu perenggan = <b>SATU isi sahaja</b>.</li>
            <li>Mula dengan penanda wacana: <b>Pertama, Selain itu, Seterusnya, Akhir sekali</b>.</li>
            <li>Ayat isi + 1–2 ayat huraian (bagaimana / mengapa).</li></ul></div>
          <div class="struct-card c-pen"><h3>3️⃣ Penutup (1 perenggan)</h3><ul>
            <li>Mula dengan <b>Kesimpulannya</b> / <b>Akhirnya</b>.</li>
            <li>Perasaan: gembira, puas, penat tetapi seronok.</li>
            <li>Pengajaran / harapan.</li></ul></div>
        </div>
        <div class="golden">🔑 <b>PERATURAN EMAS:</b> Selepas menulis SETIAP ayat, tanya: <b>"Adakah ayat ini tentang TAJUK?"</b>
          Jika tajuk ialah <i>Gotong-royong</i>, setiap ayat mesti tentang gotong-royong. Jangan tiba-tiba cerita tentang perkara lain
          (contohnya objek tajam, kedai aiskrim, atau permainan video). Jika tidak berkaitan, <b>buang</b> ayat itu.</div>
      </div>`;
  }

  function render() {
    const container = document.getElementById('kContainer');
    container.innerHTML = '';
    K.items.forEach((item, ki) => {
      const lvl = (K.levels || []).find(l => l.from === ki + 1);
      if (lvl) container.appendChild(el('div', 'level-banner', `<h2>${lvl.name}</h2><p>${lvl.desc}</p>`));

      const block = el('div', 'k-block');
      block.id = 'k' + ki;
      block.appendChild(el('div', 'k-header', `<span>Karangan ${ki + 1}: ${esc(item.title)}</span><span class="mode">${item.mode === 'latih' ? '🧩 Latihan susun & klik' : '✍️ Tulis sendiri'}</span>`));
      const body = el('div', 'k-body');
      if (item.image) {
        body.appendChild(el('figure', 'k-figure', `<img src="${item.image.src}" alt="${esc(item.title)}" loading="lazy"><figcaption>${esc(item.image.cap || '')}</figcaption>`));
      }
      body.appendChild(el('div', 'tajuk-box', `<b>Soalan:</b> ${item.tajuk}`));

      (item.activities || []).forEach((a, ai) => body.appendChild(renderActivity(item, ki, a, ai)));

      const wrap = el('div', 'write-wrap');
      wrap.appendChild(el('h3', '', item.mode === 'latih'
        ? '✍️ Cabaran (pilihan): Sekarang tulis karangan penuh kamu sendiri'
        : '✍️ Tulis karangan kamu di sini (tekan Enter untuk perenggan baharu)'));
      const ta = el('textarea', 'essay');
      ta.id = 'essay-' + ki;
      ta.placeholder = 'Perenggan 1: Pendahuluan...\nPerenggan 2: Pertama, ...\nPerenggan 3: Selain itu, ...\nPerenggan 4: Akhir sekali, ...\nPerenggan 5: Kesimpulannya, ...';
      ta.spellcheck = false;
      const counter = el('div', 'counter');
      const updateCount = () => {
        const wc = wordCount(ta.value);
        const paras = ta.value.split(/\n+/).filter(p => p.trim()).length;
        counter.innerHTML = `Patah perkataan: <b class="${wc >= (K.minWords || 80) ? 'ok' : 'low'}">${wc}</b> / sasaran ${K.minWords || 80} &nbsp;•&nbsp; Perenggan: <b>${paras}</b>`;
      };
      ta.addEventListener('input', updateCount);
      updateCount();
      wrap.appendChild(ta);
      wrap.appendChild(counter);

      const row = el('div', 'btn-row');
      const hintPanel = el('div', 'panel hint-panel', renderHints(item));
      const modelPanel = el('div', 'panel model-panel', renderModel(item));
      const checkPanel = el('div', 'panel check-panel');
      checkPanel.id = 'check-' + ki;
      const toggle = (panel) => () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; };
      const bHint = el('button', 'btn btn-hint', '💡 Petunjuk (isi penting)'); bHint.type = 'button'; bHint.onclick = toggle(hintPanel);
      const bModel = el('button', 'btn btn-model', '📖 Tunjuk Karangan Contoh'); bModel.type = 'button'; bModel.onclick = toggle(modelPanel);
      const bCheck = el('button', 'btn btn-check', '✅ Semak karangan saya'); bCheck.type = 'button'; bCheck.onclick = () => checkEssay(ki, true);
      row.append(bHint, bModel, bCheck);
      wrap.appendChild(row);
      wrap.append(hintPanel, modelPanel, checkPanel);
      body.appendChild(wrap);

      block.appendChild(body);
      container.appendChild(block);
    });

    document.querySelectorAll('.credits').forEach(c => c.remove());
    if (K.credits) {
      const cr = el('div', 'credits', '<strong>Kredit gambar (Wikimedia Commons):</strong>');
      const ul = el('ul');
      K.credits.forEach(c => ul.appendChild(el('li', '', esc(c))));
      cr.appendChild(ul);
      container.parentNode.appendChild(cr);
    }
  }

  function renderHints(item) {
    const h = item.hints;
    const list = arr => '<ul>' + arr.map(x => `<li>${esc(typeof x === 'string' ? x : x.t)}</li>`).join('') + '</ul>';
    return `<h4>1️⃣ Pendahuluan</h4>${list(h.pendahuluan)}<h4>2️⃣ Isi-isi penting</h4>${list(h.isi)}` +
      `<h4>3️⃣ Penutup</h4>${list(h.penutup)}` + (h.kosaKata ? `<h4>⭐ Frasa menarik</h4>${list(h.kosaKata)}` : '');
  }
  function renderModel(item) {
    const wc = item.model.reduce((s, p) => s + wordCount(p), 0);
    return `<div class="m-title">${esc(item.title)}</div>` + item.model.map(p => `<p>${esc(p)}</p>`).join('') + `<div class="wc">(${wc} patah perkataan)</div>`;
  }

  function actId(ki, ai) { return 'k' + ki + 'a' + ai; }

  function renderActivity(item, ki, a, ai) {
    const id = actId(ki, ai);
    const div = el('div', 'act');
    div.id = id;
    const tags = { pilih: '🎯 Pilih isi yang berkaitan', susun: '🔢 Susun ayat', bina: '🧱 Bina ayat', kosong: '🔗 Penanda wacana' };
    div.appendChild(el('span', 'act-tag', a.tag || tags[a.type]));
    div.appendChild(el('div', 'act-prompt', a.prompt));

    if (a.type === 'pilih') {
      const ul = el('ul', 'pick-list');
      state.acts[id] = { sel: new Set() };
      shuffle(a.items.map((_, i) => i)).forEach(i => {
        const li = el('li', 'pick-item', esc(a.items[i].t));
        li.dataset.i = i;
        li.onclick = () => {
          if (state.graded) return;
          const s = state.acts[id].sel;
          if (s.has(i)) s.delete(i); else s.add(i);
          li.classList.toggle('selected');
        };
        ul.appendChild(li);
      });
      div.appendChild(ul);
    } else if (a.type === 'susun' || a.type === 'bina') {
      const pieces = a.type === 'susun' ? a.sentences : a.sentence.split(' ');
      const cls = a.type === 'susun' ? ' sentences' : '';
      div.appendChild(el('span', 'pool-label', a.type === 'susun' ? 'Klik ayat mengikut urutan yang betul:' : 'Klik perkataan mengikut urutan:'));
      const pool = el('div', 'pool' + cls);
      div.appendChild(pool);
      div.appendChild(el('span', 'pool-label', 'Jawapan kamu (klik untuk keluarkan semula):'));
      const ans = el('div', 'answer-area' + cls);
      div.appendChild(ans);
      state.acts[id] = { order: [] };
      const renumber = () => ans.querySelectorAll('.tile').forEach((t, n) => { t.dataset.n = n + 1; });
      shuffle(pieces.map((_, i) => i)).forEach(i => {
        const tile = el('button', 'tile', esc(pieces[i]));
        tile.type = 'button';
        tile.dataset.i = i;
        tile.onclick = () => {
          if (state.graded) return;
          const st = state.acts[id];
          if (tile.parentNode === pool) { ans.appendChild(tile); st.order.push(i); }
          else { pool.appendChild(tile); st.order.splice(st.order.indexOf(i), 1); }
          renumber();
        };
        pool.appendChild(tile);
      });
    } else if (a.type === 'kosong') {
      const bank = el('div', 'chip-bank');
      shuffle(a.chips).forEach(c => {
        const chip = el('button', 'chip', esc(c));
        chip.type = 'button';
        chip.onclick = () => placeChip(id, c);
        bank.appendChild(chip);
      });
      div.appendChild(bank);
      const slots = (a.template.match(/\{\d+\}/g) || []).length;
      state.acts[id] = { fill: new Array(slots).fill(null) };
      const tpl = el('div', 'template');
      tpl.innerHTML = esc(a.template).replace(/\{(\d+)\}/g, (_, n) => `<button type="button" class="blank empty" data-act="${id}" data-slot="${n}">______</button>`);
      tpl.querySelectorAll('.blank').forEach(b => {
        b.onclick = () => {
          if (state.graded) return;
          if (activeBlank === b && b.classList.contains('filled')) { setBlank(b, null); return; }
          setActive(b);
        };
      });
      div.appendChild(tpl);
    }
    div.appendChild(el('div', 'feedback'));
    return div;
  }

  function setActive(b) { if (activeBlank) activeBlank.classList.remove('active'); activeBlank = b; if (b) b.classList.add('active'); }
  function setBlank(b, w) {
    state.acts[b.dataset.act].fill[+b.dataset.slot] = w;
    b.textContent = w || '______';
    b.classList.toggle('filled', !!w);
    b.classList.toggle('empty', !w);
  }
  function placeChip(id, w) {
    if (state.graded) return;
    const blanks = Array.from(document.querySelectorAll(`#${id} .blank`));
    const target = (activeBlank && blanks.includes(activeBlank)) ? activeBlank : blanks.find(b => b.classList.contains('empty'));
    if (!target) return;
    setBlank(target, w);
    const idx = blanks.indexOf(target);
    setActive(blanks.slice(idx + 1).concat(blanks.slice(0, idx)).find(b => b.classList.contains('empty')) || null);
  }

  // ---------------- grading ----------------
  function gradeActivity(item, ki, a, ai) {
    const id = actId(ki, ai);
    const div = document.getElementById(id);
    const fb = div.querySelector('.feedback');
    const st = state.acts[id];
    let got = 0, total = 1, html;

    if (a.type === 'pilih') {
      total = a.items.length;
      const traps = [];
      div.querySelectorAll('.pick-item').forEach(li => {
        const i = +li.dataset.i, it = a.items[i], sel = st.sel.has(i);
        const right = sel === !!it.ok;
        if (right) got++;
        li.classList.remove('selected');
        li.classList.add(right ? 'good' : 'bad');
        if (!it.ok) {
          li.innerHTML = esc(it.t) + `<span class="why">✘ Tidak berkaitan: ${esc(it.why || 'bukan tentang tajuk')}</span>`;
          if (sel) traps.push(it.t);
        } else if (!sel) {
          li.innerHTML = esc(it.t) + '<span class="why">✔ Ini isi yang berkaitan, patut dipilih.</span>';
        }
      });
      html = got === total ? '<strong>Hebat!</strong> Kamu berjaya mengenal pasti semua isi yang berkaitan.'
        : `<strong>${got} / ${total} betul.</strong> ` + (traps.length ? 'Kamu terpilih ayat perangkap yang TIDAK berkaitan dengan tajuk. Jangan masukkan ayat seperti ini dalam karangan!' : 'Ada isi berkaitan yang tertinggal.');
    } else if (a.type === 'susun' || a.type === 'bina') {
      const pieces = a.type === 'susun' ? a.sentences : a.sentence.split(' ');
      const ord = st.order;
      if (a.type === 'susun') {
        total = pieces.length;
        got = ord.filter((x, i) => x === i).length;
        html = (got === total ? '<strong>Betul!</strong> Urutan tepat.' : `<strong>${got} / ${total} di kedudukan betul.</strong> Urutan yang betul:`) +
          (got === total ? '' : '<ol>' + pieces.map(p => `<li>${esc(p)}</li>`).join('') + '</ol>');
      } else {
        const built = ord.map(i => pieces[i]).join(' ');
        const okList = [a.sentence].concat(a.alt || []);
        got = okList.includes(built) ? 1 : 0;
        html = got ? `<strong>Betul!</strong> ${esc(a.sentence)}` : `<strong>Belum tepat.</strong> Ayat yang betul: <em>${esc(a.sentence)}</em>`;
      }
    } else if (a.type === 'kosong') {
      total = a.accept.length;
      got = st.fill.filter((w, i) => w && a.accept[i].includes(w)).length;
      const correct = esc(a.template).replace(/\{(\d+)\}/g, (_, n) => `<b>${esc(a.accept[+n][0])}</b>`);
      html = got === total ? '<strong>Betul semua!</strong>' : `<strong>${got} / ${total} betul.</strong> Contoh jawapan: ${correct}`;
      if (a.note) html += ' ' + a.note;
    }
    fb.className = 'feedback ' + (got === total ? 'correct-fb' : 'incorrect-fb');
    fb.innerHTML = html;
    fb.style.display = 'block';
    return { got, total };
  }

  function checkEssay(ki, scroll) {
    const item = K.items[ki];
    const text = document.getElementById('essay-' + ki).value;
    const panel = document.getElementById('check-' + ki);
    if (!text.trim()) {
      panel.innerHTML = '<p>Tulis karangan dahulu, kemudian tekan <b>Semak</b>.</p>';
    } else {
      panel.innerHTML = analyse(text, item);
    }
    panel.style.display = 'block';
    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return !!text.trim();
  }

  function gradeAll() {
    state.graded = true;
    setActive(null);
    let got = 0, total = 0, essays = 0;
    K.items.forEach((item, ki) => {
      (item.activities || []).forEach((a, ai) => { const r = gradeActivity(item, ki, a, ai); got += r.got; total += r.total; });
      if (checkEssay(ki, false)) essays++;
    });
    const pct = total ? Math.round(got / total * 100) : 0;
    const msg = pct >= 80 ? 'Hebat! 🌟' : pct >= 60 ? 'Bagus! 💪' : 'Cuba lagi, kamu boleh! 🙂';
    const banner = document.getElementById('scoreBanner');
    banner.innerHTML = `<div class="score-main">Markah latihan susun & klik: ${got} / ${total} (${pct}%) — ${msg}</div>
      <div class="score-note">Karangan bertulis yang disemak: <b>${essays}</b> / ${K.items.length}. Lihat senarai semak di bawah setiap karangan.
      Bandingkan juga dengan <b>Karangan Contoh</b>.</div>`;
    banner.style.display = 'block';
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    if (!confirm('Padam semua jawapan dan karangan, dan mula semula?')) return;
    state.acts = {}; state.graded = false; activeBlank = null;
    document.getElementById('scoreBanner').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('resetBtn').style.display = 'none';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.Karangan = { analyse };

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement.style;
    if (K.theme) root.setProperty('--theme', K.theme);
    if (K.themeDark) root.setProperty('--theme-dark', K.themeDark);
    if (K.themeSoft) root.setProperty('--theme-soft', K.themeSoft);
    renderPetua();
    render();
    document.getElementById('submitBtn').onclick = gradeAll;
    document.getElementById('resetBtn').onclick = reset;
  });
})();
