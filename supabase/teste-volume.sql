-- =====================================================================
-- Quadra Cheia: teste de volume (Bloco 4)
-- Cria 300 grupos fictícios espalhados pela cidade de São Paulo para medir
-- se a busca continua rápida. Todos têm o nome começando com "[VOLUME]".
--
-- 1. Troque o e-mail abaixo pelo de uma conta de ORGANIZADOR de demonstração.
-- 2. SQL Editor > New query > colar a PARTE 1 > Run.
-- 3. No app, entre com OUTRA conta (atleta), abra Buscar e meça o tempo:
--    F12 > aba Rede (Network) > recarregar > requisição "groups?select=..." > coluna Tempo.
-- 4. Depois, rode a PARTE 2 para apagar os grupos fictícios.
-- =====================================================================

-- ===== PARTE 1: criar 300 grupos =====
do $$
declare
  email_org text := 'EMAIL_DO_ORGANIZADOR@exemplo.com';
  org uuid;
  sports text[] := array['Vôlei','Vôlei de areia','Futsal','Basquete','Handebol','Beach tennis'];
  days   text[] := array['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  levels text[] := array['Iniciante','Intermediário','Avançado','Todos os níveis'];
begin
  select id into org from auth.users where lower(email) = lower(email_org);
  if org is null then raise exception 'Conta não encontrada. Troque o e-mail no início do script.'; end if;
  insert into public.groups (organizer_id,name,sport,hood,lat,lng,day,start_time,level,spots,cost,confirmed_at)
  select org,
         '[VOLUME] Grupo ' || i,
         sports[1 + i % 6], 'Teste de volume',
         -23.55 + (random() - 0.5) * 0.25,   -- faixa de ~28 km norte-sul
         -46.63 + (random() - 0.5) * 0.30,   -- faixa de ~30 km leste-oeste
         days[1 + i % 7],
         make_time(7 + i % 15, (i % 2) * 30, 0),
         levels[1 + i % 4], 1 + i % 10, 'R$ 10',
         now() - (i % 20) * interval '1 day'
  from generate_series(1, 300) as i;
  raise notice '300 grupos de teste criados.';
end $$;

-- ===== PARTE 2: apagar os grupos de teste (rodar separado, no fim) =====
-- delete from public.groups where name like '[VOLUME]%';
