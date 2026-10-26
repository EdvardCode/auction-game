'use strict';
/* ================= БОЛЬШОЙ ЭКРАН (ведущий) ================= */
const H = { code: null, ip: '', maxTeams: 2, lobby: null, pub: null, bench: null, cinema: false };

async function fetchIp() { try { H.ip = (await (await fetch('/api/info')).json()).ip; } catch { H.ip = location.hostname; } }

function hostWire() {
  $('#menuMinus').onclick = () => { H.maxTeams = Math.max(2, H.maxTeams - 1); $('#menuCount').textContent = H.maxTeams; };
  $('#menuPlus').onclick = () => { H.maxTeams = Math.min(6, H.maxTeams + 1); $('#menuCount').textContent = H.maxTeams; };
  $('#btnCreate').onclick = () => {
    socket.emit('host:create', { maxTeams: H.maxTeams }, r => {
      if (!r.ok) return toast('Не удалось создать игру', 'err');
      ROLE = 'host'; H.code = r.code;
      setSession({ host: true, code: r.code });
      Sound.play('win');
    });
  };
}

socket.on('room:lobby', d => {
  if (ROLE !== 'host') return;
  H.lobby = d; H.pub = null; H.cinema = false;
  showScr('scr-host'); renderHost();
});
socket.on('room:public', d => {
  if (ROLE !== 'host') return;
  H.pub = d;
  if (d.phase === 'results') return; // бенчмарк рисуется отдельно
  showScr('scr-host'); renderHost();
});
socket.on('bench:data', d => {
  if (ROLE !== 'host' || H.cinema) return;
  H.cinema = true; H.bench = d;
  showScr('scr-host');
  runCinematic(d);
});
socket.on('bench:done', d => {
  if (ROLE !== 'host') return;
  showResultsHost(d.data);
});
socket.on('sfx:bid', () => Sound.play('bid'));

function renderHost() {
  if (H.lobby && (!H.pub || H.pub.phase === 'lobby')) renderHostLobby();
  else renderHostGame();
}

/* ---------- лобби ---------- */
function renderHostLobby() {
  const l = H.lobby;
  const port = location.port ? ':' + location.port : '';
  const url = `${location.protocol}//${H.ip}${port}`;
  const canStart = l.teams.length >= 2 && l.teams.every(t => t.players.length > 0);
  $('#hostBody').innerHTML = `
    <div class="host-lobby">
      <div class="hl-left">
        <div class="kicker">Комната создана • позовите команды</div>
        <div class="big-code">${l.code}</div>
        <div class="hl-url">
          Игроки открывают на телефоне:<br>
          <b>${url}</b><br>
          нажимают «Я игрок» и вводят код выше
        </div>
        <div class="hl-hint">Телефоны и этот компьютер должны быть в одной сети.</div>
      </div>
      <div class="hl-right">
        <div class="count-row">
          <span>Максимум команд</span>
          <div class="count-ctl">
            <button class="count-btn" id="hlMinus">−</button>
            <span class="count-num">${l.maxTeams}</span>
            <button class="count-btn" id="hlPlus">+</button>
          </div>
        </div>
        <div class="hl-teams">${l.teams.map(t => `
          <div class="hl-team" style="--tc:${t.color}">
            <b>${t.name}</b>
            <span>${t.players.length ? t.players.join(' • ') : 'ждём игроков…'}</span>
            <em>${t.players.length}/2</em>
          </div>`).join('') || '<div class="hl-empty">Пока никто не подключился…</div>'}
        </div>
        <button class="btn btn-gold btn-big start-btn" id="hlStart" ${canStart ? '' : 'disabled'}>🔨 Начать игру</button>
        ${!canStart && l.teams.length >= 2 ? '<div class="hl-hint">В каждой команде должен быть хотя бы один игрок.</div>' : ''}
      </div>
    </div>`;
  $('#hlMinus').onclick = () => socket.emit('host:setMax', { maxTeams: l.maxTeams - 1 });
  $('#hlPlus').onclick = () => socket.emit('host:setMax', { maxTeams: l.maxTeams + 1 });
  $('#hlStart').onclick = () => { socket.emit('host:start'); Sound.play('win'); };
}

/* ---------- аукцион ---------- */
function renderHostGame() {
  const p = H.pub; if (!p) return;
  if (p.phase === 'closed') return renderClosed();
  const lot = p.lot, res = p.lotResult;

  let lotCard;
  if (res) {
    lotCard = res.type === 'sold' ? `
      <div class="lot-card"><div class="ov-in">
        <div class="stamp">ПРОДАНО</div>
        <div class="sold-for">за <b>${fmt(res.price)} ₽</b> → <b style="color:${res.teamColor}">${res.teamName}</b></div>
        ${res.items.map(i => `<div class="sold-item">${icon(i.cat)} <b>${i.name}</b>${i.broken ? ' <span class="bad-t">— БРАК!</span>' : ''}</div>`).join('')}
      </div></div>` : `
      <div class="lot-card"><div class="ov-in">
        <div class="stamp grey">ЛОТ СНЯТ</div>
        <div class="sold-for">Ставок не было.</div>
      </div></div>`;
  } else if (lot) {
    const inner = lot.kind === 'mystery' ? `
      <div class="lot-kicker">ЛОТ ${p.lotIdx + 1}/${p.lotsCount} • КОТ В МЕШКЕ</div>
      <div class="lot-ic mystery">${icon('box')}</div>
      <h2 class="lot-name">Кот в мешке</h2>
      <div class="lot-sub">Внутри — случайный б/у ${CAT_RU_A[lot.catHint]}. Без проверки.</div>`
      : `<div class="lot-kicker">ЛОТ ${p.lotIdx + 1}/${p.lotsCount}</div>` + lot.items.map(({ cat, id }) => {
        const s = byId(cat, id);
        return `<div class="lot-ic">${icon(cat)}</div>
          <h2 class="lot-name">${s.name}</h2>
          <div class="lot-sub">${CAT_RU[cat]} • новое, с гарантией</div>
          <div class="lot-chips">${specChips(cat, s).map(c => `<span class="chip-spec">${c}</span>`).join('')}</div>`;
      }).join('');
    lotCard = `<div class="lot-card">${inner}
      <div class="lot-retail">${lot.retail ? `Новый в ДНС: <b>${fmt(lot.retail)} ₽</b> • ` : ''}Старт: <b>${fmt(lot.start)} ₽</b> • шаг: <b>${fmt(lot.step)} ₽</b></div>
    </div>`;
  } else {
    lotCard = `<div class="lot-card"><div class="ov-in">
      <div class="stamp grey">ЛОТЫ ЗАКОНЧИЛИСЬ</div>
      <div class="sold-for">Все ${p.lotsCount} лотов разыграны.</div>
    </div></div>`;
  }

  const board = [...p.teams].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map(t => `
    <div class="lb-row" style="--tc:${t.color}">
      <span class="lb-name">${t.name}</span>
      <span class="lb-money">${fmt(t.money)} ₽</span>
      <span class="lb-score">${t.score !== null ? t.score + ' б.' : '—'}</span>
    </div>`).join('');

  const acts = lot ? lot.acts.map(a => {
    const t = p.teams.find(x => x.id === a.teamId);
    const stTxt = a.status === 'active' ? (lot.leaderId === a.teamId ? 'Лидер' : 'Ставит') : a.status === 'passed' ? 'Пас' : 'Думает';
    return `<div class="act-chip"><span class="act-dot" style="background:${t.color}"></span>${t.name}<em class="st-${a.status}">${stTxt}</em></div>`;
  }).join('') : '';

  let bar;
  if (res) {
    bar = p.lotIdx + 1 < p.lotsCount
      ? `<button class="btn btn-gold btn-big" id="hbNext">Следующий лот ▸</button>`
      : `<button class="btn btn-gold btn-big" id="hbClose">Завершить торги ▸</button>`;
  } else if (lot) {
    bar = `<button class="btn" id="hbSell" ${lot.leaderId ? '' : 'disabled'}>🔨 Продать лидеру</button>
      <button class="btn btn-ghost" id="hbDrop">🗑 Снять лот</button>
      <span class="bar-spacer"></span>
      <button class="btn btn-ghost hb-end" id="hbEnd">🏁 Завершить торги</button>`;
  } else {
    bar = `<button class="btn btn-gold btn-big" id="hbClose">Завершить торги ▸</button>`;
  }

  $('#hostBody').innerHTML = `
    <div class="hg-progress"><div class="hg-fill" style="width:${Math.min(100, (p.lotIdx + (res ? 1 : 0)) / p.lotsCount * 100)}%"></div></div>
    <div class="host-game">
      <div class="hg-left">${lotCard}<div class="hg-acts">${acts}</div></div>
      <div class="hg-right">
        <div class="hg-price panel">
          ${lot && !res ? `
            <div class="hp-label">Текущая ставка</div>
            <div class="price-now">${fmt(lot.price)} ₽</div>
            <div class="leader-line">${lot.leaderId ? `Лидер: <b style="color:${p.teams.find(t => t.id === lot.leaderId).color}">${p.teams.find(t => t.id === lot.leaderId).name}</b>` : 'Ставок пока нет'}</div>
            <div class="hp-hint">Ставки — на телефонах команд. Лот продаётся, когда все соперники спасовали.</div>`
          : '<div class="hp-label">Рынок открыт на телефонах команд</div>'}
        </div>
        <div class="hg-board panel"><div class="hp-label">Табло сборок</div>${board}</div>
      </div>
    </div>
    <div class="host-bar">
      ${bar}
      <span class="bar-info">Лот ${Math.min(p.lotIdx + 1, p.lotsCount)}/${p.lotsCount}</span>
    </div>`;

  const q = id => document.getElementById(id);
  if (q('hbNext')) q('hbNext').onclick = () => { socket.emit('host:nextLot'); Sound.play('click'); };
  if (q('hbSell')) q('hbSell').onclick = () => { socket.emit('host:bid:forceSell'); Sound.play('click'); };
  if (q('hbDrop')) q('hbDrop').onclick = () => { socket.emit('host:dropLot'); Sound.play('click'); };
  if (q('hbClose')) q('hbClose').onclick = () => { socket.emit('host:closeAuction'); Sound.play('click'); };
  if (q('hbEnd')) q('hbEnd').onclick = () => { if (confirm('Завершить торги? Рынок закроется после бенчмарка.')) socket.emit('host:closeAuction'); };
}

function renderClosed() {
  const p = H.pub;
  const board = [...p.teams].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map(t => `
    <div class="lb-row" style="--tc:${t.color}">
      <span class="lb-name">${t.name}</span>
      <span class="lb-money">${fmt(t.money)} ₽</span>
      <span class="lb-score">${t.score !== null ? t.score + ' б.' : '—'}</span>
    </div>`).join('');
  $('#hostBody').innerHTML = `
    <div class="closed-wrap">
      <div class="stamp">ТОРГИ ЗАВЕРШЕНЫ</div>
      <p class="closed-sub">Рынок (Авито и ДНС) ещё открыт на телефонах — команды успевают докупить детали и собрать ПК.</p>
      <div class="hg-board panel closed-board"><div class="hp-label">Табло сборок</div>${board}</div>
      <button class="btn btn-gold btn-big" id="hbBench">🏁 ЗАПУСТИТЬ БЕНЧМАРК</button>
    </div>`;
  $('#hbBench').onclick = () => { socket.emit('host:startBench'); Sound.play('win'); };
}

/* ---------- бенчмарк и результаты ---------- */
async function runCinematic(order) {
  $('#hostBody').innerHTML = `
    <div class="bench-wrap">
      <h1 class="bench-title">БЕНЧМАРК</h1>
      <p class="bench-sub">Финальный прогон. Железо против железа.</p>
      <div class="bench-body"><div id="runArea"></div><div class="board"><h4>Табло</h4><div id="boardRows"></div></div></div>
    </div>`;
  for (const r of order) { await runOne(r); await sleep(700); }
  socket.emit('host:cinemaDone');
}
async function runOne(r) {
  const specs = SLOTS.map(sl => `<span class="chip-spec ${r.pc[sl.key] ? '' : 'dim'}">${sl.label}: ${r.pc[sl.key] || '—'}</span>`).join('');
  $('#runArea').innerHTML = `<div class="run-card" style="--tc:${r.color}">
    <div class="run-top"><b class="run-name">${r.name}</b><span class="run-players">${r.players.join(' • ')}</span></div>
    <div class="run-specs">${specs}</div>
    <div class="run-bar"><div class="run-fill" id="runFill"></div></div>
    <div class="run-line"><span class="run-phase" id="runPhase">Инициализация стенда…</span><span class="run-score" id="runScore"></span></div>
  </div>`;
  const fill = $('#runFill'), ph = $('#runPhase'), sc = $('#runScore');
  if (!r.boots) {
    ph.textContent = 'Попытка запуска системы…'; fill.style.width = '12%';
    await sleep(1300);
    fill.classList.add('fail');
    ph.innerHTML = `<span class="bad-t">СБОЙ: ${r.reason}</span>`;
    sc.textContent = '0 баллов'; Sound.play('fail');
    addBoardRow(r, 0); return;
  }
  const phases = ['Синтетика: процессор…', 'Синтетика: память…', 'Рендер 3D-сцены…', 'Трассировка лучей…', 'Финальный подсчёт…'];
  for (let i = 0; i < phases.length; i++) {
    ph.textContent = phases[i];
    fill.style.width = ((i + 1) / phases.length * 100) + '%';
    Sound.play('tick');
    await sleep(620);
  }
  await new Promise(res => {
    const t0 = performance.now();
    (function f() {
      const p = Math.min(1, (performance.now() - t0) / 900);
      sc.textContent = Math.round(r.score * (0.2 * p + 0.8 * p * p)) + ' б.';
      if (p < 1) requestAnimationFrame(f); else { sc.textContent = r.score + ' б.'; res(); }
    })();
  });
  Sound.play('win');
  addBoardRow(r, r.score);
}
function addBoardRow(r, score) {
  $('#boardRows').innerHTML += `<div class="board-row" style="--tc:${r.color}"><span>${r.name}</span><b>${score}</b></div>`;
}
function showResultsHost(data) {
  const sorted = [...data].sort((a, b) => b.score - a.score);
  const w = sorted[0], medals = ['🥇', '🥈', '🥉'];
  const podium = sorted.slice(0, 3);
  const disp = [podium[1], podium[0], podium[2]].filter(Boolean);
  const by = fn => [...sorted].sort((a, b) => fn(b) - fn(a))[0];
  const noms = [];
  const r = by(x => x.money); if (r.money > 0) noms.push(`💰 Бухгалтер — ${r.name} (остаток ${fmt(r.money)} ₽)`);
  const h = by(x => x.stats.auction); if (h.stats.auction > 0) noms.push(`🔨 Молот торгов — ${h.name} (${h.stats.auction} лотов)`);
  const l = by(x => x.stats.avito - x.stats.avitoBad);
  if (l.stats.avito - l.stats.avitoBad > 0) noms.push(`😎 Рисковый — ${l.name} (${l.stats.avito - l.stats.avitoBad} рабочих б/у деталей)`);
  $('#hostBody').innerHTML = `
    <div class="results-wrap">
      <div class="res-banner" style="--tc:${w.color}">
        <div class="res-kicker">ПОБЕДИТЕЛЬ АУКЦИОНА</div>
        <h1 class="res-name">${w.name}</h1>
        <div class="res-sub">${w.players.join(' • ')} • ${w.score} баллов</div>
      </div>
      <div class="podium">${disp.map(p => {
        const place = sorted.indexOf(p);
        return `<div class="pod p${place}">
          <div class="pod-medal">${medals[place]}</div>
          <b class="pod-name">${p.name}</b>
          <div class="pod-score">${p.score}</div>
          <small>${p.players.join(' • ')}</small>
          <small class="dim">остаток ${fmt(p.money)} ₽</small>
        </div>`;
      }).join('')}</div>
      ${sorted.slice(3).map((p, i) => `<div class="res-row"><span>${i + 4}. ${p.name}</span><b>${p.score} б.</b></div>`).join('')}
      <div class="noms">${noms.map(o => `<span class="nom-chip">${o}</span>`).join('')}</div>
      <button class="btn btn-gold btn-big" id="hbRestart">Играть снова</button>
    </div>`;
  $('#hbRestart').onclick = () => { socket.emit('host:restart'); H.cinema = false; };
  Sound.play('win');
}