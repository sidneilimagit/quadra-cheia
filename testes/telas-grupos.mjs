// Como rodar: npm i jsdom && node testes/telas-grupos.mjs index.html
// Jornada completa com duas pessoas no navegador simulado, compartilhando um "banco" em memória:
// Rafael (organizador) cria grupo → Larissa (atleta) busca, filtra e pede entrada →
// Rafael aceita → Larissa recebe o link do WhatsApp. Inclui distância real, lotação,
// denúncia, bloqueio e regras básicas de visibilidade imitando as do banco.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ ') + m); };
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms));

// ---------- "banco" compartilhado ----------
const DB = {
  profiles: [
    { id: 'raf', name: 'Rafael', hood: 'Consolação', days: ['Sábado'], periods: ['Tarde'] },
    { id: 'lar', name: 'Larissa', hood: 'Vila Mariana', days: ['Sábado', 'Quarta'], periods: ['Manhã', 'Noite'] },
    { id: 'car', name: 'Carlos', hood: 'Mooca', days: ['Sábado'], periods: ['Manhã'] },
  ],
  profiles_private: [
    { id: 'raf', cep: '01302-000', lat: -23.548, lng: -46.651 },
    { id: 'lar', cep: '04101-000', lat: -23.5891, lng: -46.6349 },   // Vila Mariana
    { id: 'car', cep: '03103-000', lat: -23.556, lng: -46.598 },
  ],
  profile_sports: [
    { user_id: 'raf', sport: 'Vôlei de areia', level: 'Avançado' },
    { user_id: 'lar', sport: 'Vôlei de areia', level: 'Iniciante' },
    { user_id: 'car', sport: 'Vôlei de areia', level: 'Intermediário' },
  ],
  groups: [], group_secrets: [], join_requests: [], reports: [], blocks: [],
};
let seq = 1;
const blockedBetween = (a, b) => DB.blocks.some(x => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
const spotsLeft = g => g.spots - DB.join_requests.filter(r => r.group_id === g.id && r.status === 'accepted').length;

function makeClient(uid) {
  const user = { id: uid, email: uid + '@x.com' };
  const visible = (table) => {
    const rows = DB[table];
    if (table === 'groups') return rows.filter(g => g.organizer_id === uid || (g.listed && !blockedBetween(uid, g.organizer_id)));
    if (table === 'group_secrets') return rows.filter(s => { const g = DB.groups.find(x => x.id === s.group_id);
      return g && (g.organizer_id === uid || DB.join_requests.some(r => r.group_id === g.id && r.user_id === uid && r.status === 'accepted')); });
    if (table === 'join_requests') return rows.filter(r => r.user_id === uid || DB.groups.find(g => g.id === r.group_id)?.organizer_id === uid);
    if (table === 'profiles') return rows.filter(p => !blockedBetween(uid, p.id));
    if (table === 'profiles_private') return rows.filter(p => p.id === uid);
    return rows;
  };
  const shape = (table, cols, r) => {
    const o = { ...r };
    if (table === 'groups') {
      if (cols.includes('spots_left')) o.spots_left = spotsLeft(r);
      if (cols.includes('organizer:profiles')) { const p = visible('profiles').find(p => p.id === r.organizer_id); o.organizer = p ? { name: p.name } : null; }
      if (cols.includes('join_requests(status)')) o.join_requests = visible('join_requests').filter(j => j.group_id === r.id).map(j => ({ status: j.status }));
    }
    if (table === 'join_requests') {
      if (cols.includes('group:groups')) o.group = visible('groups').find(g => g.id === r.group_id) || null;
      if (cols.includes('user:profiles')) { const p = visible('profiles').find(p => p.id === r.user_id);
        o.user = p ? { ...p, profile_sports: DB.profile_sports.filter(s => s.user_id === p.id) } : null; }
    }
    return o;
  };
  const from = (table) => {
    let op = 'select', payload, cols = '', filters = [], single = false, retSelect = false, upsert = false;
    const run = () => {
      const err = m => ({ data: null, error: { message: m } });
      if (op === 'insert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const n of rows) {
          if (table === 'groups') { if (n.organizer_id !== uid) return err('new row violates row-level security policy'); if (n.spots < 1 || n.spots > 20) return err('violates check constraint'); n.id = seq++; n.listed ??= true; }
          if (table === 'join_requests') {
            const g = DB.groups.find(x => x.id === n.group_id);
            if (n.user_id !== uid || !g || !g.listed || g.organizer_id === uid || blockedBetween(uid, g.organizer_id) || spotsLeft(g) <= 0) return err('new row violates row-level security policy');
            if (DB.join_requests.some(r => r.group_id === n.group_id && r.user_id === uid)) return err('duplicate key value violates unique constraint');
            Object.assign(n, { id: seq++, status: 'pending', created_at: new Date().toISOString(), decided_at: null });
          }
          if (table === 'group_secrets') { const g = DB.groups.find(x => x.id === n.group_id); if (!g || g.organizer_id !== uid) return err('row-level security'); if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(n.whatsapp_link)) return err('check constraint'); }
          if (table === 'blocks' && DB.blocks.some(b => b.blocker_id === n.blocker_id && b.blocked_id === n.blocked_id)) return err('duplicate key');
          if (upsert && table === 'group_secrets') { const i = DB.group_secrets.findIndex(s => s.group_id === n.group_id); if (i > -1) { DB.group_secrets[i] = n; continue; } }
          DB[table].push(n);
        }
        return { data: retSelect ? (single ? rows[0] : rows) : null, error: null };
      }
      const rows = visible(table).filter(r => filters.every(f => f(r)));
      if (op === 'update') {
        for (const r of rows) {
          if (table === 'join_requests' && payload.status && payload.status !== r.status) {
            const g = DB.groups.find(x => x.id === r.group_id);
            if (g.organizer_id !== uid) continue;
            if (payload.status === 'accepted' && spotsLeft(g) <= 0) return err('Todas as vagas deste grupo já foram preenchidas.');
            r.decided_at = new Date().toISOString();
          }
          if (table === 'groups' && r.organizer_id !== uid) continue;
          Object.assign(r, payload);
        }
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const del = rows.filter(r => table !== 'join_requests' || (r.user_id === uid && r.status !== 'declined'));
        DB[table] = DB[table].filter(r => !del.includes(r));
        return { data: null, error: null };
      }
      const data = rows.map(r => shape(table, cols, r));
      return { data: single ? (data[0] || null) : data, count: data.length, error: null };
    };
    const b = {
      select(c = '*') { if (op === 'insert') retSelect = true; else op = 'select'; cols = c; return b; },
      insert(p) { op = 'insert'; payload = p; return b; },
      upsert(p, o) { if (table === 'profile_sports') { op = 'noop'; return b; } op = 'insert'; upsert = true; payload = p; return b; },
      update(p) { op = 'update'; payload = p; return b; },
      delete() { op = 'delete'; return b; },
      eq(c, v) { filters.push(r => r[c] === v); return b; },
      neq(c, v) { filters.push(r => r[c] !== v); return b; },
      not() { return b; }, order() { return b; },
      single() { single = true; return Promise.resolve(run()); },
      maybeSingle() { single = true; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(op === 'noop' ? { error: null } : run()).then(res, rej); },
    };
    return b;
  };
  return { from, auth: { getSession: async () => ({ data: { session: { user } } }), getUser: async () => ({ data: { user } }), signOut: async () => ({ error: null }) } };
}
const CEPS = { '01302000': { address: 'Rua Augusta', district: 'Consolação', city: 'São Paulo', lat: '-23.5530', lng: '-46.6530' },  // ~4,6 km da Larissa
               '04104000': { address: 'Rua Vergueiro', district: 'Vila Mariana', city: 'São Paulo', lat: '-23.5880', lng: '-46.6380' }, // ~0,4 km
               '08010000': { address: 'Rua X', district: 'São Miguel', city: 'São Paulo', lat: '-23.4980', lng: '-46.4440' } };    // ~21 km
async function as(uid) {
  const client = makeClient(uid);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.supabase = { createClient: () => client };
    w.fetch = async url => { const c = CEPS[url.match(/(\d{8})/)?.[1]]; return { ok: !!c, json: async () => c || {} }; };
  } });
  await wait(100);
  const w = dom.window, d = w.document;
  return { w, d, ev: e => w.eval(e), active: () => d.querySelector('.screen.active')?.id, txt: id => d.getElementById(id).textContent,
           set: (id, v) => { d.getElementById(id).value = v; } };
}
async function publish(t, f) {
  t.w.go('publish');
  t.set('pbName', f.name); t.set('pbSport', f.sport); t.set('pbDay', f.day); t.set('pbTime', f.time); t.set('pbLevel', f.level);
  t.set('pbSpots', String(f.spots)); t.set('pbFormat', f.format || 'Misto'); t.set('pbCost', f.cost || ''); t.set('pbRules', f.rules || ''); t.set('pbLink', f.link || '');
  t.d.getElementById('pbConfirmed').checked = !!f.confirmed;
  const cep = t.d.getElementById('pbCep'); cep.value = f.cep; await t.w.onPubCepInput(cep);
  await t.w.doPublish(); await wait();
}

// ===== Rafael cria grupos =====
let raf = await as('raf');
ok(raf.active() === 'search', 'Rafael (com perfil) entra direto na busca');
raf.w.go('publish');
await raf.w.doPublish();
ok(/nome ao grupo/.test(raf.txt('pbErr')), 'Criar grupo sem nome é recusado');
await publish(raf, { name: 'Areia da Augusta', sport: 'Vôlei de areia', cep: '01302000', day: 'Sábado', time: '09:00', level: 'Iniciante', spots: 1,
  cost: 'R$ 15', rules: '<b>Chegar cedo</b>', link: 'https://chat.whatsapp.com/ABCdef123?mode=ems_copy_t', confirmed: true, format: 'Feminino' });
const g1 = DB.groups[0];
ok(g1 && g1.hood === 'Consolação' && Math.abs(g1.lat + 23.553) < 1e-6, 'Grupo gravado com bairro e coordenadas da quadra (via CEP)');
ok(g1.format === 'Feminino' && g1.confirmed_at, 'Formato do grupo e confirmação de partida gravados');
ok(DB.group_secrets[0]?.whatsapp_link === 'https://chat.whatsapp.com/ABCdef123', 'Link do WhatsApp salvo à parte, sem o "?mode=..." do convite');
ok(!('whatsapp_link' in g1), 'O link NÃO fica na tabela pública de grupos');
ok(raf.active() === 'activity' && raf.ev('state.tab') === 'mine', 'Depois de criar, vai para "Meus grupos"');
await publish(raf, { name: 'Vôlei Vergueiro', sport: 'Vôlei', cep: '04104000', day: 'Quarta', time: '20:00', level: 'Intermediário', spots: 4 });
await publish(raf, { name: 'Longe Demais', sport: 'Vôlei de areia', cep: '08010000', day: 'Sábado', time: '10:00', level: 'Iniciante', spots: 3 });
ok(DB.groups.length === 3 && !DB.groups[1].confirmed_at, '3 grupos criados; o segundo sem confirmação de partida');
raf.w.go('search'); await wait();
ok(!raf.d.getElementById('results').textContent.includes('Areia da Augusta'), 'Organizador não vê os próprios grupos na busca');

// ===== Larissa busca =====
let lar = await as('lar');
const res = () => lar.txt('results');
ok(res().includes('Vôlei Vergueiro') && res().includes('Areia da Augusta'), 'Larissa encontra os grupos próximos');
ok(!res().includes('Longe Demais'), 'Grupo a ~21 km some com o filtro padrão de 6 km');
const cards = [...lar.d.querySelectorAll('#results .card h3')].map(h => h.textContent);
ok(cards[0] === 'Vôlei Vergueiro', 'Resultados ordenados do mais perto para o mais longe');
ok(/0,\d km/.test(res()) && /4,\d km/.test(res()), 'Distância real calculada (≈0,4 km e ≈4,6 km)');
ok(res().includes('Partida confirmada hoje') && res().includes('Aguardando confirmação'), 'Status de atividade recente aparece nos cards');
lar.d.getElementById('fKm').value = '10'; lar.w.applyFilters();
ok(!res().includes('Longe Demais'), 'Com 10 km, o grupo a 21 km continua fora');
lar.ev("state.filters.sport='Vôlei de areia'"); lar.w.applyFilters();
ok(res().includes('Areia da Augusta') && !res().includes('Vôlei Vergueiro'), 'Filtro por modalidade');
lar.ev("state.filters.sport='Todos';state.filters.periods=['Noite']"); lar.w.applyFilters();
ok(res().includes('Vôlei Vergueiro') && !res().includes('Areia da Augusta'), 'Filtro por período (20h = Noite)');
lar.ev("state.filters.periods=[];state.filters.levels=['Avançado']"); lar.w.applyFilters();
ok(/Nenhuma vaga/.test(res()), 'Filtro por nível sem resultado mostra mensagem de vazio');
lar.ev("state.filters.levels=[]"); lar.w.applyFilters();

// detalhe e XSS
await lar.w.openGroup(g1.id);
const gtxt = lar.txt('group');
ok(lar.active() === 'group' && gtxt.includes('Organizado por Rafael') && gtxt.includes('Feminino') && gtxt.includes('1 vaga de 1'), 'Página do grupo com organizador, formato e vagas');
ok(gtxt.includes('<b>Chegar cedo</b>') && !lar.d.querySelector('#group p b'), 'Texto digitado pelo organizador é exibido como texto (sem injeção de HTML)');
ok(!lar.d.getElementById('group').innerHTML.includes('chat.whatsapp.com'), 'Link do WhatsApp não aparece antes do aceite');

// pedir entrada
lar.set('reqMsg', 'Sou iniciante, posso ir?');
await lar.w.sendRequest(g1.id); await wait();
ok(DB.join_requests.length === 1 && DB.join_requests[0].message === 'Sou iniciante, posso ir?', 'Larissa pede entrada com mensagem');
ok(/aguardando resposta/.test(lar.txt('group')), 'Botão muda para "aguardando resposta"');
lar.w.go('activity'); await wait();
ok(/Aguardando/.test(lar.txt('activityList')) && /Areia da Augusta/.test(lar.txt('activityList')), 'Solicitação aparece em Atividade');

// Carlos também pede
let car = await as('car');
await car.w.openGroup(g1.id); car.set('reqMsg', ''); await car.w.sendRequest(g1.id); await wait();
ok(DB.join_requests.length === 2, 'Carlos também pede entrada');

// ===== Rafael responde =====
raf = await as('raf'); await wait(100);
ok(raf.ev('state.notifs').some(n => /Candidatos aguardando/.test(n.title)), 'Rafael recebe notificação de candidatos aguardando');
ok(raf.txt('bellBadge') !== '0', 'Sino mostra o contador');
raf.ev("state.tab='mine'"); raf.w.go('activity'); await wait();
ok(/2<\/b> candidato/.test(raf.d.getElementById('activityList').innerHTML), 'Meus grupos mostra 2 candidatos aguardando');
await raf.w.openCandidates(g1.id); await wait();
const ctxt = raf.txt('candidates');
ok(ctxt.includes('Larissa') && ctxt.includes('Iniciante') && ctxt.includes('Vila Mariana') && ctxt.includes('Sáb, Qua') && ctxt.includes('Sou iniciante, posso ir?'), 'Painel mostra nível na modalidade, bairro, disponibilidade e mensagem');
ok(!ctxt.includes('04101') && !ctxt.includes('@x.com'), 'Painel NÃO mostra CEP nem e-mail do candidato');
const larReq = DB.join_requests.find(r => r.user_id === 'lar'), carReq = DB.join_requests.find(r => r.user_id === 'car');
await raf.w.decide(larReq.id, 'accepted'); await wait();
ok(larReq.status === 'accepted' && larReq.decided_at, 'Rafael aceita Larissa');
await raf.w.decide(carReq.id, 'accepted'); await wait();
ok(carReq.status === 'pending' && /vagas/.test(raf.txt('toast')), 'Aceitar além das vagas é bloqueado com aviso');
await raf.w.decide(carReq.id, 'declined'); await wait();
ok(carReq.status === 'declined', 'Rafael recusa Carlos');
await raf.w.toggleConfirmed(); ok(!DB.groups[0].confirmed_at, 'Organizador remove a confirmação da partida');
await raf.w.toggleConfirmed(); ok(!!DB.groups[0].confirmed_at, 'E confirma de novo');
raf.set('cdLink', 'https://site-falso.com/x'); await raf.w.saveLink();
ok(DB.group_secrets[0].whatsapp_link === 'https://chat.whatsapp.com/ABCdef123', 'Link que não é do WhatsApp não é salvo');

// ===== Larissa recebe =====
lar = await as('lar'); await wait(100);
ok(lar.ev('state.notifs').some(n => n.title === 'Solicitação aceita'), 'Larissa é notificada do aceite');
await lar.w.joinWhats(g1.id);
ok(lar.d.querySelector('#mBody a')?.getAttribute('href') === 'https://chat.whatsapp.com/ABCdef123', 'Depois do aceite, Larissa recebe o link do WhatsApp');
lar.w.closeAll();
lar.w.go('search'); await wait();
ok(!lar.txt('results').includes('Areia da Augusta'), 'Grupo lotado sai da busca');

// Carlos recusado
car = await as('car'); await wait(100);
await car.w.joinWhats(g1.id);
ok(!car.d.querySelector('#mBody a'), 'Carlos (recusado) não recebe o link');
car.w.go('activity'); await wait();
ok(/Recusado/.test(car.txt('activityList')) && !/Cancelar/.test(car.txt('activityList')), 'Recusa aparece para Carlos, sem opção de apagar e pedir de novo');

// denúncia e bloqueio
await car.w.openGroup(DB.groups[1].id);
car.w.openReport('raf', DB.groups[1].id, 'organizador');
car.set('rpReason', 'Foi grosseiro no grupo');
await car.w.sendReport();
ok(DB.reports.length === 1 && DB.reports[0].reported_user_id === 'raf', 'Denúncia registrada no banco');
car.w.openReport('raf', DB.groups[1].id, 'organizador'); await car.w.confirmBlock(); await wait();
ok(DB.blocks.length === 1 && !car.txt('results').includes('Vôlei Vergueiro'), 'Após bloquear, Carlos não vê mais os grupos do Rafael');

// desistir da vaga
lar.w.go('activity'); await wait();
lar.w.confirmCancel(larReq.id); await lar.w.doCancel(larReq.id); await wait();
ok(!DB.join_requests.includes(larReq), 'Larissa desiste da vaga');
lar.w.go('search'); await wait();
ok(lar.txt('results').includes('Areia da Augusta'), 'Vaga liberada: grupo volta a aparecer na busca');

// pausar e excluir
raf = await as('raf'); await wait(100);
await raf.w.openCandidates(DB.groups[1].id); await raf.w.toggleListed();
ok(DB.groups[1].listed === false, 'Organizador pausa o grupo');
lar.w.go('search'); await wait();
ok(!lar.txt('results').includes('Vôlei Vergueiro'), 'Grupo pausado some da busca');
await raf.w.deleteGroup();
ok(DB.groups.length === 2, 'Organizador exclui o grupo');

console.log(`\n${pass} passaram, ${fail} falharam`); process.exit(fail ? 1 : 0);
