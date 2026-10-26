'use strict';
/* ================= ТЕЛЕФОН КОМАНДЫ ================= */
const P = { code: null, myTeam: null, lobby: null, pub: null, you: null, tab: 'torgi', pickSlot: null, results: null, benchFallback: null };

/* индикатор связи */
function updateConn(on) { const d = $('#connDot'); if (d) d.classList.toggle('on', on); }
socket.on('connect', () => updateConn(true));
socket.on('disconnect', () => {
  updateConn(false);
  if (ROLE === 'player') toast('Нет связи с сервером — переподключаемся…', 'err');
});

/* Выход игрока: работает через делегирование, т.к. кнопка появляется динамически */
document.addEventListener('click', e => {
  if (e.target.closest('#btnLeave')) {
    if (confirm('Выйти из игры? Вернуться можно будет с главного меню.')) {
      const s = getSession(); if (s) setSession({ ...s, left: true });
      location.reload();
    }
  }
});

function playerWire() {
  $('#btnToJoin').onclick = () => { showScr('scr-join'); };
  $('#joinBack').onclick = () => showScr('scr-menu');
  $('#btnFind').onclick = probeRoom;
  $('#joinCodeIn').addEventListener('keydown', e => { if (e.key === 'Enter') probeRoom(); });
}
function probeRoom() {
  const code = $('#joinCodeIn').value.toUpperCase().trim();
  if (code.length < 4) return toast('Введите код из 4 символов', 'err');
  socket.emit('player:probe', { code }, r => {
    if (!r.ok) return toast(r.err, 'err');
    P.code = code;
    $('#joinCodeEcho').textContent = code;
    renderJoinTeams(r);
  });
}
function renderJoinTeams(r) {
  $('#joinTeams').innerHTML = r.teams.map(t => `
    <div class="join-team" style="--tc:${t.color}">
      <div><b>${t.name}</b><small>${t.players.length ? t.players.join(' • ') : 'пока пусто'} • ${t.players.length}/2</small></div>
      <button class="btn btn-sm" data-join="${t.id}" ${t.players.length >= 2 ? 'disabled' : ''}>${t.players.length >= 2 ? 'Занято' : 'Вступить'}</button>
    </div>`).join('');
  $$('#joinTeams [data-join]').forEach(b => b.onclick = () => doJoin({ joinTeam: b.dataset.join }));
  $('#btnCreateTeam').onclick = () => doJoin({ createTeam: $('#newTeamName').value });
  $('#joinStep2').classList.remove('hidden');
}
function doJoin(extra) {
  const name = $('#joinName').value.trim();
  if (!name) return toast('Введите ваше имя', 'err');
  socket.emit('player:join', { code: P.code, name, ...extra }, r => {
    if (!r.ok) return toast(r.err, 'err');
    ROLE = 'player';
    P.myTeam = r.team;
    setSession({ code: P.code, pid: r.pid });
    Sound.play('win');
  });
}

socket.on('room:lobby', d => {
  if (ROLE !== 'player') return;
  P.lobby = d; P.pub = null; P.results = null;
  showScr('scr-phone'); renderPhone();
});
socket.on('room:public', d => {
  if (ROLE !== 'player') return;
  P.pub = d;
  if (d.phase === 'results' && !P.results) P.waitBench = true;
  showScr('scr-phone'); renderPhone();
});
socket.on('you:state', d => {
  if (ROLE !== 'player') return;
  P.you = d; renderPhone();
});
socket.on('you:toast', d => toast(d.msg, d.kind));
socket.on('bench:data', () => { if (ROLE === 'player') P.waitBench = true; });
socket.on('bench:done', d => {
  if (ROLE !== 'player') return;
  P.results = d.data; P.waitBench = false;
  renderPhone();
  const me = d.data.find(x => x.teamId === (P.myTeam && P.myTeam.id));
  if (me && d.data.every(x => x.score <= me.score) && me.score > 0 && navigator.vibrate) navigator.vibrate([120, 60, 120]);
});
socket.on('sfx:bid', () => Sound.play('tick'));
/* страховка, если ведущий не досмотрел кинематограф */
setInterval(() => {
  if (ROLE === 'player' && P.waitBench) {
    P.benchFallback = (P.benchFallback || 0) + 1;
    if (P.benchFallback > 9) { P.waitBench = false; P.results = null; renderPhone(); }
  }
}, 5000);

/* ---------- рендер ---------- */
function setPhoneHtml(root, html) { root.innerHTML = html; updateConn(socket.connected); }
function renderPhone() {
  const root = $('#phoneBody');
  if (ROLE !== 'player') return;
  const phase = P.pub ? P.pub.phase : 'lobby';
  if (phase === 'lobby') { setPhoneHtml(root, phoneLobbyHtml()); return; }
  if (phase === 'results') { setPhoneHtml(root, P.results ? phoneResultsHtml() : phoneWaitHtml()); return; }
  if (!P.you) { setPhoneHtml(root, '<div class="ph-note">Загрузка…</div>'); return; }
  setPhoneHtml(root, appShell());
  renderTab();
  $$('.ph-tabs button').forEach(b => b.onclick = () => {
    P.tab = b.dataset.tab; P.pickSlot = null;
    Sound.play('click'); renderPhone();
  });
}
function phoneLobbyHtml() {
  const l = P.lobby || { code: P.code, teams: [] };
  const mine = l.teams.find(t => P.myTeam && t.id === P.myTeam.id);
  return `<div class="ph-shell"><div class="ph-top" style="--tc:${P.myTeam ? P.myTeam.color : '#888'}">
      <span class="conn-dot" id="connDot"></span>
      <span class="ph-code">${l.code}</span><b>${P.myTeam ? P.myTeam.name : ''}</b>
    </div>
    <div class="ph-body">
      <div class="wait-card">
        <div class="wait-dots"><span></span><span></span><span></span></div>
        <h3>Ждём, пока ведущий начнёт игру</h3>
        ${mine ? `<p>Ваша команда: <b style="color:${mine.color}">${mine.name}</b><br>${mine.players.join(' • ')}</p>` : ''}
        <p class="dim">Подключается: ${l.teams.reduce((s, t) => s + t.players.length, 0)} игроков в ${l.teams.length} командах</p>
        <button class="btn btn-ghost" id="btnLeave">Выйти</button>
      </div>
    </div></div>`;
}
function phoneWaitHtml() {
  return `<div class="ph-shell"><div class="ph-body">
    <div class="wait-card"><div class="wait-dots"><span></span><span></span><span></span></div>
    <h3>Идёт бенчмарк!</h3><p>Смотрите на большой экран 🖥</p></div></div></div>`;
}
function phoneResultsHtml() {
  const sorted = [...P.results].sort((a, b) => b.score - a.score);
  return `<div class="ph-shell"><div class="ph-top" style="--tc:${P.myTeam.color}"><b>Результаты</b></div>
    <div class="ph-body">${sorted.map((r, i) => `
      <div class="ph-res ${r.teamId === P.myTeam.id ? 'me' : ''}" style="--tc:${r.color}">
        <span class="ph-place">${i + 1}</span><b>${r.name}</b>
        <span class="ph-res-score">${r.boots ? r.score + ' б.' : '0 (сбой)'}</span>
      </div>`).join('')}
    </div></div>`;
}
function appShell() {
  const my = P.pub.teams.find(t => t.id === P.you.teamId);
  return `<div class="ph-shell">
    <div class="ph-top" style="--tc:${my.color}">
      <span class="conn-dot" id="connDot"></span>
      <span class="ph-code">${P.pub.code}</span><b>${my.name}</b>
      <span class="ph-money">${fmt(P.you.money)} ₽</span>
      <button class="ph-leave" id="btnLeave">Выйти</button>
    </div>
    <div class="ph-body" id="phTabBody"></div>
    <nav class="ph-tabs">
      <button data-tab="torgi" class="${P.tab === 'torgi' ? 'on' : ''}"><span class="ti">🔨</span>Торги</button>
      <button data-tab="avito" class="${P.tab === 'avito' ? 'on' : ''}"><span class="ti">📦</span>Авито</button>
      <button data-tab="dns" class="${P.tab === 'dns' ? 'on' : ''}"><span class="ti">🛒</span>ДНС</button>
      <button data-tab="build" class="${P.tab === 'build' ? 'on' : ''}"><span class="ti">🖥</span>Сборка</button>
    </nav>
  </div>`;
}

function renderTab() {
  const body = $('#phTabBody');
  if (P.tab === 'torgi') renderTorgi(body);
  else if (P.tab === 'avito') renderAvito(body);
  else if (P.tab === 'dns') renderDns(body);
  else renderBuild(body);
}

/* ---------- Торги ---------- */
function renderTorgi(body) {
  const p = P.pub;
  if (p.phase === 'closed') { body.innerHTML = '<div class="ph-note">🏁 Торги завершены. Рынок ещё открыт — успейте докупить и собрать ПК!</div>'; return; }
  const res = p.lotResult, lot = p.lot;
  if (res) {
    body.innerHTML = res.type === 'sold' ? `
      <div class="ph-res-card">
        <div class="stamp sm">ПРОДАНО</div>
        <p>за <b>${fmt(res.price)} ₽</b> → <b style="color:${res.teamColor}">${res.teamName}</b></p>
        ${res.items.map(i => `<div class="sold-item">${icon(i.cat)} <b>${i.name}</b>${i.broken ? ' <span class="bad-t">— БРАК!</span>' : ''}</div>`).join('')}
        <p class="dim">Ведущий запускает следующий лот…</p>
      </div>` : '<div class="ph-res-card"><div class="stamp sm grey">ЛОТ СНЯТ</div><p>Ставок не было.</p></div>';
    return;
  }
  if (!lot) { body.innerHTML = '<div class="ph-note">Лоты закончились — ждём ведущего.</div>'; return; }
  const lotInfo = lot.kind === 'mystery' ? `
      <div class="m-ic mystery">${icon('box')}</div>
      <div class="m-body"><div class="m-cat" style="color:var(--copper)">Кот в мешке</div>
        <div class="m-name">Случайный б/у ${CAT_RU_A[lot.catHint]}</div>
        <div class="m-specs"><span class="chip-spec">без проверки</span><span class="chip-spec">старт ${fmt(lot.start)} ₽</span></div>
      </div>`
    : lot.items.map(({ cat, id }) => {
      const s = byId(cat, id);
      return `<div class="m-ic">${icon(cat)}</div>
        <div class="m-body"><div class="m-cat" style="color:var(--gold)">${CAT_RU[cat]} • новое</div>
        <div class="m-name">${s.name}</div>
        <div class="m-specs">${specChips(cat, s).map(c => `<span class="chip-spec">${c}</span>`).join('')}</div>
        ${lot.retail ? `<small class="dim">в ДНС: ${fmt(lot.retail)} ₽</small>` : ''}</div>`;
    }).join('');
  const myAct = lot.acts.find(a => a.teamId === P.you.teamId);
  const isLeader = lot.leaderId === P.you.teamId;
  const amount = lot.leaderId ? lot.price + lot.step : lot.start;
  const can = !isLeader && myAct.status !== 'passed' && P.you.money >= amount;
  body.innerHTML = `
    <div class="mcard lot-card-ph">${lotInfo}</div>
    ${lot.kind === 'bundle' ? '<div class="ph-note warn">📦 Комплект: обе детали продаются одним лотом</div>' : ''}
    <div class="ph-price-row"><span class="ph-price">${fmt(lot.price)} ₽</span>
      <span class="dim">${lot.leaderId ? 'лидер: ' + p.teams.find(t => t.id === lot.leaderId).name : 'ставок нет'}</span></div>
    <div class="ph-acts">${lot.acts.map(a => {
      const t = p.teams.find(x => x.id === a.teamId);
      const st = a.status === 'active' ? (lot.leaderId === a.teamId ? 'Лидер' : 'Ставит') : a.status === 'passed' ? 'Пас' : 'Думает';
      return `<span class="act-chip sm"><span class="act-dot" style="background:${t.color}"></span>${t.name}<em class="st-${a.status}">${st}</em></span>`;
    }).join('')}</div>
    <div class="bid-actions">
      <button class="btn btn-gold act-btn" id="phBid" ${can ? '' : 'disabled'}>
        ${myAct.status === 'passed' ? 'Вы спасовали' : isLeader ? 'Вы лидируете 🏆' : P.you.money < amount ? 'Не хватает денег' : 'Ставка ' + fmt(amount) + ' ₽'}
      </button>
      <button class="btn act-btn-ghost" id="phPass" ${myAct.status === 'passed' ? 'disabled' : ''}>
        ${myAct.status === 'passed' ? 'Пас принят' : 'Пас — выйти из торгов за лот'}
      </button>
    </div>`;
  const bid = $('#phBid'); if (bid) bid.onclick = () => { socket.emit('game:bid'); Sound.play('bid'); };
  const pass = $('#phPass'); if (pass) pass.onclick = () => { socket.emit('game:pass'); Sound.play('click'); };
}

/* ---------- Авито / ДНС ---------- */
function renderAvito(body) {
  body.innerHTML = `<div class="ph-note warn">⚠ ~30% б/у деталей приходят с браком. Проверка — сразу после покупки.</div>` +
    (P.pub.avito.length ? P.pub.avito.map(l => {
      const s = byId(l.cat, l.iid), can = P.you.money >= l.price;
      return `<div class="mcard avito">
        <div class="m-ic">${icon(l.cat)}</div>
        <div class="m-body">
          <div class="m-cat">${CAT_RU[l.cat]} • б/у</div>
          <div class="m-name">${s.name}</div>
          <div class="m-seller">${l.seller.n} ★${l.seller.r} • ${l.cond}</div>
          <div class="m-note">«${l.note}»</div>
        </div>
        <div class="m-side">
          <div class="m-old">${fmt(s.price)} ₽</div>
          <div class="m-price">${fmt(l.price)} ₽</div>
          <button class="btn buy-btn" data-id="${l.id}" ${can ? '' : 'disabled'}>Купить</button>
        </div>
      </div>`;
    }).join('') : '<div class="ph-note">Авито опустел — новые лоты появляются каждые ~15 секунд.</div>');
  $$('.buy-btn').forEach(b => b.onclick = () => buyAvito(b.dataset.id));
}
function buyAvito(id) {
  socket.emit('game:buyAvito', { id }, r => {
    if (!r.ok) return toast(r.err || 'Не получилось', 'err');
    Sound.play('cash');
    scanOverlay(r);
  });
}
function scanOverlay(r) {
  showModal(`<div class="test-box">
    <div class="test-ic">${icon(r.cat)}</div><h3>Проверка на стенде</h3>
    <div class="test-name">${r.name}</div>
    <div class="test-scan"><div class="test-scanline"></div></div>
    <div class="test-status">Гоняем стресс-тест…</div></div>`, true);
  setTimeout(() => {
    const body = $('.modal');
    if (r.broken) {
      Sound.play('fail'); body.classList.add('shake');
      body.innerHTML = `<div class="test-box"><div class="test-ic">${icon(r.cat)}</div>
        <div class="test-stamp bad-stamp">БРАК</div><h3>Не работает!</h3>
        <div class="test-name">${r.name}</div>
        <p class="test-sub">Осталось сдать на запчасти во вкладке «Сборка».</p>
        <button class="btn btn-gold" id="btnTake">Понятно</button></div>`;
    } else {
      Sound.play('win');
      body.innerHTML = `<div class="test-box"><div class="test-ic">${icon(r.cat)}</div>
        <div class="test-stamp good-stamp">РАБОТАЕТ</div><h3>Повезло!</h3>
        <div class="test-name">${r.name}</div>
        <button class="btn btn-gold" id="btnTake">Забрать</button></div>`;
    }
    S_modalLock = false;
    $('#btnTake').onclick = closeModal;
  }, 1700);
}
function renderDns(body) {
  body.innerHTML = `<div class="ph-note">Новое, с гарантией. Продать назад — 70% цены.</div>` +
    CATS.map(cat => `<div class="cat-h">${icon(cat)} ${CAT_RU[cat]}</div>` +
      CAT[cat].map(s => {
        const can = P.you.money >= s.price;
        return `<div class="mcard dns">
          <div class="m-ic">${icon(cat)}</div>
          <div class="m-body"><div class="m-cat">${CAT_RU[cat]} • новое</div>
            <div class="m-name">${s.name}</div>
            <div class="m-specs">${specChips(cat, s).map(c => `<span class="chip-spec">${c}</span>`).join('')}</div></div>
          <div class="m-side"><div class="m-price">${fmt(s.price)} ₽</div>
            <button class="btn buy-btn" data-id="${s.id}" ${can ? '' : 'disabled'}>Купить</button></div>
        </div>`;
      }).join('')).join('');
  $$('.buy-btn').forEach(b => b.onclick = () => {
    socket.emit('game:buyDns', { id: b.dataset.id }, r => {
      if (!r.ok) return toast(r.err || 'Не получилось', 'err');
      Sound.play('cash'); toast('Куплено: ' + r.name, 'ok');
    });
  });
}

/* ---------- Сборка ---------- */
function canInstallLocal(pc, it) {
  if (it.broken) return { ok: false, reason: 'Брак' };
  const s = byId(it.cat, it.id);
  if (it.cat === 'cpu' && pc.mb) { const mb = byId('mb', pc.mb.id); if (s.socket !== mb.socket) return { ok: false, reason: 'Плата ' + mb.socket }; }
  if (it.cat === 'mb') {
    if (pc.cpu) { const c = byId('cpu', pc.cpu.id); if (c.socket !== s.socket) return { ok: false, reason: 'CPU ' + c.socket }; }
    if (pc.ram) { const r = byId('ram', pc.ram.id); if (r.type !== s.ram) return { ok: false, reason: 'RAM ' + r.type }; }
  }
  if (it.cat === 'ram' && pc.mb) { const mb = byId('mb', pc.mb.id); if (s.type !== mb.ram) return { ok: false, reason: 'Плата ' + mb.ram }; }
  return { ok: true };
}
function renderBuild(body) {
  const you = P.you, ev = evaluate(you.pc);
  const scoreBox = `<div class="bench-box ${ev.boots ? 'ok' : 'no'}">
    ${ev.boots
      ? `<div class="bb-score">${ev.score}</div><div class="bb-label">баллов${ev.draw ? `<br><small class="dim">~${ev.draw} W / БП ${ev.psuW} W</small>` : ''}</div>`
      : `<div class="bb-label">⚠ ${ev.reason}</div>`}
    <div class="bb-warns">${ev.warnings.map(w => `<div class="warn-line ${w.t}">${w.t === 'err' ? '✖' : '⚠'} ${w.s}</div>`).join('')}</div>
  </div>`;
  if (P.pickSlot) { renderPicker(body, scoreBox); return; }
  body.innerHTML = scoreBox + `
    <div class="ph-sec">Слоты ПК</div>
    ${SLOTS.map(sl => {
      const it = you.pc[sl.key];
      return `<div class="slot ${it ? 'filled' : ''}" data-slot="${sl.key}">
        <div class="slot-ic">${icon(sl.key)}</div>
        <div class="slot-info"><div class="slot-label">${sl.label}</div>
          <div class="slot-item">${it ? byId(it.cat, it.id).name : '— пусто —'}</div></div>
        <span class="slot-go">▸</span>
      </div>`;
    }).join('')}
    <div class="ph-sec">Инвентарь (${you.inventory.length})</div>
    ${you.inventory.length ? you.inventory.map(it => {
      const s = byId(it.cat, it.id);
      const installed = Object.keys(you.pc).some(k => you.pc[k] && you.pc[k].uid === it.uid);
      const sp = Math.round(it.paid * (it.broken ? .1 : .7) / 10) * 10;
      return `<div class="inv-row">
        <div class="m-ic sm">${icon(it.cat)}</div>
        <div class="inv-info"><b>${s.name}</b>
          <small>${it.source === 'auction' ? 'Аукцион' : it.source === 'dns' ? 'ДНС' : 'Авито'}${it.broken ? ' • <span class="bad-t">БРАК</span>' : ''}${installed ? ' • <span class="ok-t">в ПК</span>' : ''}</small></div>
        <button class="btn btn-sm btn-sell" data-sell="${it.uid}">${fmt(sp)} ₽</button>
      </div>`;
    }).join('') : '<div class="ph-note">Пусто. Загляните на Авито или в ДНС.</div>'}`;
  $$('.slot').forEach(el => el.onclick = () => { P.pickSlot = el.dataset.slot; renderPhone(); Sound.play('click'); });
  $$('[data-sell]').forEach(b => b.onclick = () => socket.emit('game:sell', { uid: b.dataset.sell }));
}
function renderPicker(body, scoreBox) {
  const slot = P.pickSlot, you = P.you;
  const items = you.inventory.filter(it => it.cat === slot);
  body.innerHTML = scoreBox + `
    <button class="btn btn-sm btn-ghost" id="backBtn">← Назад</button>
    <div class="ph-sec">${SLOTS.find(s => s.key === slot).label} — выбор детали</div>
    ${items.length ? items.map(it => {
      const s = byId(it.cat, it.id);
      const inThis = you.pc[slot] && you.pc[slot].uid === it.uid;
      const chk = canInstallLocal(you.pc, it);
      return `<div class="inv-row">
        <div class="m-ic sm">${icon(it.cat)}</div>
        <div class="inv-info"><b>${s.name}</b><small>${specChips(it.cat, s).join(' • ')}${it.broken ? ' • <span class="bad-t">БРАК</span>' : ''}</small></div>
        ${inThis ? '<span class="chip-spec">стоит</span>' : `<button class="btn btn-sm" data-inst="${it.uid}" ${chk.ok ? '' : 'disabled'}>${chk.ok ? 'Ставить' : chk.reason}</button>`}
      </div>`;
    }).join('') : '<div class="ph-note">Нет подходящих деталей в инвентаре.</div>'}
    ${you.pc[slot] ? '<button class="btn btn-ghost act-btn-ghost" id="btnOut">Извлечь текущую деталь</button>' : ''}`;
  $('#backBtn').onclick = () => { P.pickSlot = null; renderPhone(); };
  $$('[data-inst]').forEach(b => b.onclick = () => { socket.emit('game:install', { uid: b.dataset.inst }); P.pickSlot = null; Sound.play('click'); });
  const out = $('#btnOut'); if (out) out.onclick = () => { socket.emit('game:uninstall', { slot }); P.pickSlot = null; };
}

/* ---------- модалка ---------- */
let S_modalLock = false;
function showModal(html, lock = false) {
  S_modalLock = lock;
  $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  $('.modal-back').addEventListener('click', e => {
    if (e.target.classList.contains('modal-back') && !S_modalLock) closeModal();
  });
}
function closeModal() { if (S_modalLock) return; $('#modal-root').innerHTML = ''; }
