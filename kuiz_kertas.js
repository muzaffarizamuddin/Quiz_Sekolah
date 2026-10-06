// Shared engine for exam-style practice papers (Modules 10–13: Matematik & Sains). Uses kuiz_english.css.
// The page defines window.KERTAS = { theme, themeDark, themeSoft, sections: [{ title, instr, items: [...] }] }.
// Item types:
//   mcq    – { n, q, stim?, options, answer, explain? }                          1 mark
//   num    – { n, q, stim?, marks, fields: [{ pre?, suf?, ans }], steps? }       full marks only when every box is right
//   text   – { n, q, stim?, marks, ans: [accepted strings], steps? }             e.g. a number written in words
//   short  – { n, q, stim?, marks, rubric: [[keys]], model }                     1 mark per idea group found; parent can override
//   choose – { n, q, rows: [{ pre, opts: [a, b], ans, post? }] }                 "gariskan" – 1 mark per row
//   tick   – { n, q, marks, rows: [{ t, ok }] }                                  ✓ / ✗
//   select – { n, q, marks, choices: [...], rows: [{ t, ans }] }                 matching with a dropdown
//   bar    – { n, q, marks, cats, vals, maxY }                                   click to build a bar chart
//   group  – { n, q, stim?, sub: [items] }                                        a themed question with parts a), b), ...
// Keys in a short-answer rubric may join words with '+' (all must appear), e.g. 'barat+timur'.
(function () {
  'use strict';
  const K = window.KERTAS;

  const css = `
    .sub { border-left: 3px solid #cbd5e1; padding: 6px 0 6px 12px; margin: 10px 0; }
    .sub-label { font-weight: 700; color: var(--theme-dark); margin-right: 6px; }
    .q-marks { font-weight: 400; color: #64748b; font-size: 0.85em; }
    .num-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; }
    .num-in { width: 110px; padding: 6px 8px; font-size: 1.05em; border: 1px solid #94a3b8; border-radius: 6px; font-family: inherit; }
    .num-in.wide { width: 380px; max-width: 100%; }
    .num-in.ok { border-color: #10b981; background: #ecfdf5; }
    .num-in.bad { border-color: #ef4444; background: #fef2f2; }
    .work { width: 100%; box-sizing: border-box; min-height: 44px; margin-top: 6px; padding: 6px 8px; font-family: Consolas, monospace; font-size: 0.9em; border: 1px dashed #94a3b8; border-radius: 6px; background: #fafafa; resize: vertical; }
    .steps { margin-top: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-family: Consolas, monospace; font-size: 0.9em; white-space: pre-wrap; color: #0f172a; }
    .choose-row { margin: 6px 0; line-height: 2.2; }
    .pick { display: inline-block; padding: 2px 10px; margin: 0 2px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; background: #f8fafc; font-family: inherit; font-size: 0.95em; }
    .pick.selected { background: #2563eb; color: #fff; border-color: #1d4ed8; }
    .pick.is-correct { background: #d1fae5; border-color: #10b981; color: #065f46; font-weight: 700; text-decoration: underline; }
    .pick.is-wrong { background: #fee2e2; border-color: #ef4444; color: #991b1b; text-decoration: line-through; }
    .sel { padding: 5px 8px; font-size: 0.95em; border: 1px solid #94a3b8; border-radius: 6px; font-family: inherit; }
    .bar-grid { border-collapse: collapse; margin: 8px 0; }
    .bar-grid td { width: 64px; height: 20px; border: 1px solid #e2e8f0; cursor: pointer; padding: 0; }
    .bar-grid td.y { width: 28px; border: none; text-align: right; padding-right: 6px; font-size: 0.8em; color: #475569; cursor: default; }
    .bar-grid td.on { background: #60a5fa; }
    .bar-grid td.on.good { background: #34d399; }
    .bar-grid td.on.wrong { background: #f87171; }
    .bar-grid tr.x td { border: none; text-align: center; font-size: 0.82em; font-weight: 600; cursor: default; height: auto; padding-top: 4px; }
    .ov { width: 52px; padding: 2px 4px; }
    .stim-table { border-collapse: collapse; margin: 6px 0; }
    .stim-table th, .stim-table td { border: 1px solid #94a3b8; padding: 4px 12px; text-align: center; }
    .stim-table th { background: #e2e8f0; }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------------- helpers ----------------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function normText(s) { return String(s).toLowerCase().replace(/[-–,.]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function toNum(s) {
    const t = String(s).toLowerCase().replace(/rm|%|\s|,/g, '');
    return t === '' || isNaN(t) ? NaN : parseFloat(t);
  }
  function sameAnswer(input, ans) {
    if (typeof ans === 'number') { const v = toNum(input); return !isNaN(v) && Math.abs(v - ans) < 0.001; }
    return normText(input) === normText(ans);
  }
  function keyHit(text, key) {
    const t = normText(text);
    return key.split('+').every(part => t.includes(normText(part)));
  }

  // ---------------- state ----------------
  const st = { mcq: {}, pick: {}, tick: {}, bar: {}, graded: false, scores: {}, ov: {} };
  let uid = 0;
  const all = []; // flat list of { item, id, sectionIndex }

  // ---------------- rendering ----------------
  function render() {
    const c = document.getElementById('paper');
    c.innerHTML = '';
    all.length = 0; uid = 0;
    K.sections.forEach((sec, si) => {
      const box = el('div', 'part');
      const marks = sec.items.reduce((s, it) => s + itemMarks(it), 0);
      box.appendChild(el('div', 'part-header', `<span>${sec.title}</span><span class="pm">${marks} markah</span>`));
      const body = el('div', 'part-body');
      if (sec.instr) body.appendChild(el('p', 'instr', sec.instr));
      sec.items.forEach(it => body.appendChild(renderItem(it, si, null)));
      box.appendChild(body);
      c.appendChild(box);
    });
  }

  function itemMarks(it) {
    if (it.type === 'group') return it.sub.reduce((s, x) => s + itemMarks(x), 0);
    if (it.type === 'mcq') return 1;
    if (it.type === 'choose') return it.rows.length;
    return it.marks;
  }

  function renderItem(it, si, label) {
    const id = 'it' + (uid++);
    const d = el('div', label ? 'sub' : 'q');
    d.id = id;
    const head = label ? `<span class="sub-label">${label}</span>` : `${it.n}. `;
    if (it.type === 'group') {
      if (it.q) d.appendChild(el('div', 'q-text', head + it.q));
      if (it.stim) d.appendChild(el('div', 'stim', it.stim));
      it.sub.forEach((s, k) => d.appendChild(renderItem(s, si, s.label || String.fromCharCode(97 + k) + ')')));
      return d;
    }
    all.push({ it, id, si });
    if (it.stim && label) d.appendChild(el('div', 'stim', it.stim));
    d.appendChild(el('div', 'q-text', `${head}${it.q} <span class="q-marks">[${itemMarks(it)} markah]</span>`));
    if (it.stim && !label) d.appendChild(el('div', 'stim', it.stim));

    if (it.type === 'mcq') {
      const ul = el('ul', 'opts');
      it.options.forEach((o, oi) => {
        const li = el('li', 'opt', `${'ABCD'[oi]}. ${o}`);
        li.onclick = () => {
          if (st.graded) return;
          ul.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
          li.classList.add('selected');
          st.mcq[id] = oi;
        };
        ul.appendChild(li);
      });
      d.appendChild(ul);
    } else if (it.type === 'num' || it.type === 'text') {
      const row = el('div', 'num-row');
      const fields = it.type === 'text' ? [{}] : it.fields;
      fields.forEach((f, fi) => {
        if (f.pre) row.appendChild(el('span', '', f.pre));
        const inp = el('input', 'num-in' + (it.type === 'text' ? ' wide' : ''));
        inp.id = `${id}_${fi}`;
        inp.autocomplete = 'off';
        inp.inputMode = it.type === 'num' ? 'decimal' : 'text';
        row.appendChild(inp);
        if (f.suf) row.appendChild(el('span', '', f.suf));
      });
      d.appendChild(row);
      if (it.type === 'num' && itemMarks(it) >= 2) {
        const w = el('textarea', 'work');
        w.placeholder = 'Ruang pengiraan (tunjukkan kerja di sini)...';
        d.appendChild(w);
      }
    } else if (it.type === 'short') {
      const ta = el('textarea', 'essay');
      ta.style.minHeight = '56px';
      ta.id = id + '_in';
      ta.placeholder = 'Tulis jawapan kamu...';
      d.appendChild(ta);
    } else if (it.type === 'choose') {
      it.rows.forEach((r, ri) => {
        const row = el('div', 'choose-row', esc(r.pre || '') + ' ( ');
        r.opts.forEach((o, oi) => {
          const b = el('button', 'pick', esc(o));
          b.type = 'button';
          b.onclick = () => {
            if (st.graded) return;
            row.querySelectorAll('.pick').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
            st.pick[`${id}_${ri}`] = oi;
          };
          row.appendChild(b);
          if (oi === 0) row.appendChild(document.createTextNode(' / '));
        });
        row.appendChild(document.createTextNode(' ) ' + (r.post || '')));
        d.appendChild(row);
      });
    } else if (it.type === 'tick') {
      const tbl = el('table', 'data');
      tbl.style.margin = '0';
      tbl.innerHTML = '<tr><th style="text-align:left">Pernyataan</th><th>( ✓ / ✗ )</th></tr>';
      it.rows.forEach((r, ri) => {
        const tr = el('tr');
        const t1 = el('td', '', esc(r.t)); t1.style.textAlign = 'left';
        const t2 = el('td');
        ['✓', '✗'].forEach((sym, k) => {
          const b = el('button', 'pick', sym);
          b.type = 'button';
          b.onclick = () => {
            if (st.graded) return;
            t2.querySelectorAll('.pick').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
            st.tick[`${id}_${ri}`] = k === 0;
          };
          t2.appendChild(b);
        });
        tr.append(t1, t2);
        tbl.appendChild(tr);
      });
      d.appendChild(tbl);
    } else if (it.type === 'select') {
      const tbl = el('table', 'data');
      tbl.style.margin = '0';
      it.rows.forEach((r, ri) => {
        const tr = el('tr');
        const t1 = el('td', '', r.t); t1.style.textAlign = 'left';
        const t2 = el('td');
        const s = el('select', 'sel', '<option value="">-- pilih --</option>' + it.choices.map((c, ci) => `<option value="${ci}">${esc(c)}</option>`).join(''));
        s.id = `${id}_${ri}`;
        t2.appendChild(s);
        tr.append(t1, t2);
        tbl.appendChild(tr);
      });
      d.appendChild(tbl);
    } else if (it.type === 'bar') {
      st.bar[id] = it.cats.map(() => 0);
      const tbl = el('table', 'bar-grid');
      for (let y = it.maxY; y >= 1; y--) {
        const tr = el('tr');
        tr.appendChild(el('td', 'y', String(y)));
        it.cats.forEach((_, ci) => {
          const td = el('td');
          td.dataset.y = y; td.dataset.c = ci;
          td.onclick = () => {
            if (st.graded) return;
            st.bar[id][ci] = st.bar[id][ci] === y ? y - 1 : y;
            paintBar(tbl, id);
          };
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      }
      const xr = el('tr', 'x');
      xr.appendChild(el('td', 'y', '0'));
      it.cats.forEach(cn => xr.appendChild(el('td', '', esc(cn))));
      tbl.appendChild(xr);
      d.appendChild(el('div', 'instr', 'Klik pada petak untuk menentukan ketinggian setiap palang. Klik petak teratas sekali lagi untuk merendahkannya.'));
      d.appendChild(tbl);
    }
    d.appendChild(el('div', 'feedback'));
    return d;
  }

  function paintBar(tbl, id) {
    tbl.querySelectorAll('td[data-c]').forEach(td => td.classList.toggle('on', +td.dataset.y <= st.bar[id][+td.dataset.c]));
  }

  // ---------------- grading ----------------
  function gradeItem(entry) {
    const { it, id } = entry;
    const d = document.getElementById(id);
    const fb = d.querySelector(':scope > .feedback');
    const max = itemMarks(it);
    let got = 0, html = '';

    if (it.type === 'mcq') {
      const items = d.querySelectorAll('.opt'), s = st.mcq[id];
      items[it.answer].classList.add('is-correct');
      if (s !== undefined && s !== it.answer) items[s].classList.add('is-wrong');
      got = s === it.answer ? 1 : 0;
      html = got ? `<b>Betul!</b> ${it.explain || ''}` : `<b>${s === undefined ? 'Tidak dijawab.' : 'Kurang tepat.'}</b> Jawapan: <b>${'ABCD'[it.answer]}</b>. ${it.explain || ''}`;
    } else if (it.type === 'num' || it.type === 'text') {
      const fields = it.type === 'text' ? [{ ans: it.ans }] : it.fields;
      let right = 0;
      fields.forEach((f, fi) => {
        const inp = document.getElementById(`${id}_${fi}`);
        inp.readOnly = true;
        const ok = Array.isArray(f.ans) ? f.ans.some(a => sameAnswer(inp.value, a)) : sameAnswer(inp.value, f.ans);
        inp.classList.add(ok ? 'ok' : 'bad');
        if (ok) right++;
      });
      got = right === fields.length ? max : 0;
      const ansTxt = fields.map(f => `${f.pre || ''}<b>${esc(Array.isArray(f.ans) ? f.ans[0] : f.ans)}</b>${f.suf || ''}`).join(' ');
      html = (got ? '<b>Betul!</b> ' : `<b>Belum tepat.</b> Jawapan: ${ansTxt} `) + (it.steps ? `<div class="steps">${esc(it.steps)}</div>` : '');
    } else if (it.type === 'short') {
      const v = document.getElementById(id + '_in');
      v.readOnly = true;
      got = Math.min(max, it.rubric.filter(g => g.some(k => keyHit(v.value, k))).length);
      html = `<b>${got} / ${max} markah</b> (disemak automatik). Contoh jawapan: <i>${esc(it.model)}</i>`;
    } else if (it.type === 'choose') {
      it.rows.forEach((r, ri) => {
        const btns = d.querySelectorAll('.choose-row')[ri].querySelectorAll('.pick');
        const s = st.pick[`${id}_${ri}`];
        btns[r.ans].classList.add('is-correct');
        if (s !== undefined && s !== r.ans) btns[s].classList.add('is-wrong');
        if (s === r.ans) got++;
      });
      html = `<b>${got} / ${max} markah.</b> Jawapan betul digariskan.`;
    } else if (it.type === 'tick') {
      const right = it.rows.filter((r, ri) => st.tick[`${id}_${ri}`] === r.ok).length;
      got = Math.floor(right * max / it.rows.length);
      html = `<b>${got} / ${max} markah.</b><br>` + it.rows.map(r => `${esc(r.t)} <b>${r.ok ? '✓' : '✗'}</b>`).join('<br>');
    } else if (it.type === 'select') {
      let right = 0;
      it.rows.forEach((r, ri) => {
        const s = document.getElementById(`${id}_${ri}`);
        s.disabled = true;
        const ok = s.value !== '' && +s.value === r.ans;
        s.style.borderColor = ok ? '#10b981' : '#ef4444';
        if (ok) right++;
      });
      got = Math.floor(right * max / it.rows.length);
      html = `<b>${got} / ${max} markah.</b><br>` + it.rows.map(r => `${r.t} → <b>${esc(it.choices[r.ans])}</b>`).join('<br>');
    } else if (it.type === 'bar') {
      const v = st.bar[id];
      const right = it.vals.filter((x, i) => v[i] === x).length;
      got = Math.floor(right * max / it.vals.length);
      d.querySelectorAll('td[data-c]').forEach(td => {
        const ok = v[+td.dataset.c] === it.vals[+td.dataset.c];
        td.classList.add(ok ? 'good' : 'wrong');
      });
      html = `<b>${got} / ${max} markah.</b> Ketinggian betul: ` + it.cats.map((c, i) => `${esc(c)} = <b>${it.vals[i]}</b>`).join(', ');
    }

    st.scores[id] = got;
    fb.className = 'feedback ' + (got === max ? 'correct-fb' : 'incorrect-fb');
    if (got > 0 && got < max) fb.style.cssText = 'background:#fef3c7;border:1px solid #f59e0b;color:#78350f';
    fb.innerHTML = html;
    if (it.type === 'short') {
      const ov = el('div', '', `Markah ibu/ayah: <input type="number" class="ov" min="0" max="${max}" value="${got}"> / ${max}`);
      ov.style.marginTop = '6px';
      ov.querySelector('input').addEventListener('input', e => {
        st.ov[id] = Math.max(0, Math.min(max, parseInt(e.target.value, 10) || 0));
        banner();
      });
      fb.appendChild(ov);
    }
    fb.style.display = 'block';
  }

  function grade() {
    st.graded = true;
    document.getElementById('paper').classList.add('locked');
    all.forEach(gradeItem);
    banner();
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function banner() {
    let total = 0, max = 0;
    const rows = K.sections.map((sec, si) => {
      let g = 0, m = 0;
      all.filter(e => e.si === si).forEach(e => {
        g += st.ov[e.id] !== undefined ? st.ov[e.id] : (st.scores[e.id] || 0);
        m += itemMarks(e.it);
      });
      total += g; max += m;
      return `<tr><td>${sec.title}</td><td><b>${g} / ${m}</b></td></tr>`;
    }).join('');
    const pct = Math.round(total / max * 100);
    const msg = pct >= 80 ? 'Cemerlang! 🌟' : pct >= 60 ? 'Bagus! 💪' : 'Teruskan berusaha! 🙂';
    const b = document.getElementById('scoreBanner');
    b.innerHTML = `<div class="score-main">Jumlah: ${total} / ${max} (${pct}%) — ${msg}</div><table class="score-table">${rows}</table>
      <div class="score-note">Jawapan bertulis disemak menggunakan kata kunci. Ibu/ayah boleh menukar markah di bawah setiap jawapan bertulis.</div>`;
    b.style.display = 'block';
  }

  function reset() {
    if (!confirm('Padam semua jawapan dan mula semula?')) return;
    st.mcq = {}; st.pick = {}; st.tick = {}; st.bar = {}; st.graded = false; st.scores = {}; st.ov = {};
    document.getElementById('paper').classList.remove('locked');
    document.getElementById('scoreBanner').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('resetBtn').style.display = 'none';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.Kertas = { sameAnswer, keyHit, itemMarks };

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement.style;
    if (K.theme) root.setProperty('--theme', K.theme);
    if (K.themeDark) root.setProperty('--theme-dark', K.themeDark);
    if (K.themeSoft) root.setProperty('--theme-soft', K.themeSoft);
    render();
    document.getElementById('submitBtn').onclick = grade;
    document.getElementById('resetBtn').onclick = reset;
  });
})();
