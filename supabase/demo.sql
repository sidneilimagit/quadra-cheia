-- =====================================================================
-- Quadra Cheia: dados de demonstração (para o avaliador e o vídeo)
--
-- ANTES DE RODAR:
-- 1. Crie 3 contas pelo próprio app (cadastro normal, com código por e-mail).
--    Dica: no Gmail, "seuemail+organizador@gmail.com" chega na sua caixa.
-- 2. Troque os 3 e-mails e o link abaixo (seção CONFIGURAÇÃO). Não faça commit
--    deste arquivo com e-mails reais.
-- 3. Supabase > SQL Editor > New query > colar > Run.
--
-- Pode rodar de novo: apaga os grupos de demonstração e recria.
-- Coordenadas são aproximadas (centro de cada bairro).
-- =====================================================================

do $$
declare
  -- ============ CONFIGURAÇÃO ============
  email_org   text := 'EMAIL_DO_ORGANIZADOR@exemplo.com';
  email_atl   text := 'EMAIL_DA_ATLETA@exemplo.com';
  email_cand  text := 'EMAIL_DA_CANDIDATA@exemplo.com';
  link_demo   text := 'https://chat.whatsapp.com/COLE_AQUI_O_CODIGO';  -- convite de uma comunidade de teste
  -- ======================================
  org uuid; atl uuid; cand uuid; g_areia bigint; g_moema bigint; g_beach bigint;
begin
  select id into org  from auth.users where lower(email) = lower(email_org);
  select id into atl  from auth.users where lower(email) = lower(email_atl);
  select id into cand from auth.users where lower(email) = lower(email_cand);
  if org is null or atl is null or cand is null then
    raise exception 'Conta não encontrada. Confira os 3 e-mails e se as contas foram criadas pelo app.';
  end if;

  -- Perfis
  update public.profiles set name = 'Rafael (demo)',  hood = 'Consolação',   days = '{Terça,Quinta,Sábado}', periods = '{Tarde,Noite}' where id = org;
  update public.profiles set name = 'Larissa (demo)', hood = 'Vila Mariana', days = '{Quarta,Sábado,Domingo}', periods = '{Manhã,Noite}' where id = atl;
  update public.profiles set name = 'Camila (demo)',  hood = 'Moema',        days = '{Sábado,Domingo}', periods = '{Manhã,Tarde}' where id = cand;
  update public.profiles_private set cep = '01302-000', lat = -23.5530, lng = -46.6600 where id = org;
  update public.profiles_private set cep = '04101-000', lat = -23.5891, lng = -46.6349 where id = atl;
  update public.profiles_private set cep = '04077-000', lat = -23.6010, lng = -46.6640 where id = cand;
  delete from public.profile_sports where user_id in (org, atl, cand);
  insert into public.profile_sports (user_id, sport, level) values
    (org, 'Basquete', 'Avançado'), (org, 'Vôlei', 'Intermediário'),
    (atl, 'Vôlei', 'Iniciante'), (atl, 'Vôlei de areia', 'Iniciante'), (atl, 'Beach tennis', 'Intermediário'),
    (cand, 'Vôlei de areia', 'Intermediário'), (cand, 'Beach tennis', 'Iniciante');

  -- Recomeça os grupos de demonstração
  delete from public.groups where organizer_id = org;

  insert into public.groups (organizer_id,name,sport,hood,lat,lng,day,start_time,level,format,spots,cost,rules,confirmed_at) values
   (org,'Areia da Vila','Vôlei de areia','Vila Mariana',-23.5880,-46.6380,'Sábado','09:00','Iniciante','Misto',4,'R$ 15 por pessoa','Chegar 10 min antes para montar a rede. Iniciantes são bem-vindos.', now() - interval '2 days')
   returning id into g_areia;
  insert into public.groups (organizer_id,name,sport,hood,lat,lng,day,start_time,level,format,spots,cost,rules,confirmed_at) values
   (org,'Vôlei de Quadra Moema','Vôlei','Moema',-23.6010,-46.6640,'Terça','20:00','Intermediário','Feminino',3,'R$ 12 por pessoa','Grupo acolhedor para quem está voltando a jogar. Rodízio a cada set.', now() - interval '4 days')
   returning id into g_moema;
  insert into public.groups (organizer_id,name,sport,hood,lat,lng,day,start_time,level,format,spots,cost,rules,confirmed_at) values
   (org,'Beach Tennis Ibirapuera','Beach tennis','Ibirapuera',-23.5874,-46.6576,'Domingo','08:00','Iniciante','Misto',2,'R$ 30 por pessoa','Raquetes emprestadas para quem está começando.', now() - interval '1 day')
   returning id into g_beach;
  insert into public.groups (organizer_id,name,sport,hood,lat,lng,day,start_time,level,format,spots,cost,rules,confirmed_at) values
   (org,'Quarta na Areia','Vôlei de areia','Paraíso',-23.5740,-46.6420,'Quarta','19:30','Intermediário','Misto',2,'R$ 20 por pessoa','Jogos de 2 horas. Trazer bola não é obrigatório.', now() - interval '1 day'),
   (org,'Duplas da Saúde','Beach tennis','Saúde',-23.6180,-46.6390,'Sexta','18:30','Intermediário','Misto',3,'R$ 25 por pessoa','Rodízio de duplas a cada 20 minutos.', now() - interval '5 days'),
   (org,'Basquete na Roosevelt','Basquete','Consolação',-23.5490,-46.6460,'Sábado','16:00','Todos os níveis','Misto',6,'Gratuito','Jogos de 3x3 em quadra pública. Quem chega entra na fila.', now() - interval '2 days'),
   (org,'Handebol Vila Mariana','Handebol','Vila Mariana',-23.5850,-46.6330,'Quinta','19:00','Iniciante','Misto',5,'R$ 10 por pessoa','Turma para quem está aprendendo. Treino de passe antes do jogo.', now() - interval '3 days'),
   (org,'Futsal da Mooca','Futsal','Mooca',-23.5590,-46.5990,'Segunda','20:30','Intermediário','Masculino',3,'R$ 15 por pessoa','Times de 5 com rodízio a cada 10 minutos.', now() - interval '6 days'),
   (org,'Vôlei Pinheiros','Vôlei','Pinheiros',-23.5670,-46.6930,'Quinta','21:00','Avançado','Misto',2,'R$ 18 por pessoa','Jogo competitivo, ritmo intenso.', null),
   (org,'Vôlei do Tatuapé','Vôlei','Tatuapé',-23.5400,-46.5760,'Domingo','10:00','Todos os níveis','Misto',4,'R$ 10 por pessoa','Partidas leves de domingo. Sem anúncio de partida há semanas.', now() - interval '20 days');

  -- Link da comunidade (só nos 3 primeiros; os outros mostram o aviso "link ainda não disponível")
  if link_demo ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$' and link_demo not like '%COLE_AQUI%' then
    insert into public.group_secrets (group_id, whatsapp_link) values (g_areia, link_demo), (g_moema, link_demo), (g_beach, link_demo);
  else
    raise notice 'Link do WhatsApp não configurado: os grupos ficam sem link.';
  end if;

  -- Solicitações: Larissa já aceita na Areia da Vila (mostra o link liberado);
  -- Camila aguardando em dois grupos (mostra o painel do organizador com candidatos).
  insert into public.join_requests (group_id, user_id, message, status, decided_at) values
    (g_areia, atl,  'Estou voltando a jogar depois de mudar para SP.', 'accepted', now() - interval '1 day'),
    (g_areia, cand, 'Jogo há dois anos, posso ajudar a completar o time.', 'pending', null),
    (g_beach, cand, 'Sou iniciante, tudo bem?', 'pending', null);

  raise notice 'Demonstração criada: 10 grupos, 3 solicitações.';
end $$;
