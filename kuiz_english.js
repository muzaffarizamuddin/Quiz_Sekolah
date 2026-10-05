// Shared engine for Module 7 & 8 (English UASA-style mock papers).
// Each page defines window.PAPER before loading this file:
// { theme, themeDark, themeSoft, parts: [part, ...] }
//   mcq part   – { title, marks, instr, passage?, texts?, questions: [{ n, stim?, q, options, answer, explain, inline? }] }
//   spell part – { type: 'spell', title, marks, instr, questions: [{ n, clue, pattern, answer, alts? }] }
//   write part – { type: 'write', title, marks, kind: 'note'|'email', task (html), minW, maxW,
//                  points: [{ t, k: [...] }], hints: [...], phrases: [...], model }
(function () {
  'use strict';
  const P = window.PAPER;

  // ---------------- helpers ----------------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function wordCount(t) { return (t.match(/[A-Za-z0-9]+(?:[-'.][A-Za-z0-9]+)*/g) || []).length; }

  // ---------------- writing checker ----------------
  const TEXTSPEAK = {
    u: 'you', ur: 'your', pls: 'please', plz: 'please', coz: 'because', cuz: 'because', bcoz: 'because', bcos: 'because',
    gonna: 'going to', wanna: 'want to', im: "I'm", dont: "don't", cant: "can't", wont: "won't", didnt: "didn't",
    doesnt: "doesn't", isnt: "isn't", thx: 'thanks', tq: 'thank you', btw: 'by the way', n: 'and', r: 'are', ya: 'you',
    luv: 'love', gud: 'good', nite: 'night', tmr: 'tomorrow', tmrw: 'tomorrow', bday: 'birthday', b4: 'before', '2day': 'today',
    hv: 'have', wat: 'what', wif: 'with', lol: '(remove)'
  };
  const MALAY = new Set(['dan', 'saya', 'nak', 'tak', 'lah', 'kat', 'pergi', 'dengan', 'ini', 'itu', 'dia', 'kami', 'yang',
    'boleh', 'jumpa', 'esok', 'cikgu', 'kawan', 'tapi', 'sebab', 'terima', 'kasih', 'jom']);
  const MODALS = new Set(['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'do', 'does', 'did', 'to', "don't", "doesn't", "didn't", 'let']);
  const THIRD = { go: 'goes', have: 'has', do: 'does', like: 'likes', want: 'wants', eat: 'eats', play: 'plays', live: 'lives', love: 'loves', need: 'needs', come: 'comes', make: 'makes' };
  const AN_EXCEPT = /^(uniform|university|unicorn|useful|user|usual|usually|one|once|european|unique|union|utensil|unit|u)$/i;
  const A_EXCEPT = /^(hour|hours|honest|honour|heir)$/i;

  function lineIssues(line) {
    const spans = [];
    const t = []; const re = /[A-Za-z0-9]+(?:'[A-Za-z]+)?/g; let m;
    while ((m = re.exec(line))) t.push({ w: m[0], lw: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
    t.forEach((tk, i) => {
      const prev = t[i - 1], next = t[i + 1];
      const add = (s, e, msg) => spans.push({ s, e, msg });
      if (tk.w === 'i') add(tk.s, tk.e, 'Always write "I" as a capital letter.');
      else if (Object.prototype.hasOwnProperty.call(TEXTSPEAK, tk.lw) && !(tk.lw === 'n' && /\d/.test(line))) add(tk.s, tk.e, `Short form / text speak. Write: "${TEXTSPEAK[tk.lw]}"`);
      else if (MALAY.has(tk.lw)) add(tk.s, tk.e, 'Malay word. Use English.');
      else if (tk.lw === 'very' && next && next.lw === 'like') add(tk.s, next.e, 'Say "really like" or "like ... very much".');
      else if (tk.lw === 'more' && next && /^(better|faster|bigger|taller|smaller|nicer|happier|easier|cheaper)$/.test(next.lw)) add(tk.s, next.e, `Do not use "more" with "${next.lw}". Just write "${next.lw}".`);
      else if (/^(he|she|it)$/.test(tk.lw) && next && THIRD[next.lw] && !(prev && MODALS.has(prev.lw))) add(tk.s, next.e, `With he/she/it, add -s: "${tk.w} ${THIRD[next.lw]}" (or use past tense).`);
      else if (/^(i|you|we|they)$/.test(tk.lw) && next && /^(has|goes|does|wants|likes|plays|eats)$/.test(next.lw)) add(tk.s, next.e, `With ${tk.w}, do not add -s: "${tk.w} ${next.lw.replace(/^has$/, 'have').replace(/^goes$/, 'go').replace(/^does$/, 'do').replace(/s$/, '')}"`);
      else if (tk.lw === 'a' && next && /^[aeiou]/i.test(next.w) && !AN_EXCEPT.test(next.w)) add(tk.s, next.e, `Use "an" before a vowel sound: "an ${next.w}"`);
      else if (tk.lw === 'an' && next && /^[b-df-hj-np-tv-z]/i.test(next.w) && !A_EXCEPT.test(next.w)) add(tk.s, next.e, `Use "a" before a consonant sound: "a ${next.w}"`);
      else if (next && tk.lw === next.lw && tk.lw.length > 1 && /\s+/.test(line.slice(tk.e, next.s)) && line.slice(tk.e, next.s).trim() === '') add(tk.s, next.e, 'The same word is written twice.');
    });
    // capital letter at the start of each sentence
    const sre = /(^|[.!?]\s+)([a-z])/g; let sm;
    while ((sm = sre.exec(line))) {
      const pos = sm.index + sm[1].length;
      if (/\b(a\.m|p\.m|e\.g|i\.e|mr|mrs|ms|dr|etc|no)\.\s+$/i.test(line.slice(0, pos))) continue;
      if (!spans.some(x => x.s <= pos && pos < x.e)) spans.push({ s: pos, e: pos + 1, msg: 'Start a sentence with a capital letter.' });
    }
    return spans.sort((a, b) => a.s - b.s);
  }

  function analyseWriting(part, text, fields) {
    const lines = text.replace(/\r/g, '').split('\n');
    const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
    const lower = text.toLowerCase();
    const notes = [];
    const view = lines.map(line => {
      const spans = lineIssues(line);
      let html = '', pos = 0;
      spans.forEach(sp => {
        if (sp.s < pos) return;
        html += esc(line.slice(pos, sp.s)) + `<mark class="err" title="${esc(sp.msg)}">${esc(line.slice(sp.s, sp.e))}</mark>`;
        notes.push(`<b>${esc(line.slice(sp.s, sp.e))}</b> — ${esc(sp.msg)}`);
        pos = sp.e;
      });
      html += esc(line.slice(pos));
      const words = wordCount(line);
      if (words > 4 && !/[.!?]["')]?\s*$/.test(line.trim())) {
        html += '<mark class="err" title="End the sentence with a full stop.">&nbsp;.&nbsp;</mark>';
        notes.push('A sentence is missing a full stop (.) at the end of the line.');
      }
      return html;
    }).join('\n');

    // Greeting / closing lines are not counted, like in the answer key.
    const wc = wordCount(text);
    const greet = nonEmpty.length ? /^(dear|hi|hello|hey)\b/i.test(nonEmpty[0]) || /^[A-Z][a-zA-Z ]{0,25},$/.test(nonEmpty[0]) : false;
    const lastTwo = nonEmpty.slice(-2).join(' ').toLowerCase();
    const closing = nonEmpty.length > 1 && (/(your (loving )?(cousin|friend|daughter|son|pen ?pal|student)|love,|regards|yours|from,|thank you|see you|take care|bye)/.test(lastTwo) || wordCount(nonEmpty[nonEmpty.length - 1]) <= 3);
    let fieldsOK = true;
    if (part.kind === 'email') fieldsOK = !!(fields && /@/.test(fields.to) && /@/.test(fields.from));
    const hits = part.points.map(p => ({ t: p.t, ok: p.k.some(k => lower.includes(k.toLowerCase())) }));
    const got = hits.filter(h => h.ok).length;

    const inRange = wc >= part.minW && wc <= part.maxW;
    const near = wc >= part.minW - 8 && wc <= part.maxW + 10;
    const lengthScore = inRange ? 1 : near ? 0.5 : 0;
    const formatScore = ((greet ? 1 : 0) + (closing ? 1 : 0) + (fieldsOK ? 1 : 0)) / 3;
    const langScore = Math.max(0, 1 - notes.length * 0.12);
    const est = wc < 5 ? 0 : Math.round(part.marks * (0.5 * (got / hits.length) + 0.15 * lengthScore + 0.15 * formatScore + 0.2 * langScore));

    const li = (ok, s) => `<li>${ok ? '✅' : '⚠️'} ${s}</li>`;
    let html = '<h4>📋 Checklist</h4><ul class="check-list">' +
      li(inRange, `Length: <b>${wc}</b> words (target ${part.minW}–${part.maxW}).` + (wc > part.maxW ? ' Too long. Remove extra sentences.' : wc < part.minW ? ' Too short. Add more details.' : '')) +
      (part.kind === 'email' ? li(fieldsOK, fieldsOK ? 'To / From email addresses are filled in.' : 'Fill in the <b>To</b> and <b>From</b> email addresses (with @).') : '') +
      li(greet, greet ? 'Greeting at the top (e.g. "Dear Tommy,").' : 'Start with a greeting, e.g. <b>"Dear ' + esc(part.to || 'Tommy') + ',"</b> on the first line.') +
      li(closing, closing ? 'Closing / your name at the end.' : 'End with a closing, e.g. <b>"Your cousin,"</b> and your name on the next line.') +
      li(got === hits.length, `Content points covered: <b>${got} / ${hits.length}</b>`) +
      li(notes.length === 0, `Language mistakes found: <b>${notes.length}</b>`) +
      '</ul><ul class="check-list" style="margin-left:18px">' + hits.map(h => `<li>${h.ok ? '✅' : '⬜'} ${esc(h.t)}</li>`).join('') + '</ul>' +
      `<h4>🖍️ Your writing (hover / tap the red marks)</h4><div class="essay-view">${view}</div>`;
    if (notes.length) html += '<h4>❌ Mistakes</h4><ul class="issue-list">' + notes.map(n => `<li>${n}</li>`).join('') + '</ul>';
    html += '<p style="font-size:0.8em;color:#64748b">Note: the automatic check only finds common mistakes. It is not a full grammar check, so please ask a parent to read it too.</p>';
    return { html, est };
  }

  // ---------------- rendering ----------------
  const state = { sel: {}, graded: false, writeEst: {}, writeOverride: {} };

  function render() {
    const c = document.getElementById('paper');
    c.innerHTML = '';
    P.parts.forEach((part, pi) => {
      const box = el('div', 'part');
      box.appendChild(el('div', 'part-header', `<span>${esc(part.title)}</span><span class="pm">${part.marks} marks</span>`));
      const body = el('div', 'part-body');
      if (part.instr) body.appendChild(el('p', 'instr', part.instr));
      if (part.passage) body.appendChild(el('div', 'passage', part.passage));
      if (part.texts) {
        const g = el('div', 'texts-grid');
        part.texts.forEach(t => g.appendChild(el('div', 'text-card', `<h4><span class="lbl">${t.label}</span>${esc(t.title)}</h4>${t.html}`)));
        body.appendChild(g);
      }
      if (part.type === 'spell') part.questions.forEach(q => body.appendChild(renderSpell(q)));
      else if (part.type === 'write') body.appendChild(renderWrite(part, pi));
      else part.questions.forEach(q => body.appendChild(renderMcq(q)));
      box.appendChild(body);
      c.appendChild(box);
    });
  }

  function renderMcq(q) {
    const d = el('div', 'q');
    d.id = 'q' + q.n;
    if (q.stim) d.appendChild(el('div', 'stim', q.stim));
    d.appendChild(el('div', 'q-text', `${q.n}. ${q.q}`));
    const ul = el('ul', 'opts' + (q.inline ? ' inline' : ''));
    q.options.forEach((o, oi) => {
      const li = el('li', 'opt', `${'ABC'[oi]}. ${esc(o)}`);
      li.onclick = () => {
        if (state.graded) return;
        ul.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
        li.classList.add('selected');
        state.sel[q.n] = oi;
      };
      ul.appendChild(li);
    });
    d.appendChild(ul);
    d.appendChild(el('div', 'feedback'));
    return d;
  }

  function renderSpell(q) {
    const d = el('div', 'q');
    d.id = 'q' + q.n;
    d.appendChild(el('div', 'q-text', `${q.n}. ${esc(q.clue)}`));
    const row = el('div', 'spell-row');
    row.appendChild(el('span', 'spell-pattern', esc(q.pattern)));
    const inp = el('input', 'spell-input');
    inp.id = 'sp' + q.n; inp.autocomplete = 'off'; inp.spellcheck = false; inp.placeholder = 'type the word';
    row.appendChild(inp);
    d.appendChild(row);
    d.appendChild(el('div', 'feedback'));
    return d;
  }

  function renderWrite(part, pi) {
    const w = el('div');
    w.appendChild(el('div', 'task', part.task));
    if (part.kind === 'email') {
      const f = el('div', 'email-fields', `<label>To:</label><input id="to${pi}" placeholder="${esc((part.to || 'name').toLowerCase())}@gmail.com"><label>From:</label><input id="from${pi}" placeholder="yourname@gmail.com">`);
      w.appendChild(f);
    }
    const ta = el('textarea', 'essay');
    ta.id = 'w' + pi;
    ta.spellcheck = false;
    ta.placeholder = part.kind === 'email' ? `Dear ${part.to || '...'},\n\n...\n\nYour cousin,\n(your name)` : `${part.to || '...'},\n\n...\n\n(your name)`;
    const counter = el('div', 'counter');
    const upd = () => {
      const wc = wordCount(ta.value);
      counter.innerHTML = `Words: <b class="${wc >= part.minW && wc <= part.maxW ? 'ok' : 'bad'}">${wc}</b> (target ${part.minW}–${part.maxW})`;
    };
    ta.addEventListener('input', upd); upd();
    w.append(ta, counter);

    const hint = el('div', 'panel hint-panel', '<h4>💡 What to write</h4><ul>' + part.hints.map(h => `<li>${esc(h)}</li>`).join('') + '</ul>' +
      (part.phrases ? '<h4>⭐ Useful phrases</h4><ul>' + part.phrases.map(h => `<li>${esc(h)}</li>`).join('') + '</ul>' : ''));
    const model = el('div', 'panel model-panel', `<b>Model answer (${wordCount(part.model.replace(/^To:.*$|^From:.*$/gm, ''))} words):</b>\n\n${esc(part.model)}`);
    const check = el('div', 'panel check-panel');
    check.id = 'chk' + pi;
    const tog = p => () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; };
    const row = el('div', 'btn-row');
    const b1 = el('button', 'btn btn-hint', '💡 Hints'); b1.type = 'button'; b1.onclick = tog(hint);
    const b2 = el('button', 'btn btn-model', '📖 Show model answer'); b2.type = 'button'; b2.onclick = tog(model);
    const b3 = el('button', 'btn btn-check', '✅ Check my writing'); b3.type = 'button'; b3.onclick = () => { checkWriting(pi); check.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    row.append(b1, b2, b3);
    w.append(row, hint, model, check);
    return w;
  }

  function checkWriting(pi) {
    const part = P.parts[pi];
    const text = document.getElementById('w' + pi).value;
    const fields = part.kind === 'email' ? { to: document.getElementById('to' + pi).value, from: document.getElementById('from' + pi).value } : null;
    const panel = document.getElementById('chk' + pi);
    panel.style.display = 'block';
    if (!text.trim()) { panel.innerHTML = '<p>Write your answer first, then press <b>Check</b>.</p>'; state.writeEst[pi] = 0; return; }
    const r = analyseWriting(part, text, fields);
    state.writeEst[pi] = r.est;
    const cur = state.writeOverride[pi] !== undefined ? state.writeOverride[pi] : r.est;
    panel.innerHTML = r.html + `<div class="est">🧮 Estimated mark: <b>${r.est} / ${part.marks}</b> (estimate only). Parent's mark:
      <input type="number" min="0" max="${part.marks}" value="${cur}" id="ov${pi}"> / ${part.marks}</div>`;
    document.getElementById('ov' + pi).addEventListener('input', e => {
      const v = Math.max(0, Math.min(part.marks, parseInt(e.target.value, 10) || 0));
      state.writeOverride[pi] = v;
      if (state.graded) updateBanner();
    });
  }

  // ---------------- grading ----------------
  let objGot = 0, objTotal = 0;
  function grade() {
    state.graded = true;
    document.getElementById('paper').classList.add('locked');
    objGot = 0; objTotal = 0;
    P.parts.forEach((part, pi) => {
      if (part.type === 'write') { checkWriting(pi); return; }
      part.questions.forEach(q => {
        objTotal++;
        const d = document.getElementById('q' + q.n);
        const fb = d.querySelector('.feedback');
        let ok, html;
        if (part.type === 'spell') {
          const inp = document.getElementById('sp' + q.n);
          inp.readOnly = true;
          const v = inp.value.trim().toLowerCase();
          ok = [q.answer].concat(q.alts || []).some(a => a.toLowerCase() === v);
          html = ok ? `<b>Correct!</b> ${esc(q.answer)}` : `<b>${v ? 'Not quite.' : 'Not answered.'}</b> The answer is <b>${esc(q.answer)}</b>.`;
        } else {
          const items = d.querySelectorAll('.opt');
          const s = state.sel[q.n];
          items[q.answer].classList.add('is-correct');
          ok = s === q.answer;
          if (s !== undefined && !ok) items[s].classList.add('is-wrong');
          html = ok ? `<b>Correct!</b> ${q.explain || ''}` : `<b>${s === undefined ? 'Not answered.' : 'Not quite.'}</b> Answer: <b>${'ABC'[q.answer]}</b>. ${q.explain || ''}`;
        }
        if (ok) objGot++;
        fb.className = 'feedback ' + (ok ? 'correct-fb' : 'incorrect-fb');
        fb.innerHTML = html;
        fb.style.display = 'block';
      });
    });
    updateBanner();
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateBanner() {
    let wGot = 0, wTotal = 0;
    const rows = [];
    let partObj = {};
    P.parts.forEach((part, pi) => {
      if (part.type === 'write') {
        const m = state.writeOverride[pi] !== undefined ? state.writeOverride[pi] : (state.writeEst[pi] || 0);
        wGot += m; wTotal += part.marks;
        rows.push(`<tr><td>${esc(part.title)}</td><td><b>${m} / ${part.marks}</b> (estimate)</td></tr>`);
      } else {
        const got = part.questions.filter(q => {
          const fb = document.querySelector(`#q${q.n} .feedback`);
          return fb && fb.classList.contains('correct-fb');
        }).length;
        rows.push(`<tr><td>${esc(part.title)}</td><td><b>${got} / ${part.questions.length}</b></td></tr>`);
      }
    });
    const total = objGot + wGot, max = objTotal + wTotal;
    const pct = Math.round(total / max * 100);
    const msg = pct >= 80 ? 'Excellent! 🌟' : pct >= 60 ? 'Good job! 💪' : 'Keep practising! 🙂';
    const b = document.getElementById('scoreBanner');
    b.innerHTML = `<div class="score-main">Total: ${total} / ${max} (${pct}%) — ${msg}</div><table class="score-table">${rows.join('')}</table>
      <div class="score-note">Parts 1–5 are marked automatically. Parts 6–7 are estimates. Parents can change the mark in the box under each writing task.</div>`;
    b.style.display = 'block';
  }

  function reset() {
    if (!confirm('Clear all answers and start again?')) return;
    state.sel = {}; state.graded = false; state.writeEst = {}; state.writeOverride = {};
    document.getElementById('paper').classList.remove('locked');
    document.getElementById('scoreBanner').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('resetBtn').style.display = 'none';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.EnglishPaper = { analyseWriting };

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement.style;
    if (P.theme) root.setProperty('--theme', P.theme);
    if (P.themeDark) root.setProperty('--theme-dark', P.themeDark);
    if (P.themeSoft) root.setProperty('--theme-soft', P.themeSoft);
    render();
    document.getElementById('submitBtn').onclick = grade;
    document.getElementById('resetBtn').onclick = reset;
  });
})();
