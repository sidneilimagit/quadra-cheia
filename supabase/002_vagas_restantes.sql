-- =====================================================================
-- Quadra Cheia: atualização 002, vagas restantes
-- Rodar no SQL Editor do Supabase DEPOIS do schema.sql (uma única vez).
-- Projetos novos não precisam: o schema.sql já inclui isto.
-- =====================================================================

-- Vagas que ainda sobram num grupo (vagas - aceitos).
-- É um "campo calculado": a busca pede groups.select('..., spots_left').
-- security definer: quem busca não pode ver as solicitações dos outros,
-- mas precisa saber quantas vagas sobram. Só o número sai daqui.
create or replace function public.spots_left(g public.groups)
returns int language sql stable security definer set search_path = '' as $$
  select g.spots - (select count(*)::int from public.join_requests r
                    where r.group_id = g.id and r.status = 'accepted');
$$;

-- Pedir para entrar agora também exige que o grupo não esteja lotado.
create or replace function public.can_request(gid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.listed
      and g.organizer_id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), g.organizer_id)
      and public.spots_left(g) > 0
  );
$$;

-- Solicitação recusada não pode ser apagada pelo atleta: senão ele contornaria a recusa pedindo de novo.
drop policy "atleta cancela ou desiste" on public.join_requests;
create policy "atleta cancela ou desiste" on public.join_requests
  for delete to authenticated using (user_id = auth.uid() and status <> 'declined');
