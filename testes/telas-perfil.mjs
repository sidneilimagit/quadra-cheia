// Como rodar: npm i jsdom && node testes/telas-perfil.mjs index.html
// Testa montar, salvar, carregar e editar o perfil, com Supabase e API de CEP simulados.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ ') + m); };
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));

// "Banco" em memória, com o mínimo de PostgREST que o app usa
function makeDb(seed) {
  const db = { profiles: [], profiles_private: [], profile_sports: [], groups: [], join_requests: [], ...seed }, log = [];
  const from = (table) => {
    let op = 'select', payload = null, filters = [], opts = {};
    const match = r => filters.every(f => f(r));
    const run = () => {
      const rows = db[table];
      log.push({ table, op, payload });
      if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); return { error: null }; }
      if (op === 'delete') { db[table] = rows.filter(r => !match(r)); return { error: null }; }
      if (op === 'upsert') { payload.forEach(n => { const i = rows.findIndex(r => r.user_id === n.user_id && r.sport === n.sport); i > -1 ? Object.assign(rows[i], n) : rows.push({ ...n }); }); return { error: null }; }
      const data = rows.filter(match); return { data, count: data.length, error: null };
    };
    const b = {
      select() { op = 'select'; return b; },
      update(p) { op = 'update'; payload = p; return b; },
      upsert(p, o) { op = 'upsert'; payload = p; opts = o; return b; },
      delete() { op = 'delete'; return b; },
      eq(c, v) { filters.push(r => r[c] === v); return b; },
      neq(c, v) { filters.push(r => r[c] !== v); return b; },
      order() { return b; },
      not(c, _op, list) { const vals = list.slice(1, -1).split(',').map(x => x.replace(/^"|"$/g, '')); filters.push(r => !vals.includes(r[c])); return b; },
      maybeSingle: async () => { const r = run(); return { data: r.data[0] || null, error: null }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return { db, log, from };
}
async function boot({ seed, cepApi }) {
  const store = makeDb(seed);
  const user = { id: 'u-1', email: 'larissa@x.com' };
  const client = { from: store.from, auth: {
    getSession: async () => ({ data: { session: { user } } }), getUser: async () => ({ data: { user } }),
    signOut: async () => ({ error: null }) } };
  const fetchLog = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.supabase = { createClient: () => client };
    w.fetch = async (url) => { fetchLog.push(url); return cepApi(url); };
  } });
  await wait(80);
  const w = dom.window, d = w.document;
  return { w, d, store, fetchLog, active: () => d.querySelector('.screen.active')?.id, ev: e => w.eval(e) };
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const awesome = url => url.includes('awesomeapi') ? json({ address: 'Rua Domingos de Morais', district: 'Vila Mariana', city: 'São Paulo', lat: '-23.5891', lng: '-46.6349' }) : json({}, 404);
const seedNew = { profiles: [{ id: 'u-1', name: 'Larissa', hood: null, days: [], periods: [] }], profiles_private: [{ id: 'u-1', cep: null, lat: null, lng: null }], profile_sports: [] };

// 1) Primeiro acesso: monta o perfil
let t = await boot({ seed: seedNew, cepApi: awesome });
ok(t.active() === 'profile', 'Usuário sem modalidades cai em "Monte seu perfil"');
ok(!t.d.getElementById('photoBox'), 'Foto removida desta versão (fora do escopo do MVP)');
const cep = t.d.getElementById('pfCep'); cep.value = '04101000'; await t.w.onCepInput(cep);
ok(cep.value === '04101-000', 'CEP recebe máscara');
ok(t.d.getElementById('pfHood').value === 'Vila Mariana' && t.d.getElementById('pfCity').value === 'São Paulo', 'Bairro e cidade preenchidos pela API de CEP');
await t.w.saveProfile();
ok(/modalidade e nível/.test(t.d.getElementById('pfErr').textContent), 'Exige modalidade e nível');
t.ev("state.user.mods=[{sport:'Vôlei de areia',level:'Iniciante'},{sport:'Beach tennis',level:'Intermediário'}]");
await t.w.saveProfile();
ok(/dia e um período/.test(t.d.getElementById('pfErr').textContent), 'Exige disponibilidade (dia e período)');
t.w.renderAvail();
const chip = (box, txt) => [...t.d.querySelectorAll('#' + box + ' .chip')].find(c => c.textContent === txt);
chip('pfDays', 'Sáb').click(); chip('pfPeriods', 'Manhã').click(); chip('pfDays', 'Qua').click(); chip('pfPeriods', 'Noite').click();
ok(chip('pfDays', 'Sáb').classList.contains('on'), 'Chips de disponibilidade marcam a escolha');
await t.w.saveProfile(); await wait();
const db = t.store.db;
ok(t.active() === 'search', 'Depois de salvar, vai para a busca');
ok(db.profiles[0].hood === 'Vila Mariana' && db.profiles[0].days.join() === 'Sábado,Quarta' && db.profiles[0].periods.join() === 'Manhã,Noite', 'Bairro e disponibilidade gravados no perfil público');
ok(db.profiles_private[0].cep === '04101-000' && Math.abs(db.profiles_private[0].lat + 23.5891) < 1e-6, 'CEP e coordenadas gravados só na tabela privada');
ok(!('cep' in db.profiles[0]) && !('lat' in db.profiles[0]), 'CEP e coordenadas NÃO vão para o perfil público');
ok(db.profile_sports.length === 2, 'Duas modalidades gravadas');

// 2) Recarregar: perfil vem do banco
const seedSaved = JSON.parse(JSON.stringify(db));
t = await boot({ seed: seedSaved, cepApi: awesome });
ok(t.active() === 'search', 'Ao reabrir, quem já tem perfil vai direto para a busca');
ok(t.ev('state.user.hood') === 'Vila Mariana' && t.ev('state.user.mods.length') === 2 && t.ev('state.user.days.length') === 2, 'Perfil carregado do banco');

// 3) Editar sem trocar CEP; remover uma modalidade
t.w.openProfile();
ok(t.d.getElementById('pfCep').value === '04101-000' && t.d.getElementById('pfHood').value === 'Vila Mariana', 'Edição mostra o CEP e o bairro salvos');
t.ev("state.user.mods=[{sport:'Vôlei de areia',level:'Intermediário'}]");
const callsBefore = t.fetchLog.length;
await t.w.saveProfile(); await wait();
ok(t.fetchLog.length === callsBefore, 'Salvar sem trocar o CEP não consulta a API de novo');
ok(t.store.db.profile_sports.length === 1 && t.store.db.profile_sports[0].level === 'Intermediário', 'Modalidade removida e nível atualizado no banco');

// 4) API principal fora do ar: usa ViaCEP (sem coordenadas)
t = await boot({ seed: seedNew, cepApi: url => url.includes('awesomeapi') ? json({}, 500) : json({ logradouro: 'Rua dos Pinheiros', bairro: 'Pinheiros', localidade: 'São Paulo' }) });
const c2 = t.d.getElementById('pfCep'); c2.value = '05422-000'; await t.w.onCepInput(c2);
ok(t.d.getElementById('pfHood').value === 'Pinheiros' && t.fetchLog.some(u => u.includes('viacep')), 'Se a AwesomeAPI falhar, usa o ViaCEP');

// 5) CEP inexistente e CEP fora de SP
t = await boot({ seed: seedNew, cepApi: () => json({}, 404) });
const c3 = t.d.getElementById('pfCep'); c3.value = '99999999'; await t.w.onCepInput(c3);
ok(/não encontrado/.test(t.d.getElementById('toast').textContent), 'CEP inexistente mostra aviso');
await t.w.saveProfile();
ok(/Aguarde o endereço/.test(t.d.getElementById('pfErr').textContent), 'Não salva sem endereço válido');
t = await boot({ seed: seedNew, cepApi: () => json({ address: 'Av. Afonso Pena', district: 'Centro', city: 'Belo Horizonte', lat: '-19.9', lng: '-43.9' }) });
const c4 = t.d.getElementById('pfCep'); c4.value = '30130000'; await t.w.onCepInput(c4);
ok(/só na cidade de São Paulo/.test(t.d.getElementById('toast').textContent), 'CEP fora de São Paulo avisa que os grupos estão só em SP');

console.log(`\n${pass} passaram, ${fail} falharam`); process.exit(fail ? 1 : 0);
