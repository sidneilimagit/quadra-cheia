// Como rodar: npm i @electric-sql/pglite && node testes/regras-de-acesso.mjs supabase/schema.sql
// Testa supabase/schema.sql num Postgres embutido, simulando o ambiente do Supabase
// (schema auth, auth.uid(), papéis anon/authenticated).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(process.argv[2], 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(schema);
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to anon, authenticated;
`);

const U = { A:'aaaaaaaa-0000-0000-0000-000000000001', B:'bbbbbbbb-0000-0000-0000-000000000002',
            C:'cccccccc-0000-0000-0000-000000000003' };
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '✅' : '❌') + ' ' + msg); };

async function as(user, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ? U[user] : '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role'); }
}
async function signup(id, meta) {
  try { await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [id, id + '@x.com', meta]); return null; }
  catch (e) { return e.message; }
}

// --- Cadastro e consentimento
ok(/termos/.test(await signup('dddddddd-0000-0000-0000-000000000004', { name: 'Sem termos' })), 'Cadastro sem aceitar os termos é recusado pelo banco');
ok(!await signup(U.A, { name: 'Rafael', accepted_terms: true }), 'Cadastro com termos aceitos cria a conta (Rafael, organizador)');
await signup(U.B, { name: 'Larissa', accepted_terms: true });
await signup(U.C, { name: 'Carlos', accepted_terms: true });
ok((await as('A', 'select * from profiles where id=$1', [U.A])).rows.length === 1, 'Perfil público criado automaticamente');

// --- Dados privados
await as('B', `update profiles_private set cep='04101-000', lat=-23.59, lng=-46.63 where id=$1`, [U.B]);
ok((await as('B', 'select cep from profiles_private')).rows.length === 1, 'Larissa lê o próprio CEP');
ok((await as('A', 'select cep from profiles_private where id=$1', [U.B])).rows.length === 0, 'Rafael NÃO lê CEP/coordenadas da Larissa');

// --- Grupos
const g = await as('A', `insert into groups (organizer_id,name,sport,hood,day,start_time,level,spots)
                          values ($1,'Basquete Roosevelt','Basquete','Consolação','Sábado','16:00','Todos os níveis',1) returning id`, [U.A]);
const gid = g.rows[0].id;
ok(!!gid, 'Organizador publica grupo');
ok(!!(await as('B', `insert into groups (organizer_id,name,sport,hood,day,start_time,level,spots)
                      values ($1,'Falso','Vôlei','Moema','Sábado','10:00','Iniciante',2)`, [U.A])).error, 'Ninguém publica grupo em nome de outra pessoa');
ok(!!(await as('A', `insert into groups (organizer_id,name,sport,hood,day,start_time,level,spots)
                      values ($1,'Grande','Vôlei','Moema','Sábado','10:00','Iniciante',25)`, [U.A])).error, 'Limite de 1 a 20 vagas garantido pelo banco');
await as('A', `insert into group_secrets values ($1,'https://chat.whatsapp.com/AbC123')`, [gid]);
ok(!!(await as('A', `update group_secrets set whatsapp_link='https://site-falso.com/x' where group_id=$1`, [gid])).error, 'Link que não é do WhatsApp é recusado');
ok((await as('B', 'select * from groups')).rows.length === 1, 'Larissa encontra o grupo na busca');
ok((await as(null, 'select * from groups')).rows.length === 0, 'Visitante sem login não vê nenhum grupo');
ok((await as('B', 'select * from group_secrets')).rows.length === 0, 'Larissa NÃO vê o link do WhatsApp antes do aceite');
ok((await as('B', `update groups set name='Hackeado' where id=$1 returning id`, [gid])).rows?.length === 0, 'Larissa não edita grupo de outra pessoa');

// --- Solicitações
ok(!(await as('B', 'insert into join_requests (group_id,user_id,message) values ($1,$2,$3)', [gid, U.B, 'Quero jogar!'])).error, 'Larissa pede para entrar');
ok(!(await as('C', 'insert into join_requests (group_id,user_id) values ($1,$2)', [gid, U.C])).error, 'Carlos pede para entrar');
ok(!!(await as('A', 'insert into join_requests (group_id,user_id) values ($1,$2)', [gid, U.A])).error, 'Organizador não pede para entrar no próprio grupo');
ok(!!(await as('B', `insert into join_requests (group_id,user_id,status) values ($1,$2,'accepted')`, [gid, U.C])).error, 'Ninguém cria solicitação em nome de outro nem já aceita');
ok((await as('B', `update join_requests set status='accepted' where user_id=$1 returning id`, [U.B])).rows?.length === 0, 'Larissa NÃO consegue se autoaceitar');
ok((await as('B', 'select * from join_requests')).rows.length === 1, 'Larissa vê só a própria solicitação, não a do Carlos');
ok((await as('A', 'select * from join_requests')).rows.length === 2, 'Organizador vê as 2 solicitações do seu grupo');
ok(!!(await as('A', `update join_requests set message='editada' where user_id=$1`, [U.B])).error, 'Organizador não altera a mensagem do candidato');
ok(!(await as('A', `update join_requests set status='accepted' where user_id=$1`, [U.B])).error, 'Organizador aceita Larissa');
ok((await as('B', 'select whatsapp_link from group_secrets')).rows.length === 1, 'Depois do aceite, Larissa recebe o link do WhatsApp');
ok((await as('C', 'select whatsapp_link from group_secrets')).rows.length === 0, 'Carlos (ainda pendente) continua sem o link');
ok(/vagas/.test((await as('A', `update join_requests set status='accepted' where user_id=$1`, [U.C])).error || ''), 'Aceitar além do número de vagas é recusado (grupo lotado)');
ok((await as('C', 'select public.spots_left(g) as s from groups g')).rows[0]?.s === 0, 'Quem busca vê só o número de vagas restantes (0), sem ver as solicitações');
const g2 = (await as('A', `insert into groups (organizer_id,name,sport,hood,day,start_time,level,spots)
                           values ($1,'Vôlei Moema','Vôlei','Moema','Terça','20:00','Intermediário',3) returning id`, [U.A])).rows[0].id;
ok((await as('B', 'select public.spots_left(g) as s from groups g where id=$1', [g2])).rows[0]?.s === 3, 'Grupo novo mostra todas as vagas restantes');
await db.query('delete from join_requests where user_id=$1', [U.C]);
ok(!!(await as('C', 'insert into join_requests (group_id,user_id) values ($1,$2)', [gid, U.C])).error, 'Não dá para pedir entrada em grupo lotado');
await db.query('delete from groups where id=$1', [g2]);
const g3 = (await db.query(`insert into groups (organizer_id,name,sport,hood,day,start_time,level,spots) values ($1,'Futsal Mooca','Futsal','Mooca','Segunda','20:00','Intermediário',5) returning id`, [U.A])).rows[0].id;
await db.query(`insert into join_requests (group_id,user_id,status) values ($1,$2,'declined')`, [g3, U.C]);
await as('C', 'delete from join_requests where group_id=$1', [g3]);
ok((await db.query('select 1 from join_requests where group_id=$1 and user_id=$2', [g3, U.C])).rows.length === 1, 'Atleta recusado não consegue apagar a recusa para pedir de novo');
await db.query('delete from groups where id=$1', [g3]);

// --- Denúncia e bloqueio
ok(!(await as('C', `insert into reports (reported_user_id, group_id, reason) values ($1,$2,'Comentário ofensivo')`, [U.A, gid])).error, 'Carlos registra denúncia');
ok((await as('A', 'select * from reports')).rows.length === 0, 'Denunciado não vê a denúncia');
await as('C', `delete from join_requests where user_id=$1`, [U.C]);
ok(!(await as('C', 'insert into blocks (blocked_id) values ($1)', [U.A])).error, 'Carlos bloqueia o organizador');
ok((await as('C', 'select * from groups')).rows.length === 0, 'Após o bloqueio, Carlos não vê mais o grupo dele');
ok(!!(await as('C', 'insert into join_requests (group_id,user_id) values ($1,$2)', [gid, U.C])).error, 'Após o bloqueio, Carlos não consegue pedir entrada');
ok((await as('A', 'select * from profiles where id=$1', [U.C])).rows.length === 0, 'Organizador bloqueado não vê o perfil do Carlos');
ok((await as('A', 'select * from blocks')).rows.length === 0, 'Organizador não fica sabendo quem o bloqueou');

// --- Exclusão de conta
ok(!!(await as(null, 'select delete_my_account()')).error, 'Visitante não executa exclusão de conta');
ok(!(await as('B', 'select delete_my_account()')).error, 'Larissa exclui a própria conta');
ok((await as('A', 'select * from join_requests')).rows.length === 0, 'Exclusão apaga em cascata as solicitações dela');
ok((await db.query('select * from profiles_private where id=$1', [U.B])).rows.length === 0, 'Exclusão apaga os dados privados dela');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
