// Como rodar: npm i jsdom && node testes/telas-autenticacao.mjs index.html
// Testa os fluxos de cadastro/verificação/login do index.html com um Supabase falso.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ ') + m); };
const tick = () => new Promise(r => setTimeout(r, 30));

function makeMock(opts = {}) {
  const calls = [];
  let session = opts.session || null;
  const users = { 'larissa@x.com': { pass: 'senha1234', confirmed: !!opts.confirmed, id: 'u-1' } };
  const q = (table) => {
    const b = { _t: table, select(_c, o) { this._head = o && o.head; return this; }, eq() { return this; }, neq() { return this; }, order() { return this; }, update(v) { calls.push(['update', table, v]); return this; },
      maybeSingle: async () => ({ data: table === 'profiles' ? { name: 'Larissa', hood: '' } : null }),
      then(res) { res({ data: opts.onboarded ? [{ sport: 'Vôlei', level: 'Iniciante' }] : [], error: null }); } };
    return b;
  };
  return { calls, client: {
    auth: {
      async signUp(a) { calls.push(['signUp', a]);
        if (users[a.email] && a.email !== 'nova@x.com') return { data: { user: { identities: [] } }, error: null };
        users[a.email] = { pass: a.password, confirmed: false, id: 'u-2' }; return { data: { user: { identities: [{}] } }, error: null }; },
      async verifyOtp(a) { calls.push(['verifyOtp', a]);
        if (a.token !== '123456') return { error: { message: 'Token has expired or is invalid' } };
        users[a.email].confirmed = true; session = { user: { id: users[a.email].id, email: a.email } }; return { error: null }; },
      async resend(a) { calls.push(['resend', a]); return { error: null }; },
      async signInWithPassword(a) { calls.push(['signIn', a]); const u = users[a.email];
        if (!u || u.pass !== a.password) return { error: { message: 'Invalid login credentials' } };
        if (!u.confirmed) return { error: { message: 'Email not confirmed' } };
        session = { user: { id: u.id, email: a.email } }; return { error: null }; },
      async signOut(o) { calls.push(['signOut', o]); session = null; return { error: null }; },
      async getSession() { return { data: { session } }; },
      async getUser() { return { data: { user: session && session.user } }; },
    },
    from: q,
    async rpc(n) { calls.push(['rpc', n]); return { error: null }; },
  } };
}
async function boot(opts) {
  const mock = makeMock(opts);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.supabase = { createClient: () => mock.client }; } });
  await tick(); await tick();
  const w = dom.window, d = w.document;
  const active = () => d.querySelector('.screen.active')?.id;
  const set = (id, v) => { d.getElementById(id).value = v; };
  return { w, d, active, set, mock };
}

// 1) Sem sessão: abre na boas-vindas
let t = await boot({});
ok(t.active() === 'welcome', 'Sem sessão, abre na tela de boas-vindas');
ok(!t.d.getElementById('suPhone'), 'Campo de telefone foi removido do cadastro');

// 2) Validações do cadastro
t.w.go('signup');
t.set('suName', 'Ana'); t.set('suEmail', 'nova@x.com'); t.set('suPass', '123');
await t.w.doSignup(); ok(/8 caracteres/.test(t.d.getElementById('suErr').textContent), 'Senha curta é recusada');
t.set('suPass', 'senhaforte1'); t.set('suEmail', 'nao-e-email');
await t.w.doSignup(); ok(/e-mail válido/.test(t.d.getElementById('suErr').textContent), 'E-mail inválido é recusado');
t.set('suEmail', 'nova@x.com');
await t.w.doSignup(); ok(/aceite os termos/.test(t.d.getElementById('suErr').textContent), 'Sem aceitar os termos não cadastra');
ok(!t.mock.calls.some(c => c[0] === 'signUp'), 'Nada foi enviado ao servidor enquanto o formulário era inválido');
t.d.getElementById('suTerms').checked = true;
await t.w.doSignup();
const su = t.mock.calls.find(c => c[0] === 'signUp');
ok(su && su[1].options.data.accepted_terms === true && su[1].options.data.name === 'Ana', 'Cadastro envia nome e aceite dos termos');
ok(t.active() === 'verify' && t.d.getElementById('vEmail').textContent === 'nova@x.com', 'Vai para a verificação mostrando o e-mail');

// 3) Verificação
t.set('vCode', '999999'); await t.w.doVerify();
ok(/inválido ou expirado/.test(t.d.getElementById('vErr').textContent), 'Código errado mostra erro em português');
t.set('vCode', '123456'); await t.w.doVerify();
ok(t.active() === 'profile', 'Código certo entra e leva a montar o perfil');

// 4) E-mail já cadastrado
t = await boot({});
t.w.go('signup'); t.set('suName', 'Lari'); t.set('suEmail', 'larissa@x.com'); t.set('suPass', 'senha1234');
t.d.getElementById('suTerms').checked = true; await t.w.doSignup();
ok(/já tem conta/.test(t.d.getElementById('suErr').textContent), 'E-mail já cadastrado é avisado');

// 5) Login
t.w.go('login'); t.set('lgEmail', 'larissa@x.com'); t.set('lgPass', 'errada');
await t.w.doLogin(); ok(/incorretos/.test(t.d.getElementById('lgErr').textContent), 'Senha errada: "E-mail ou senha incorretos"');
t.set('lgPass', 'senha1234'); await t.w.doLogin();
ok(t.active() === 'verify' && t.mock.calls.some(c => c[0] === 'resend'), 'Conta não confirmada: reenvia código e vai à verificação');

t = await boot({ confirmed: true, onboarded: true });
t.w.go('login'); t.set('lgEmail', 'Larissa@X.com'); t.set('lgPass', 'senha1234');
await t.w.doLogin(); ok(t.active() === 'search', 'Login de quem já tem perfil vai direto para a busca');
ok(t.w.eval('state.user.name') === 'Larissa', 'Nome vem do perfil salvo no banco');
ok(t.d.getElementById('lgPass').value === '', 'Senha é apagada do campo depois do login');

// 6) Sessão salva e sair
t = await boot({ session: { user: { id: 'u-1', email: 'larissa@x.com' } }, onboarded: true });
ok(t.active() === 'search', 'Com sessão salva, reabre direto na busca');
await t.w.logout();
ok(t.active() === 'welcome' && t.mock.calls.some(c => c[0] === 'signOut') && !t.w.eval('state.user.id'), 'Sair encerra a sessão e limpa os dados da tela');

// 6b) Configurações: nome e exclusão de conta
t = await boot({ session: { user: { id: 'u-1', email: 'larissa@x.com' } }, onboarded: true });
t.w.openSettings();
ok(t.d.getElementById('stName').value === 'Larissa', 'Configurações mostram o nome atual');
t.set('stName', 'Lari Souza'); await t.w.saveName();
ok(t.mock.calls.some(c => c[0] === 'update' && c[1] === 'profiles' && c[2].name === 'Lari Souza'), 'Troca de nome é gravada no perfil');
t.w.confirmDeleteAccount(); t.set('delConfirm', 'sim'); await t.w.deleteAccount();
ok(!t.mock.calls.some(c => c[0] === 'rpc'), 'Exclusão exige digitar EXCLUIR');
t.set('delConfirm', 'excluir'); await t.w.deleteAccount();
ok(t.mock.calls.some(c => c[0] === 'rpc' && c[1] === 'delete_my_account'), 'Exclusão chama a função do banco que apaga tudo em cascata');
ok(t.active() === 'welcome' && !t.w.eval('state.user.id') && t.mock.calls.some(c => c[0] === 'signOut' && c[1] && c[1].scope === 'local'), 'Depois de excluir, sai da conta e volta para a boas-vindas');

// 7) Termos
t.w.openTerms(); ok(/LGPD/.test(t.d.getElementById('mBody').textContent), 'Termos de uso abrem em janela');

console.log(`\n${pass} passaram, ${fail} falharam`); process.exit(fail ? 1 : 0);
