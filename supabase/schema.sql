-- =====================================================================
-- Quadra Cheia: banco de dados e regras de acesso (Supabase / Postgres)
-- Como usar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Rodar uma única vez em um projeto novo.
--
-- Princípios:
-- 1. Minimização (LGPD): só guardamos o necessário. Telefone não é coletado;
--    CEP e coordenadas da casa do usuário ficam numa tabela que só o dono lê.
-- 2. Regras de negócio no servidor, não só na tela: link do WhatsApp só para
--    aceitos, limite de vagas, consentimento obrigatório, bloqueio com efeito.
-- 3. RLS (Row Level Security) ligado em todas as tabelas: sem política
--    explícita, ninguém lê nem escreve nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Perfil público: o que outros usuários (organizadores) podem ver.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 60),
  hood        text check (char_length(hood) <= 60),              -- bairro
  days        text[] not null default '{}'                       -- disponibilidade: dias
              check (days <@ array['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']),
  periods     text[] not null default '{}'                       -- disponibilidade: períodos
              check (periods <@ array['Manhã','Tarde','Noite']),
  photo_url   text,
  created_at  timestamptz not null default now()
);

-- Dados pessoais privados: só o próprio usuário lê e altera.
create table public.profiles_private (
  id                 uuid primary key references public.profiles(id) on delete cascade,
  cep                text check (cep ~ '^[0-9]{5}-?[0-9]{3}$'),
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),
  accepted_terms_at  timestamptz not null                         -- prova do consentimento
);

-- Modalidades e nível declarados pelo atleta.
create table public.profile_sports (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  sport    text not null check (sport in ('Vôlei','Vôlei de areia','Futsal','Basquete','Handebol','Beach tennis')),
  level    text not null check (level in ('Iniciante','Intermediário','Avançado')),
  primary key (user_id, sport)
);

-- Grupos / vagas publicados por organizadores.
-- lat/lng aqui são do LOCAL DO JOGO (quadra), não da casa do organizador.
create table public.groups (
  id            bigint generated always as identity primary key,
  organizer_id  uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(name) between 3 and 40),
  sport         text not null check (sport in ('Vôlei','Vôlei de areia','Futsal','Basquete','Handebol','Beach tennis')),
  hood          text not null check (char_length(hood) between 2 and 60),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  day           text not null check (day in ('Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo')),
  start_time    time not null,
  level         text not null check (level in ('Iniciante','Intermediário','Avançado','Todos os níveis')),
  format        text not null default 'Misto' check (format in ('Misto','Feminino','Masculino')),
  spots         int  not null check (spots between 1 and 20),
  cost          text not null default 'A combinar' check (char_length(cost) <= 40),
  rules         text check (char_length(rules) <= 500),
  confirmed_at  timestamptz,               -- última partida confirmada: alimenta o "status de atividade recente"
  listed        boolean not null default true,   -- false = grupo pausado, some da busca
  created_at    timestamptz not null default now()
);

-- Link da comunidade do WhatsApp em tabela separada, para que a regra de
-- acesso seja simples e verificável: só organizador e aceitos leem.
create table public.group_secrets (
  group_id       bigint primary key references public.groups(id) on delete cascade,
  whatsapp_link  text not null check (whatsapp_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$')
);

-- Solicitações de entrada.
create table public.join_requests (
  id          bigint generated always as identity primary key,
  group_id    bigint not null references public.groups(id) on delete cascade,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  message     text check (char_length(message) <= 300),
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (group_id, user_id)
);

-- Denúncias: o usuário só cria e vê as suas; o time revisa pelo painel do Supabase.
create table public.reports (
  id                bigint generated always as identity primary key,
  reporter_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reported_user_id  uuid references public.profiles(id) on delete set null,
  group_id          bigint references public.groups(id) on delete set null,
  reason            text not null check (char_length(reason) between 3 and 500),
  created_at        timestamptz not null default now()
);

-- Bloqueios: quem bloqueou deixa de ver e de ser visto pela outra pessoa.
create table public.blocks (
  blocker_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index on public.groups (sport) where listed;
create index on public.join_requests (group_id);
create index on public.join_requests (user_id);


-- ---------------------------------------------------------------------
-- 2. Funções auxiliares
-- security definer: rodam com permissão do dono, para consultar tabelas
-- protegidas sem expor as linhas e sem recursão entre políticas.
-- ---------------------------------------------------------------------

-- Existe bloqueio entre duas pessoas (em qualquer direção)?
create function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- O usuário logado organiza este grupo?
create function public.is_group_organizer(gid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = gid and organizer_id = auth.uid());
$$;

-- Vagas que ainda sobram num grupo (vagas - aceitos). Campo calculado:
-- a busca pede groups.select('..., spots_left'). Só o número sai daqui;
-- as solicitações dos outros continuam invisíveis.
create function public.spots_left(g public.groups)
returns int language sql stable security definer set search_path = '' as $$
  select g.spots - (select count(*)::int from public.join_requests r
                    where r.group_id = g.id and r.status = 'accepted');
$$;

-- O usuário logado pode pedir para entrar neste grupo?
-- (grupo listado, não é o próprio organizador, sem bloqueio entre os dois, não lotado)
create function public.can_request(gid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.listed
      and g.organizer_id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), g.organizer_id)
      and public.spots_left(g) > 0
  );
$$;

-- O usuário logado foi aceito neste grupo?
create function public.is_accepted_member(gid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.join_requests
    where group_id = gid and user_id = auth.uid() and status = 'accepted'
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Gatilhos (regras de negócio garantidas pelo banco)
-- ---------------------------------------------------------------------

-- Cria o perfil quando a conta é criada. O consentimento com os termos é
-- exigido aqui: sem ele, o cadastro falha mesmo se alguém burlar a tela.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(meta->>'accepted_terms', 'false') <> 'true' then
    raise exception 'É preciso aceitar os termos de uso e a política de privacidade.';
  end if;
  insert into public.profiles (id, name)
    values (new.id, left(coalesce(nullif(trim(meta->>'name'), ''), 'Atleta'), 60));
  insert into public.profiles_private (id, accepted_terms_at)
    values (new.id, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Organizador só muda o status da solicitação. Também impede aceitar
-- mais pessoas do que o número de vagas.
create function public.guard_join_request_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  max_spots int;
  accepted  int;
begin
  if new.group_id <> old.group_id or new.user_id <> old.user_id
     or new.message is distinct from old.message or new.created_at <> old.created_at then
    raise exception 'Só o status da solicitação pode ser alterado.';
  end if;
  if new.status <> old.status then
    new.decided_at := now();
    if new.status = 'accepted' then
      select spots into max_spots from public.groups where id = new.group_id;
      select count(*) into accepted from public.join_requests
        where group_id = new.group_id and status = 'accepted' and id <> new.id;
      if accepted >= max_spots then
        raise exception 'Todas as vagas deste grupo já foram preenchidas.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger join_requests_guard
  before update on public.join_requests
  for each row execute function public.guard_join_request_update();


-- ---------------------------------------------------------------------
-- 4. Políticas de acesso (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.profiles_private enable row level security;
alter table public.profile_sports   enable row level security;
alter table public.groups           enable row level security;
alter table public.group_secrets    enable row level security;
alter table public.join_requests    enable row level security;
alter table public.reports          enable row level security;
alter table public.blocks           enable row level security;

-- profiles: qualquer usuário logado vê perfis públicos, exceto de quem há bloqueio.
create policy "perfis visíveis a usuários logados" on public.profiles
  for select to authenticated
  using (not public.is_blocked_between(auth.uid(), id));
create policy "usuário edita o próprio perfil" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- profiles_private: só o dono.
create policy "dono lê seus dados privados" on public.profiles_private
  for select to authenticated using (id = auth.uid());
create policy "dono edita seus dados privados" on public.profiles_private
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- profile_sports: leitura como os perfis; escrita só do dono.
create policy "modalidades visíveis" on public.profile_sports
  for select to authenticated
  using (not public.is_blocked_between(auth.uid(), user_id));
create policy "dono gerencia suas modalidades" on public.profile_sports
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- groups: busca mostra grupos listados, sem bloqueio; organizador vê os seus sempre.
create policy "grupos visíveis na busca" on public.groups
  for select to authenticated
  using (organizer_id = auth.uid()
         or (listed and not public.is_blocked_between(auth.uid(), organizer_id)));
create policy "organizador cria grupo" on public.groups
  for insert to authenticated with check (organizer_id = auth.uid());
create policy "organizador edita seu grupo" on public.groups
  for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "organizador apaga seu grupo" on public.groups
  for delete to authenticated using (organizer_id = auth.uid());

-- group_secrets: A REGRA CENTRAL. O link só chega a organizador e aceitos.
create policy "link só para organizador e aceitos" on public.group_secrets
  for select to authenticated
  using (public.is_group_organizer(group_id) or public.is_accepted_member(group_id));
create policy "organizador gerencia o link" on public.group_secrets
  for all to authenticated
  using (public.is_group_organizer(group_id))
  with check (public.is_group_organizer(group_id));

-- join_requests: o atleta vê as suas; o organizador vê as do seu grupo.
create policy "atleta e organizador veem a solicitação" on public.join_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_organizer(group_id));
create policy "atleta pede para entrar" on public.join_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_at is null
              and public.can_request(group_id));
create policy "organizador aceita ou recusa" on public.join_requests
  for update to authenticated
  using (public.is_group_organizer(group_id))
  with check (public.is_group_organizer(group_id));
-- Solicitação recusada não pode ser apagada pelo atleta: senão ele contornaria a recusa pedindo de novo.
create policy "atleta cancela ou desiste" on public.join_requests
  for delete to authenticated using (user_id = auth.uid() and status <> 'declined');

-- reports: cria e vê só as próprias denúncias.
create policy "usuário denuncia" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "usuário vê suas denúncias" on public.reports
  for select to authenticated using (reporter_id = auth.uid());

-- blocks: só quem bloqueou enxerga e desfaz o bloqueio.
create policy "usuário gerencia seus bloqueios" on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());


-- ---------------------------------------------------------------------
-- 5. Exclusão de conta (direito do titular, LGPD art. 18)
-- Apaga o usuário e, em cascata, perfil, grupos, solicitações e bloqueios.
-- ---------------------------------------------------------------------
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
