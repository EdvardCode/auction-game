const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const { CATALOG } = require('./data/catalog');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/catalog', (_q, res) => res.json(CATALOG));
app.get('/api/info', (_q, res) => res.json({ ip: lanIP() }));
app.get('/healthz', (_q, res) => res.send('ok')); // проверка живости для Render

function lanIP() {
  const ifaces = os.networkInterfaces();
  for (const k in ifaces) for (const i of ifaces[k])
    if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}

/* ================= утилиты ================= */
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const round500 = n => Math.round(n / 500) * 500;
const round10 = n => Math.round(n / 10) * 10;
const byId = (cat, id) => CATALOG[cat].find(x => x.id === id);
let uidC = 0; const uid = () => 'u' + (++uidC);
const CODE_ABC = [...'ABCDEFGHJKMNPQRSTUVWXYZ23456789'];
const TEAM_COLORS = ['#ffb43a', '#43c6f0', '#ff6b9d', '#7ee787', '#c9a0ff', '#ff9350'];
const CATS = ['cpu', 'gpu', 'mb', 'ram', 'storage', 'psu', 'cooler', 'case'];
const REQUIRED = ['cpu', 'mb', 'ram', 'gpu', 'storage', 'psu'];
const emptyPC = () => ({ cpu: null, mb: null, ram: null, gpu: null, storage: null, psu: null, cooler: null, case: null });
const SELLERS = [
  { n: 'Дмитрий', r: 4.8 }, { n: 'Алексей_77', r: 4.2 }, { n: 'Марина', r: 4.9 },
  { n: 'SeregaHardware', r: 3.6 }, { n: 'Ольга', r: 4.5 }, { n: 'ТоликЖелезо', r: 2.9 },
  { n: 'Игорь П.', r: 4.7 }, { n: 'Валерий', r: 3.3 }
];
const CONDS = ['Отличное', 'Хорошее', 'Нормальное', 'Есть следы использования'];
const NOTES = [
  'После майнинга, но аккуратно', 'Стоял в игровом клубе. Недолго', 'Подарил друг, не подошёл',
  'Работает. Ну, почти всегда', 'Продаю срочно после апгрейда', 'Не бит, не крашен, не перегрет',
  'Отдаю из-за переезда', 'Тихий, холодный, почти новый'
];

/* ================= игровая математика ================= */
function canInstall(team, item) {
  if (item.broken) return { ok: false, reason: 'Брак — не работает' };
  const s = byId(item.cat, item.id), pc = team.pc;
  if (item.cat === 'cpu' && pc.mb) { const mb = byId('mb', pc.mb.id); if (s.socket !== mb.socket) return { ok: false, reason: 'Плата под ' + mb.socket }; }
  if (item.cat === 'mb') {
    if (pc.cpu) { const c = byId('cpu', pc.cpu.id); if (c.socket !== s.socket) return { ok: false, reason: 'Процессор ' + c.socket }; }
    if (pc.ram) { const r = byId('ram', pc.ram.id); if (r.type !== s.ram) return { ok: false, reason: 'Память ' + r.type }; }
  }
  if (item.cat === 'ram' && pc.mb) { const mb = byId('mb', pc.mb.id); if (s.type !== mb.ram) return { ok: false, reason: 'Плата под ' + mb.ram }; }
  return { ok: true };
}
function evaluate(team) {
  const pc = team.pc;
  const get = k => pc[k] ? byId(pc[k].cat, pc[k].id) : null;
  const missing = REQUIRED.filter(k => !pc[k]);
  if (missing.length) return { boots: false, score: 0, reason: 'Не хватает: ' + missing.map(k => ({ cpu: 'Процессор', mb: 'Материнка', ram: 'Память', gpu: 'Видеокарта', storage: 'Накопитель', psu: 'БП' }[k])).join(', ') };
  const cpu = get('cpu'), mb = get('mb'), ram = get('ram'), gpu = get('gpu'),
        stor = get('storage'), psu = get('psu'), cool = get('cooler'), cs = get('case');
  if (cpu.socket !== mb.socket) return { boots: false, score: 0, reason: `Сокеты не совпадают: ${cpu.socket} ≠ ${mb.socket}` };
  if (ram.type !== mb.ram) return { boots: false, score: 0, reason: `Память ${ram.type} не подходит к плате (${mb.ram})` };
  let score = cpu.score + gpu.score + ram.score + stor.score + (cs ? cs.bonus : 0);
  const warnings = [];
  const draw = cpu.watts + gpu.watts + 60;
  if (psu.watts < draw) { score *= .55; warnings.push({ t: 'err', s: `БП ${psu.watts}W не тянет систему (~${draw}W)` }); }
  else if (psu.watts < draw + 100) warnings.push({ t: 'warn', s: `БП впритык: ${psu.watts}W при ~${draw}W` });
  const cap = cool ? cool.cap : 65;
  if (cap < cpu.tdp) { score *= .85; warnings.push({ t: 'warn', s: `Охлаждение ${cap}W < TDP ${cpu.tdp}W — троттлинг` }); }
  return { boots: true, score: Math.round(score), reason: null, warnings, draw };
}

/* ================= комнаты ================= */
const rooms = {};
function makeCode() { let c; do { c = Array.from({ length: 4 }, () => pick(CODE_ABC)).join(''); } while (rooms[c]); return c; }
function createRoom(maxTeams) {
  const room = {
    code: makeCode(), maxTeams, phase: 'lobby', teams: [], players: {},
    lots: [], lotIdx: 0, lotLive: null, lotResult: null, avito: [], results: null, used: new Set()
  };
  rooms[room.code] = room;
  for (let i = 0; i < 12; i++) room.avito.push(avitoListing());
  room.restock = setInterval(() => {
    if (room.phase !== 'auction' && room.phase !== 'closed') return;
    let added = false;
    while (room.avito.length < 12) { room.avito.push(avitoListing()); added = true; }
    if (added) io.to('room:' + room.code).emit('room:public', pub(room));
  }, 15000);
  return room;
}
function avitoListing() {
  const cat = pick(CATS), s = pick(CATALOG[cat]);
  return { id: uid(), cat, iid: s.id, price: round10(s.price * rnd(.55, .8)), broken: Math.random() < .3, seller: pick(SELLERS), cond: pick(CONDS), note: pick(NOTES) };
}

/* ================= лоты ================= */
const stepFor = p => p < 8000 ? 500 : p < 20000 ? 1000 : 2000;
function pickUnused(room, cat) {
  const pool = CATALOG[cat].filter(s => !room.used.has(s.id));
  const s = pick(pool.length ? pool : CATALOG[cat]);
  room.used.add(s.id); return s;
}
function makeLot(room, kind) {
  if (kind === 'mystery') {
    const cat = pick(['cpu', 'gpu', 'ram', 'storage']);
    const start = cat === 'gpu' ? 12000 : cat === 'cpu' ? 8000 : 3500;
    return { kind, cat, start, step: stepFor(start), retail: null };
  }
  if (kind === 'bundle') {
    const a = pickUnused(room, 'ram'), b = pickUnused(room, 'storage');
    const retail = a.price + b.price;
    return { kind, items: [{ cat: 'ram', id: a.id }, { cat: 'storage', id: b.id }], retail, start: round500(retail * rnd(.45, .58)), step: stepFor(round500(retail * .5)) };
  }
  const s = pickUnused(room, kind);
  const start = round500(s.price * rnd(.45, .6));
  return { kind: 'item', items: [{ cat: kind, id: s.id }], retail: s.price, start, step: stepFor(start) };
}
function genLots(room) {
  const tc = room.teams.length, n = 10 + tc * 3, plan = [];
  ['cpu', 'gpu', 'mb'].forEach(c => { for (let i = 0; i < tc; i++) plan.push(c); });
  plan.push('mystery', 'bundle');
  const extras = ['ram', 'storage', 'psu', 'cooler', 'case', 'gpu', 'cpu', 'ram', 'storage', 'bundle', 'mystery'];
  while (plan.length < n) plan.push(pick(extras));
  for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; }
  return plan.slice(0, n).map(k => makeLot(room, k));
}
function openLot(room) {
  room.lotLive = { price: room.lots[room.lotIdx].start, leaderId: null, acts: Object.fromEntries(room.teams.map(t => [t.id, 'pending'])) };
  room.lotResult = null;
}

/* ================= снапшоты ================= */
function pub(room) {
  return {
    phase: room.phase, code: room.code,
    lotIdx: room.lotIdx, lotsCount: room.lots.length,
    lot: (room.phase === 'auction' && room.lotLive) ? lotPublic(room) : null,
    lotResult: room.lotResult,
    teams: room.teams.map(t => {
      const ev = evaluate(t);
      return { id: t.id, name: t.name, color: t.color, money: t.money, filled: Object.values(t.pc).filter(Boolean).length, score: ev.boots ? ev.score : null };
    }),
    avito: room.avito
  };
}
function lotPublic(room) {
  const lot = room.lots[room.lotIdx], st = room.lotLive;
  const o = {
    kind: lot.kind, start: lot.start, step: lot.step, retail: lot.retail,
    price: st.price, leaderId: st.leaderId, frozen: !!room.lotResult,
    acts: room.teams.map(t => ({ teamId: t.id, status: st.acts[t.id] }))
  };
  if (lot.kind === 'mystery') o.catHint = lot.cat;
  else o.items = lot.items.slice();
  return o;
}
function priv(t) { return { teamId: t.id, money: t.money, inventory: t.inventory, pc: t.pc }; }
function lobbyData(room) {
  return { phase: 'lobby', code: room.code, maxTeams: room.maxTeams, teams: room.teams.map(t => ({ id: t.id, name: t.name, color: t.color, players: t.players.map(p => p.name) })) };
}
function benchData(room) {
  return room.teams.map(t => {
    const ev = evaluate(t);
    return {
      teamId: t.id, name: t.name, color: t.color, players: t.players.map(p => p.name), money: t.money,
      boots: ev.boots, score: ev.boots ? ev.score : 0, reason: ev.reason,
      stats: { ...t.stats },
      pc: Object.fromEntries(Object.entries(t.pc).map(([k, it]) => [k, it ? byId(it.cat, it.id).name : null]))
    };
  }).sort((a, b) => a.score - b.score);
}
function broadcastAll(room) {
  io.to('room:' + room.code).emit('room:public', pub(room));
  room.teams.forEach(t => io.to('team:' + t.id).emit('you:state', priv(t)));
}

/* ================= аукцион ================= */
/* Продажа лота лидеру — вызывается и автоматически, и молотком ведущего */
function resolveLot(room) {
  const st = room.lotLive;
  if (st.leaderId) {
    const team = room.teams.find(t => t.id === st.leaderId);
    const lot = room.lots[room.lotIdx];
    team.money -= st.price; team.stats.auction++;
    const items = [];
    if (lot.kind === 'mystery') {
      const s = pickUnused(room, lot.cat), broken = Math.random() < .25;
      team.inventory.push({ uid: uid(), cat: lot.cat, id: s.id, paid: st.price, broken, source: 'auction' });
      items.push({ cat: lot.cat, name: s.name, broken });
    } else {
      const share = Math.round(st.price / lot.items.length);
      for (const it of lot.items) {
        team.inventory.push({ uid: uid(), cat: it.cat, id: it.id, paid: share, broken: false, source: 'auction' });
        items.push({ cat: it.cat, name: byId(it.cat, it.id).name });
      }
    }
    room.lotResult = { type: 'sold', teamId: team.id, teamName: team.name, teamColor: team.color, price: st.price, items };
  } else {
    room.lotResult = { type: 'none' };
  }
}
/* Авто-продажа: все спасовали ИЛИ лидер остался один */
function checkResolve(room) {
  const st = room.lotLive;
  const passed = room.teams.filter(t => st.acts[t.id] === 'passed').length;
  const allPassed = passed === room.teams.length;
  const leaderAlone = st.leaderId && room.teams.length - passed === 1 && st.acts[st.leaderId] !== 'passed';
  if (allPassed || leaderAlone) resolveLot(room);
}

/* ================= сокеты ================= */
const roomOfHost = s => (s.data.host && rooms[s.data.code]) || null;
function teamOf(s) {
  const room = rooms[s.data.code];
  if (!room) return {};
  const p = room.players[s.data.pid];
  const team = p && room.teams.find(t => t.id === p.teamId);
  return { room, p, team };
}
const toastTo = (s, msg, kind = 'err') => s.emit('you:toast', { msg, kind });
function emitByPhase(s, room) {
  if (room.phase === 'lobby') { s.emit('room:lobby', lobbyData(room)); return; }
  s.emit('room:public', pub(room));
  if (room.phase === 'results' && room.results) s.emit('bench:done', { data: room.results });
}

io.on('connection', s => {
  /* ---------- ведущий ---------- */
  s.on('host:create', ({ maxTeams } = {}, cb) => {
    const room = createRoom(Math.min(6, Math.max(2, +maxTeams || 2)));
    s.data.host = true; s.data.code = room.code; s.join('room:' + room.code);
    cb && cb({ ok: true, code: room.code });
    s.emit('room:lobby', lobbyData(room));
  });
  s.on('host:rejoin', ({ code }, cb) => {
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false });
    s.data.host = true; s.data.code = code; s.join('room:' + code);
    cb && cb({ ok: true });
    emitByPhase(s, room);
  });
  s.on('host:setMax', ({ maxTeams }) => {
    const room = roomOfHost(s); if (!room || room.phase !== 'lobby') return;
    room.maxTeams = Math.max(room.teams.length, Math.min(6, Math.max(2, +maxTeams || 2)));
    io.to('room:' + room.code).emit('room:lobby', lobbyData(room));
  });
  s.on('host:start', () => {
    const room = roomOfHost(s); if (!room || room.phase !== 'lobby') return;
    if (room.teams.length < 2 || room.teams.some(t => !t.players.length)) return;
    room.teams.forEach(t => { t.money = 100000; t.inventory = []; t.pc = emptyPC(); t.stats = { auction: 0, avito: 0, avitoBad: 0 }; });
    room.used = new Set(); room.lots = genLots(room); room.lotIdx = 0; room.lotResult = null; room.results = null;
    room.avito = []; for (let i = 0; i < 12; i++) room.avito.push(avitoListing());
    room.phase = 'auction'; openLot(room);
    broadcastAll(room);
  });
  /* Молоток ведущего: продаёт лидеру безусловно */
  s.on('host:bid:forceSell', () => {
    const room = roomOfHost(s);
    if (!room || room.phase !== 'auction' || !room.lotLive || room.lotResult || !room.lotLive.leaderId) return;
    resolveLot(room); broadcastAll(room);
  });
  s.on('host:dropLot', () => {
    const room = roomOfHost(s); if (!room || room.phase !== 'auction' || !room.lotLive || room.lotResult) return;
    room.lotResult = { type: 'none' }; broadcastAll(room);
  });
  s.on('host:nextLot', () => {
    const room = roomOfHost(s); if (!room || room.phase !== 'auction' || !room.lotResult) return;
    room.lotIdx++; room.lotResult = null;
    if (room.lotIdx < room.lots.length) openLot(room); else room.lotLive = null;
    broadcastAll(room);
  });
  s.on('host:closeAuction', () => {
    const room = roomOfHost(s); if (!room || room.phase !== 'auction') return;
    room.phase = 'closed'; room.lotLive = null; room.lotResult = null;
    broadcastAll(room);
  });
  s.on('host:startBench', () => {
    const room = roomOfHost(s); if (!room || (room.phase !== 'closed' && room.phase !== 'auction')) return;
    clearInterval(room.restock);
    room.phase = 'results'; room.results = benchData(room);
    io.to('room:' + room.code).emit('bench:data', room.results);
    broadcastAll(room);
  });
  s.on('host:cinemaDone', () => {
    const room = roomOfHost(s); if (!room || room.phase !== 'results') return;
    io.to('room:' + room.code).emit('bench:done', { data: room.results });
  });
  s.on('host:restart', () => {
    const room = roomOfHost(s); if (!room) return;
    room.phase = 'lobby'; room.lots = []; room.lotIdx = 0; room.lotLive = null; room.lotResult = null; room.results = null;
    io.to('room:' + room.code).emit('room:lobby', lobbyData(room));
  });

  /* ---------- игроки ---------- */
  s.on('player:probe', ({ code }, cb) => {
    const room = rooms[(code || '').toUpperCase().trim()];
    if (!room) return cb && cb({ ok: false, err: 'Код не найден' });
    if (room.phase !== 'lobby') return cb && cb({ ok: false, err: 'Игра уже началась' });
    cb && cb({ ok: true, ...lobbyData(room) });
  });
  s.on('player:join', ({ code, name, createTeam, joinTeam }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb({ ok: false, err: 'Код не найден' });
    if (room.phase !== 'lobby') return cb({ ok: false, err: 'Игра уже началась' });
    name = (name || '').trim().slice(0, 20);
    if (!name) return cb({ ok: false, err: 'Введите имя' });
    let team;
    if (joinTeam) {
      team = room.teams.find(t => t.id === joinTeam);
      if (!team) return cb({ ok: false, err: 'Команда не найдена' });
      if (team.players.length >= 2) return cb({ ok: false, err: 'В команде уже 2 игрока' });
    } else {
      if (room.teams.length >= room.maxTeams) return cb({ ok: false, err: 'Лимит команд исчерпан' });
      team = {
        id: uid(), name: (createTeam || '').trim().slice(0, 24) || `Команда ${room.teams.length + 1}`,
        color: TEAM_COLORS[room.teams.length % TEAM_COLORS.length], players: [],
        money: 100000, inventory: [], pc: emptyPC(), stats: { auction: 0, avito: 0, avitoBad: 0 }
      };
      room.teams.push(team);
    }
    const player = { id: uid(), name, teamId: team.id };
    room.players[player.id] = player;
    team.players.push({ id: player.id, name });
    s.data.pid = player.id; s.data.code = code;
    s.join('room:' + code); s.join('team:' + team.id);
    cb({ ok: true, pid: player.id, team: { id: team.id, name: team.name, color: team.color } });
    io.to('room:' + code).emit('room:lobby', lobbyData(room));
  });
  s.on('player:rejoin', ({ code, pid }, cb) => {
    const room = rooms[code]; const p = room && room.players[pid];
    if (!room || !p) return cb && cb({ ok: false });
    const team = room.teams.find(t => t.id === p.teamId);
    s.data.pid = pid; s.data.code = code;
    s.join('room:' + code); if (team) s.join('team:' + team.id);
    cb && cb({ ok: true, team: team && { id: team.id, name: team.name, color: team.color } });
    emitByPhase(s, room);
    if (team && room.phase !== 'lobby') s.emit('you:state', priv(team));
  });

  /* ---------- действия команды ---------- */
  s.on('game:bid', () => {
    const { room, team } = teamOf(s); if (!room || !team) return;
    if (room.phase !== 'auction' || !room.lotLive || room.lotResult) return toastTo(s, 'Сейчас нельзя ставить');
    const st = room.lotLive;
    if (st.acts[team.id] === 'passed') return toastTo(s, 'Вы уже спасовали');
    if (st.leaderId === team.id) return toastTo(s, 'Вы и так лидируете');
    const lot = room.lots[room.lotIdx];
    const bid = st.leaderId ? st.price + lot.step : lot.start;
    if (team.money < bid) return toastTo(s, 'Не хватает денег на ставку');
    st.price = bid; st.leaderId = team.id; st.acts[team.id] = 'active';
    io.to('room:' + room.code).emit('sfx:bid');
    checkResolve(room);
    broadcastAll(room);
  });
  s.on('game:pass', () => {
    const { room, team } = teamOf(s); if (!room || !team) return;
    if (room.phase !== 'auction' || !room.lotLive || room.lotResult) return;
    if (room.lotLive.acts[team.id] === 'passed') return;
    room.lotLive.acts[team.id] = 'passed';
    checkResolve(room);
    broadcastAll(room);
  });
  s.on('game:buyAvito', ({ id }, cb) => {
    const { room, team } = teamOf(s); if (!room || !team) return cb && cb({ ok: false });
    if (room.phase !== 'auction' && room.phase !== 'closed') return cb({ ok: false, err: 'Рынок закрыт' });
    const i = room.avito.findIndex(l => l.id === id);
    if (i < 0) return cb({ ok: false, err: 'Лот уже забрали' });
    const l = room.avito[i], spec = byId(l.cat, l.iid);
    if (team.money < l.price) return cb({ ok: false, err: 'Не хватает денег' });
    team.money -= l.price; room.avito.splice(i, 1);
    team.inventory.push({ uid: uid(), cat: l.cat, id: l.iid, paid: l.price, broken: l.broken, source: 'avito' });
    team.stats.avito++; if (l.broken) team.stats.avitoBad++;
    cb({ ok: true, broken: l.broken, name: spec.name, cat: l.cat });
    broadcastAll(room);
  });
  s.on('game:buyDns', ({ id }, cb) => {
    const { room, team } = teamOf(s); if (!room || !team) return cb && cb({ ok: false });
    if (room.phase !== 'auction' && room.phase !== 'closed') return cb({ ok: false, err: 'Рынок закрыт' });
    let found = null, fcat = null;
    for (const c of CATS) { const x = CATALOG[c].find(y => y.id === id); if (x) { found = x; fcat = c; break; } }
    if (!found) return cb({ ok: false, err: 'Товар не найден' });
    if (team.money < found.price) return cb({ ok: false, err: 'Не хватает денег' });
    team.money -= found.price;
    team.inventory.push({ uid: uid(), cat: fcat, id: found.id, paid: found.price, broken: false, source: 'dns' });
    cb({ ok: true, name: found.name });
    broadcastAll(room);
  });
  s.on('game:sell', ({ uid: u }) => {
    const { room, team } = teamOf(s); if (!room || !team) return;
    if (room.phase !== 'auction' && room.phase !== 'closed') return toastTo(s, 'Продажи закрыты');
    const idx = team.inventory.findIndex(x => x.uid === u);
    if (idx < 0) return;
    const it = team.inventory[idx];
    const sp = round10(it.paid * (it.broken ? .1 : .7));
    Object.keys(team.pc).forEach(k => { if (team.pc[k] && team.pc[k].uid === u) team.pc[k] = null; });
    team.money += sp; team.inventory.splice(idx, 1);
    toastTo(s, `Продано за ${sp.toLocaleString('ru-RU')} ₽`, 'ok');
    broadcastAll(room);
  });
  s.on('game:install', ({ uid: u }) => {
    const { room, team } = teamOf(s); if (!room || !team) return;
    if (room.phase !== 'auction' && room.phase !== 'closed') return toastTo(s, 'Сборка закрыта');
    const it = team.inventory.find(x => x.uid === u);
    if (!it) return;
    const chk = canInstall(team, it);
    if (!chk.ok) return toastTo(s, chk.reason);
    team.pc[it.cat] = it;
    broadcastAll(room);
  });
  s.on('game:uninstall', ({ slot }) => {
    const { room, team } = teamOf(s); if (!room || !team) return;
    if (room.phase !== 'auction' && room.phase !== 'closed') return;
    team.pc[slot] = null;
    broadcastAll(room);
  });
});

server.listen(PORT, () => {
  console.log('==================================');
  console.log('  🔨 АУКЦИОН v2.1 — сервер запущен');
  console.log(`  Экран:    http://localhost:${PORT}`);
  console.log(`  Телефоны: http://${lanIP()}:${PORT}`);
  console.log('==================================');
});
