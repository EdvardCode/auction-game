'use strict';
/* Общие модули: сокет, звук, иконки, оценка ПК */
const socket = io();
let CAT = null;
let ROLE = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CAT_RU = { cpu: 'Процессор', gpu: 'Видеокарта', mb: 'Материнская плата', ram: 'Память', storage: 'Накопитель', psu: 'Блок питания', cooler: 'Охлаждение', case: 'Корпус' };
const CAT_RU_A = { cpu: 'процессор', gpu: 'видеокарта', ram: 'память', storage: 'накопитель' };
const CATS = ['cpu', 'gpu', 'mb', 'ram', 'storage', 'psu', 'cooler', 'case'];
const REQUIRED = ['cpu', 'mb', 'ram', 'gpu', 'storage', 'psu'];
const SLOTS = [
  { key: 'cpu', label: 'Процессор' }, { key: 'mb', label: 'Материнская плата' },
  { key: 'ram', label: 'Память' }, { key: 'gpu', label: 'Видеокарта' },
  { key: 'storage', label: 'Накопитель' }, { key: 'psu', label: 'Блок питания' },
  { key: 'cooler', label: 'Охлаждение' }, { key: 'case', label: 'Корпус' }
];
const byId = (cat, id) => CAT[cat].find(x => x.id === id);
function specChips(cat, s) {
  switch (cat) {
    case 'cpu': return [s.socket, s.tdp + ' W', s.score + ' б.'];
    case 'gpu': return [s.watts + ' W', s.score + ' б.'];
    case 'mb': return [s.socket, s.ram];
    case 'ram': return [s.type + '-' + s.freq, s.size + ' ГБ', s.score + ' б.'];
    case 'storage': return [s.kind, s.size, s.score + ' б.'];
    case 'psu': return [s.watts + ' W'];
    case 'cooler': return ['до ' + s.cap + ' W'];
    case 'case': return ['бонус +' + s.bonus];
  }
  return [];
}
function icon(cat) {
  const P = {
    cpu: `<rect x="14" y="14" width="20" height="20" rx="2"/><rect x="20" y="20" width="8" height="8"/><path d="M18 14v-5M24 14v-5M30 14v-5M18 39v-5M24 39v-5M30 39v-5M14 18h-5M14 24h-5M14 30h-5M39 18h-5M39 24h-5M39 30h-5"/>`,
    gpu: `<rect x="6" y="16" width="34" height="16" rx="2"/><circle cx="17" cy="24" r="4.5"/><circle cx="30" cy="24" r="4.5"/><path d="M6 20h-2v12M12 32v4M20 32v4"/>`,
    mb: `<rect x="8" y="8" width="32" height="32" rx="2"/><rect x="14" y="14" width="10" height="10"/><path d="M30 14h6M30 20h6M14 30h12M14 34h8"/><circle cx="33" cy="32" r="2.5"/>`,
    ram: `<rect x="6" y="18" width="36" height="12" rx="1"/><path d="M10 30v3M16 30v3M22 30v3M28 30v3M34 30v3"/><rect x="11" y="21" width="5" height="6"/><rect x="21" y="21" width="5" height="6"/><rect x="31" y="21" width="5" height="6"/>`,
    storage: `<rect x="10" y="14" width="28" height="20" rx="2"/><circle cx="20" cy="24" r="6"/><path d="M20 24l4-3"/><circle cx="33" cy="19" r="1.2"/>`,
    psu: `<rect x="8" y="14" width="32" height="20" rx="2"/><circle cx="18" cy="24" r="6"/><path d="M18 20v8M14 24h8"/><path d="M30 20h6M30 24h6M30 28h6"/>`,
    cooler: `<circle cx="24" cy="24" r="4"/><path d="M24 20c-2-6 2-10 6-11 1 4-2 8-6 11zM28 24c6-2 10 2 11 6-4 1-8-2-11-6zM24 28c2 6-2 10-6 11-1-4 2-8 6-11zM20 24c-6 2-10-2-11-6 4-1 8 2 11 6z"/>`,
    case: `<rect x="14" y="8" width="20" height="32" rx="2"/><circle cx="24" cy="15" r="1.6"/><path d="M18 24h12M18 29h12M18 34h12"/>`,
    box: `<path d="M8 18l16-8 16 8-16 8z"/><path d="M8 18v12l16 8 16-8V18"/><path d="M24 26v12"/>`
  };
  return `<svg class="ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[cat] || P.box}</svg>`;
}

/* оценка ПК (та же формула, что на сервере) */
function evaluate(pc) {
  const get = k => pc[k] ? byId(pc[k].cat, pc[k].id) : null;
  const missing = REQUIRED.filter(k => !pc[k]);
  if (missing.length) return { boots: false, score: 0, reason: 'Не хватает: ' + missing.map(k => CAT_RU[k]).join(', '), warnings: [] };
  const cpu = get('cpu'), mb = get('mb'), ram = get('ram'), gpu = get('gpu'),
        stor = get('storage'), psu = get('psu'), cool = get('cooler'), cs = get('case');
  if (cpu.socket !== mb.socket) return { boots: false, score: 0, reason: `Сокеты не совпадают: ${cpu.socket} ≠ ${mb.socket}`, warnings: [] };
  if (ram.type !== mb.ram) return { boots: false, score: 0, reason: `Память ${ram.type} не подходит к плате (${mb.ram})`, warnings: [] };
  let score = cpu.score + gpu.score + ram.score + stor.score + (cs ? cs.bonus : 0);
  const warnings = [];
  const draw = cpu.watts + gpu.watts + 60;
  if (psu.watts < draw) { score *= .55; warnings.push({ t: 'err', s: `БП ${psu.watts}W не тянет систему (~${draw}W) — −45%` }); }
  else if (psu.watts < draw + 100) warnings.push({ t: 'warn', s: `БП впритык: ${psu.watts}W при ~${draw}W` });
  const cap = cool ? cool.cap : 65;
  if (cap < cpu.tdp) { score *= .85; warnings.push({ t: 'warn', s: `Охлаждение ${cap}W < TDP ${cpu.tdp}W — троттлинг, −15%` }); }
  return { boots: true, score: Math.round(score), reason: null, warnings, draw, psuW: psu.watts };
}

/* звук (синтез) */
const Sound = {
  ctx: null, on: true,
  ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, dur, type = 'square', vol = .12, delay = 0, slideTo = null) {
    if (!this.on) return; this.ensure();
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + .03);
  },
  play(n) {
    if (!this.on) return;
    switch (n) {
      case 'click': this.tone(340, .05, 'sine', .06); break;
      case 'bid': this.tone(520, .06, 'square', .12); this.tone(760, .07, 'square', .1, .05); break;
      case 'tick': this.tone(980, .04, 'sine', .05); break;
      case 'cash': this.tone(1245, .07, 'sine', .12); this.tone(1660, .1, 'sine', .12, .06); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .12, 'triangle', .14, i * .09)); break;
      case 'fail': this.tone(320, .3, 'sawtooth', .14, 0, 110); break;
    }
  }
};
document.addEventListener('pointerdown', () => Sound.ensure(), { once: true });

/* сессия / экраны / тосты */
const getSession = () => { try { return JSON.parse(localStorage.getItem('auction_v2')); } catch { return null; } };
const setSession = s => localStorage.setItem('auction_v2', JSON.stringify(s));
const clearSession = () => localStorage.removeItem('auction_v2');
function showScr(id) { $$('.screen').forEach(x => x.classList.toggle('hidden', x.id !== id)); }
function toast(msg, kind = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + kind; d.innerHTML = msg;
  $('#toast-root').appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

/* фоновые частицы (только большие экраны) */
function fxInit() {
  if (innerWidth < 860) return;
  const fx = $('#fx'); if (!fx) return;
  const x = fx.getContext('2d');
  let W, H;
  const rs = () => { W = fx.width = innerWidth; H = fx.height = innerHeight; };
  rs(); addEventListener('resize', rs);
  const ps = Array.from({ length: 55 }, () => ({
    x: Math.random() * W, y: Math.random() * H, s: rndL(1, 3), vy: rndL(.06, .35), vx: rndL(-.08, .08),
    a: rndL(.06, .3), sq: Math.random() < .3, c: pickL(['245,185,66', '67,198,240', '56,214,174'])
  }));
  (function loop() {
    x.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.y -= p.vy; p.x += p.vx;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      x.fillStyle = `rgba(${p.c},${p.a})`;
      if (p.sq) x.fillRect(p.x, p.y, p.s * 2.4, p.s * 2.4);
      else { x.beginPath(); x.arc(p.x, p.y, p.s, 0, 7); x.fill(); }
    }
    requestAnimationFrame(loop);
  })();
}
const pickL = a => a[Math.floor(Math.random() * a.length)];
const rndL = (a, b) => a + Math.random() * (b - a);

async function loadCatalog() { if (!CAT) CAT = await (await fetch('/api/catalog')).json(); }