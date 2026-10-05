// Engine for the BM PSA-style practice paper (Module 09). Uses kuiz_english.css for layout.
// The page defines window.KERTAS = { theme, themeDark, themeSoft, sections: [...] } before loading this file.
//   mcq        – { type: 'mcq', title, marks, instr, passage?, questions: [{ n, q, options (4), answer, explain }] }
//   pemahaman  – { type: 'pemahaman', title, marks, instr, passage, items: [
//                   { kind: 'short', n, q, marks, rubric: [[syn...], ...] (one mark per group found), model },
//                   { kind: 'tick', n, q, marks, rows: [{ t, ok }] } ] }
//   tulis      – { type: 'tulis', subtype: 'pendapat'|'perenggan'|'karangan', title, marks, task, image?, graphic?,
//                  minW?, maxW, need, points: [{ t, k }], topicWords, hints, model }
(function () {
  'use strict';
  const KS = window.KERTAS;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function wordCount(t) { return (t.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length; }
  function norm(s) { return (s || '').toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' '); }
  function has(text, keys) { const n = norm(text); return keys.some(k => n.includes(norm(k))); }

  // ---------------- Malay language checker (same rules as the karangan modules) ----------------
  const SLANG = {
    x: 'tidak', tak: 'tidak', tk: 'tidak', takde: 'tiada', xde: 'tiada', nak: 'hendak / mahu', dah: 'sudah / telah',
    je: 'sahaja', jer: 'sahaja', kat: 'di / kepada', pastu: 'selepas itu', dgn: 'dengan', yg: 'yang', sy: 'saya',
    utk: 'untuk', tu: 'itu', ni: 'ini', mcm: 'seperti', macam: 'seperti', sbb: 'kerana / sebab', korang: 'kamu semua',
    kitorang: 'kami', diorang: 'mereka', dlm: 'dalam', pd: 'pada', tgk: 'melihat', tengok: 'melihat', sikit: 'sedikit',
    byk: 'banyak', lg: 'lagi', mmg: 'memang', sgt: 'sangat', org: 'orang', pon: 'pun', tapi: 'tetapi', tp: 'tetapi',
    jgn: 'jangan', blh: 'boleh', kena: 'perlu / mesti', best: 'seronok', syok: 'seronok', ok: 'baiklah', kalo: 'kalau', abis: 'habis', marah2: 'marah-marah'
  };
  const ENGLISH = new Set(['and', 'so', 'then', 'because', 'but', 'the', 'very', 'happy', 'sad', 'school', 'teacher', 'friend', 'sorry', 'game', 'fun', 'my', 'we']);
  const PLACES = ['rumah', 'sekolah', 'kelas', 'kantin', 'padang', 'taman', 'pantai', 'kampung', 'tandas', 'dalam', 'luar', 'atas',
    'bawah', 'tepi', 'hadapan', 'depan', 'belakang', 'sana', 'sini', 'situ', 'pasar', 'kawasan', 'surau', 'masjid', 'hospital',
    'perpustakaan', 'sungai', 'bandar', 'dewan', 'kebun', 'tengah', 'mana', 'tempat', 'bilik', 'dapur', 'kedai', 'pejabat'];
  const JOINED = new RegExp('^(di|ke)(' + PLACES.join('|') + ')$');
  const PASSIVE_EXCEPT = new Set(['kanan', 'pekan', 'ikan', 'bukan', 'akan', 'jalan', 'taman']);
  const ISI_PW = ['pertama', 'selain itu', 'seterusnya', 'di samping itu', 'akhir sekali', 'kemudian', 'selepas itu', 'tambahan pula', 'antara', 'kedua'];
  const PENUTUP_PW = ['kesimpulannya', 'akhirnya', 'oleh itu', 'oleh sebab itu', 'marilah'];

  function sentenceSpans(s) {
    const t = []; const re = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g; let m;
    while ((m = re.exec(s))) t.push({ w: m[0], lw: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
    const out = [];
    t.forEach((tk, i) => {
      const nx = t[i + 1];
      if (Object.prototype.hasOwnProperty.call(SLANG, tk.lw)) out.push({ s: tk.s, e: tk.e, msg: `Bahasa pasar/singkatan. Gunakan: "${SLANG[tk.lw]}"` });
      else if (ENGLISH.has(tk.lw)) out.push({ s: tk.s, e: tk.e, msg: 'Perkataan bahasa Inggeris. Gunakan Bahasa Melayu.' });
      else if (JOINED.test(tk.lw)) { const j = tk.lw.match(JOINED); out.push({ s: tk.s, e: tk.e, msg: `Jarakkan: "${j[1]} ${j[2]}"` }); }
      else if (/^[a-z]+2$/i.test(tk.w)) { const b = tk.w.slice(0, -1); out.push({ s: tk.s, e: tk.e, msg: `Kata ganda ditulis penuh: "${b}-${b}"` }); }
      else if (tk.lw === 'di' && nx && /kan$|kannya$/.test(nx.lw) && !PASSIVE_EXCEPT.has(nx.lw) && nx.lw.length > 5) out.push({ s: tk.s, e: nx.e, msg: `Kata kerja pasif dirapatkan: "di${nx.lw}"` });
      else if (nx && tk.lw === nx.lw && tk.lw.length > 1) out.push({ s: tk.s, e: nx.e, msg: `Kata ganda perlu sempang: "${tk.lw}-${tk.lw}"` });
    });
    if (t[0] && /^[a-z]/.test(t[0].w)) out.push({ s: t[0].s, e: t[0].e, msg: 'Ayat mesti bermula dengan huruf besar.' });
    return out.sort((a, b) => a.s - b.s);
  }

  function checkLanguage(text, topicWords) {
    const paras = text.replace(/\r/g, '').split(/\n+/).map(p => p.trim()).filter(Boolean);
    const errs = [], off = [];
    const view = paras.map((p, pi) => {
      const sentences = p.split(/(?<=\.["'”’]?)\s+|(?<=[!?]["'”’]?)\s+(?=[A-Z])/).filter(Boolean);
      let html = sentences.map(s => {
        const spans = sentenceSpans(s);
        let h = '', pos = 0;
        spans.forEach(sp => {
          if (sp.s < pos) return;
          h += esc(s.slice(pos, sp.s)) + `<mark class="err" title="${esc(sp.msg)}">${esc(s.slice(sp.s, sp.e))}</mark>`;
          errs.push(`<b>${esc(s.slice(sp.s, sp.e))}</b> — ${esc(sp.msg)}`);
          pos = sp.e;
        });
        h += esc(s.slice(pos));
        if (topicWords && wordCount(s) >= 4 && !topicWords.some(k => s.toLowerCase().includes(k))) {
          off.push(esc(s.trim()));
          h = `<mark style="background:#fef08a" title="Adakah ayat ini berkaitan dengan soalan?">${h}</mark>`;
        }
        return h + ' ';
      }).join('');
      if (!/[.!?]$/.test(p)) { html += '<mark class="err" title="Tiada noktah.">&nbsp;?&nbsp;</mark>'; errs.push(`Perenggan ${pi + 1} tiada noktah (.) di hujung.`); }
      return `<p style="margin:0 0 8px 0">${html}</p>`;
    }).join('');
    return { paras, errs, off, view };
  }

  // ---------------- writing estimate ----------------
  function analyseWriting(sec, text) {
    const wc = wordCount(text);
    const lang = checkLanguage(text, sec.topicWords);
    const lower = text.toLowerCase();
    const hits = sec.points.map(p => ({ t: p.t, ok: has(text, p.k) }));
    const got = hits.filter(h => h.ok).length;
    const content = Math.min(1, got / sec.need);
    const langScore = Math.max(0, 1 - lang.errs.length * 0.12 - lang.off.length * 0.1);
    const tooLong = wc > sec.maxW, tooShort = sec.minW ? wc < sec.minW : wc < 8;
    const checks = [];
    let fmt = 1;
    const li = (ok, s) => { checks.push(`<li>${ok ? '✅' : '⚠️'} ${s}</li>`); return ok; };

    li(!tooLong && !tooShort, `Panjang: <b>${wc}</b> patah perkataan (${sec.minW ? `${sec.minW}–${sec.maxW}` : `tidak lebih daripada ${sec.maxW}`}).` +
      (tooLong ? ' <b>Terlalu panjang. Buang ayat yang tidak perlu.</b>' : tooShort ? ' Terlalu pendek.' : ''));
    if (sec.subtype === 'perenggan') {
      const one = li(lang.paras.length === 1, lang.paras.length === 1 ? 'Ditulis dalam SATU perenggan.' : `Ada <b>${lang.paras.length}</b> perenggan. Soalan minta <b>satu perenggan</b> sahaja.`);
      fmt = ((one ? 1 : 0) + (tooLong ? 0 : 1)) / 2;
    } else if (sec.subtype === 'karangan') {
      const pw = ISI_PW.filter(w => lower.includes(w));
      const a = li(lang.paras.length >= 3, `Bilangan perenggan: <b>${lang.paras.length}</b> (pendahuluan + isi + penutup).`);
      const b = li(pw.length >= 2, pw.length ? `Penanda wacana: <b>${pw.join(', ')}</b>.` : 'Gunakan penanda wacana: <b>Pertama, Selain itu, Seterusnya, Akhir sekali</b>.');
      const c = li(PENUTUP_PW.some(w => (lang.paras[lang.paras.length - 1] || '').toLowerCase().includes(w)), 'Perenggan penutup bermula dengan <b>Kesimpulannya / Oleh itu / Marilah</b>.');
      fmt = ((a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0) + (!tooLong && !tooShort ? 1 : 0)) / 4;
    } else {
      fmt = tooLong ? 0 : 1;
    }
    li(got >= sec.need, `Isi / idea yang ditulis: <b>${got}</b> (perlu sekurang-kurangnya ${sec.need}).`);
    li(lang.errs.length === 0, `Kesalahan bahasa dikesan: <b>${lang.errs.length}</b>`);
    if (sec.topicWords) li(lang.off.length === 0, `Ayat yang mungkin terkeluar tajuk: <b>${lang.off.length}</b>`);

    const w = sec.subtype === 'pendapat' ? [0.6, 0.3, 0.1] : sec.subtype === 'perenggan' ? [0.6, 0.3, 0.1] : [0.5, 0.3, 0.2];
    const est = wc < 5 ? 0 : Math.round(sec.marks * (w[0] * content + w[1] * langScore + w[2] * fmt));

    let html = '<h4>📋 Senarai semak</h4><ul class="check-list">' + checks.join('') + '</ul>' +
      '<ul class="check-list" style="margin-left:18px">' + hits.map(h => `<li>${h.ok ? '✅' : '⬜'} ${esc(h.t)}</li>`).join('') + '</ul>' +
      `<h4>🖍️ Jawapan kamu (sentuh tanda berwarna untuk penjelasan)</h4><div class="essay-view" style="white-space:normal">${lang.view}</div>`;
    if (lang.errs.length) html += '<h4>❌ Kesalahan bahasa</h4><ul class="issue-list">' + lang.errs.map(e => `<li>${e}</li>`).join('') + '</ul>';
    if (lang.off.length) html += '<h4>🤔 Ayat ini berkaitan dengan soalan?</h4><ul class="issue-list">' + lang.off.map(e => `<li>${e}</li>`).join('') + '</ul>';
    html += '<p style="font-size:0.8em;color:#64748b">Nota: Semakan automatik hanya mengesan kesalahan biasa. Ia bukan semakan tatabahasa penuh, jadi minta ibu/ayah baca juga.</p>';
    return { html, est };
  }

  // ---------------- rendering ----------------
  const state = { sel: {}, tick: {}, graded: false, est: {}, ov: {} };

  function render() {
    const c = document.getElementById('paper');
    c.innerHTML = '';
    KS.sections.forEach((sec, si) => {
      const box = el('div', 'part');
      box.appendChild(el('div', 'part-header', `<span>${sec.title}</span><span class="pm">${sec.marks} markah</span>`));
      const body = el('div', 'part-body');
      if (sec.instr) body.appendChild(el('p', 'instr', sec.instr));
      if (sec.type === 'mcq') {
        sec.questions.forEach(q => {
          if (q.passageBefore) body.appendChild(el('div', 'passage', q.passageBefore));
          body.appendChild(renderMcq(q));
        });
      } else if (sec.type === 'pemahaman') {
        body.appendChild(el('div', 'passage', sec.passage));
        sec.items.forEach(it => body.appendChild(it.kind === 'tick' ? renderTick(si, it) : renderShort(si, it)));
      } else {
        body.appendChild(renderTulis(sec, si));
      }
      box.appendChild(body);
      c.appendChild(box);
    });
  }

  function renderMcq(q) {
    const d = el('div', 'q');
    d.id = 'q' + q.n;
    if (q.stim) d.appendChild(el('div', 'stim', q.stim));
    d.appendChild(el('div', 'q-text', `${q.n}. ${q.q}`));
    const ul = el('ul', 'opts');
    q.options.forEach((o, oi) => {
      const li = el('li', 'opt', `${'ABCD'[oi]} &nbsp; ${esc(o)}`);
      li.onclick = () => {
        if (state.graded) return;
        ul.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
        li.classList.add('selected');
        state.sel[q.n] = oi;
      };
      ul.appendChild(li);
    });
    d.append(ul, el('div', 'feedback'));
    return d;
  }

  function renderShort(si, it) {
    const d = el('div', 'q');
    d.id = `s${si}_${it.n}`;
    d.appendChild(el('div', 'q-text', `${it.n}. ${it.q} <span style="font-weight:400;color:#64748b">[${it.marks} markah]</span>`));
    const ta = el('textarea', 'essay');
    ta.style.minHeight = '70px';
    ta.id = `in${si}_${it.n}`;
    ta.placeholder = 'Tulis jawapan dalam ayat lengkap...';
    d.append(ta, el('div', 'feedback'));
    return d;
  }

  function renderTick(si, it) {
    const d = el('div', 'q');
    d.id = `s${si}_${it.n}`;
    d.appendChild(el('div', 'q-text', `${it.n}. ${it.q} <span style="font-weight:400;color:#64748b">[${it.marks} markah]</span>`));
    const tbl = el('table', 'data');
    tbl.style.margin = '0';
    tbl.innerHTML = '<tr><th style="text-align:left">Pernyataan</th><th>Jawapan</th></tr>';
    it.rows.forEach((r, ri) => {
      const tr = el('tr');
      tr.appendChild(el('td', '', esc(r.t))).style.textAlign = 'left';
      const td = el('td');
      ['✓', '✗'].forEach((sym, k) => {
        const b = el('button', 'opt', sym);
        b.type = 'button';
        b.style.cssText = 'display:inline-block;margin:0 3px;padding:4px 12px;min-width:0';
        b.onclick = () => {
          if (state.graded) return;
          td.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          state.tick[`${si}_${it.n}_${ri}`] = k === 0;
        };
        td.appendChild(b);
      });
      tr.appendChild(td);
      tbl.appendChild(tr);
    });
    d.append(tbl, el('div', 'feedback'));
    return d;
  }

  function renderTulis(sec, si) {
    const w = el('div');
    w.appendChild(el('div', 'task', sec.task));
    if (sec.image) w.appendChild(el('figure', '', `<img src="${sec.image.src}" alt="" style="max-width:100%;max-height:260px;border-radius:8px;display:block;margin:0 auto"><figcaption style="text-align:center;font-size:0.85em;color:#475569">${esc(sec.image.cap || '')}</figcaption>`));
    if (sec.graphic) w.appendChild(el('div', 'svg-wrap', sec.graphic));
    const ta = el('textarea', 'essay');
    ta.id = 'w' + si;
    ta.spellcheck = false;
    ta.placeholder = sec.subtype === 'karangan' ? 'Perenggan 1: Pendahuluan...\nPerenggan 2: Pertama, ...\nPerenggan 3: Selain itu, ...\nPerenggan 4: Seterusnya, ...\nPerenggan 5: Kesimpulannya, ...'
      : sec.subtype === 'perenggan' ? 'Tulis dalam SATU perenggan sahaja. Contoh permulaan: "Antara cara untuk ... ialah ..."' : 'Saya akan ...';
    const counter = el('div', 'counter');
    const upd = () => {
      const wc = wordCount(ta.value);
      const ok = wc <= sec.maxW && (!sec.minW || wc >= sec.minW);
      counter.innerHTML = `Patah perkataan: <b class="${ok ? 'ok' : 'bad'}">${wc}</b> (${sec.minW ? `${sec.minW}–${sec.maxW}` : `maksimum ${sec.maxW}`})`;
    };
    ta.addEventListener('input', upd); upd();
    w.append(ta, counter);
    const hint = el('div', 'panel hint-panel', '<h4>💡 Isi yang boleh ditulis</h4><ul>' + sec.hints.map(h => `<li>${esc(h)}</li>`).join('') + '</ul>');
    const model = el('div', 'panel model-panel', `<b>Contoh jawapan (${wordCount(sec.model)} patah perkataan):</b>\n\n${esc(sec.model)}`);
    const chk = el('div', 'panel check-panel');
    chk.id = 'chk' + si;
    const tog = p => () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; };
    const row = el('div', 'btn-row');
    const b1 = el('button', 'btn btn-hint', '💡 Petunjuk'); b1.type = 'button'; b1.onclick = tog(hint);
    const b2 = el('button', 'btn btn-model', '📖 Tunjuk Contoh Jawapan'); b2.type = 'button'; b2.onclick = tog(model);
    const b3 = el('button', 'btn btn-check', '✅ Semak jawapan saya'); b3.type = 'button'; b3.onclick = () => { checkTulis(si); chk.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    row.append(b1, b2, b3);
    w.append(row, hint, model, chk);
    return w;
  }

  function checkTulis(si) {
    const sec = KS.sections[si];
    const text = document.getElementById('w' + si).value;
    const panel = document.getElementById('chk' + si);
    panel.style.display = 'block';
    if (!text.trim()) { panel.innerHTML = '<p>Tulis jawapan dahulu, kemudian tekan <b>Semak</b>.</p>'; state.est[si] = 0; return; }
    const r = analyseWriting(sec, text);
    state.est[si] = r.est;
    const cur = state.ov[si] !== undefined ? state.ov[si] : r.est;
    panel.innerHTML = r.html + `<div class="est">🧮 Anggaran markah: <b>${r.est} / ${sec.marks}</b> (anggaran sahaja). Markah ibu/ayah:
      <input type="number" min="0" max="${sec.marks}" value="${cur}" id="ov${si}"> / ${sec.marks}</div>`;
    document.getElementById('ov' + si).addEventListener('input', e => {
      state.ov[si] = Math.max(0, Math.min(sec.marks, parseInt(e.target.value, 10) || 0));
      if (state.graded) banner();
    });
  }

  // ---------------- grading ----------------
  const secScore = {};
  function setFb(d, ok, partial, html) {
    const fb = d.querySelector('.feedback');
    fb.className = 'feedback ' + (ok ? 'correct-fb' : 'incorrect-fb');
    if (partial) fb.style.cssText = 'display:block;background:#fef3c7;border:1px solid #f59e0b;color:#78350f';
    fb.innerHTML = html;
    fb.style.display = 'block';
  }

  function grade() {
    state.graded = true;
    document.getElementById('paper').classList.add('locked');
    KS.sections.forEach((sec, si) => {
      let got = 0;
      if (sec.type === 'mcq') {
        sec.questions.forEach(q => {
          const d = document.getElementById('q' + q.n), items = d.querySelectorAll('.opt'), s = state.sel[q.n];
          items[q.answer].classList.add('is-correct');
          const ok = s === q.answer;
          if (s !== undefined && !ok) items[s].classList.add('is-wrong');
          if (ok) got++;
          setFb(d, ok, false, ok ? `<b>Betul!</b> ${q.explain || ''}` : `<b>${s === undefined ? 'Tidak dijawab.' : 'Kurang tepat.'}</b> Jawapan: <b>${'ABCD'[q.answer]}</b>. ${q.explain || ''}`);
        });
      } else if (sec.type === 'pemahaman') {
        sec.items.forEach(it => {
          const d = document.getElementById(`s${si}_${it.n}`);
          let m = 0;
          if (it.kind === 'short') {
            const v = document.getElementById(`in${si}_${it.n}`);
            v.readOnly = true;
            m = Math.min(it.marks, it.rubric.filter(g => has(v.value, g)).length);
            setFb(d, m === it.marks, m > 0 && m < it.marks, `<b>${m} / ${it.marks} markah</b> (disemak automatik). Contoh jawapan: <i>${esc(it.model)}</i>`);
          } else {
            const right = it.rows.filter((r, ri) => state.tick[`${si}_${it.n}_${ri}`] === r.ok).length;
            m = right === it.rows.length ? it.marks : right === it.rows.length - 1 ? it.marks - 1 : 0;
            const ans = it.rows.map(r => `${esc(r.t)} <b>${r.ok ? '✓' : '✗'}</b>`).join('<br>');
            setFb(d, m === it.marks, m > 0 && m < it.marks, `<b>${m} / ${it.marks} markah.</b><br>${ans}`);
          }
          got += m;
        });
      } else {
        checkTulis(si);
        return;
      }
      secScore[si] = got;
    });
    banner();
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function banner() {
    let total = 0, max = 0;
    const rows = KS.sections.map((sec, si) => {
      const m = sec.type === 'tulis' ? (state.ov[si] !== undefined ? state.ov[si] : (state.est[si] || 0)) : (secScore[si] || 0);
      total += m; max += sec.marks;
      return `<tr><td>${sec.title}</td><td><b>${m} / ${sec.marks}</b>${sec.type === 'tulis' ? ' (anggaran)' : ''}</td></tr>`;
    }).join('');
    const pct = Math.round(total / max * 100);
    const msg = pct >= 80 ? 'Cemerlang! 🌟' : pct >= 60 ? 'Bagus! 💪' : 'Teruskan berusaha! 🙂';
    const b = document.getElementById('scoreBanner');
    b.innerHTML = `<div class="score-main">Jumlah: ${total} / ${max} (${pct}%) — ${msg}</div><table class="score-table">${rows}</table>
      <div class="score-note">Bahagian A disemak automatik. Bahagian B (jawapan bertulis), C dan D ialah anggaran. Ibu/ayah boleh menukar markah dalam kotak di bawah setiap soalan penulisan.</div>`;
    b.style.display = 'block';
  }

  function reset() {
    if (!confirm('Padam semua jawapan dan mula semula?')) return;
    state.sel = {}; state.tick = {}; state.graded = false; state.est = {}; state.ov = {};
    document.getElementById('paper').classList.remove('locked');
    document.getElementById('scoreBanner').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('resetBtn').style.display = 'none';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.KertasBM = { analyseWriting, has };

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement.style;
    if (KS.theme) root.setProperty('--theme', KS.theme);
    if (KS.themeDark) root.setProperty('--theme-dark', KS.themeDark);
    if (KS.themeSoft) root.setProperty('--theme-soft', KS.themeSoft);
    render();
    document.getElementById('submitBtn').onclick = grade;
    document.getElementById('resetBtn').onclick = reset;
  });
})();
