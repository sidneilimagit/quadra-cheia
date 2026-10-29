-- =====================================================================
-- Quadra Cheia: métricas de validação definidas na Fase 2
-- SQL Editor > colar > Run. Só leitura: não altera nada.
-- Limitação: quando um atleta desiste da vaga, a solicitação é apagada,
-- então ela deixa de contar nas métricas.
-- =====================================================================

-- 1) Métrica principal: % das vagas preenchidas em até 7 dias da publicação
--    (só grupos publicados há mais de 7 dias)
select count(*) as grupos_avaliados,
       sum(g.spots) as vagas_ofertadas,
       sum(least(g.spots, (select count(*) from public.join_requests r
                           where r.group_id = g.id and r.status = 'accepted'
                             and r.decided_at <= g.created_at + interval '7 days'))) as vagas_preenchidas_7d,
       round(100.0 * sum(least(g.spots, (select count(*) from public.join_requests r
                           where r.group_id = g.id and r.status = 'accepted'
                             and r.decided_at <= g.created_at + interval '7 days')))
             / nullif(sum(g.spots), 0), 1) as pct_vagas_preenchidas_7d
from public.groups g
where g.created_at <= now() - interval '7 days';

-- 2) % de atletas que pediram entrada em algum grupo na 1ª semana após o cadastro
select count(*) as usuarios_avaliados,
       count(*) filter (where exists (select 1 from public.join_requests r
                                      where r.user_id = p.id
                                        and r.created_at <= p.created_at + interval '7 days')) as pediram_na_1a_semana,
       round(100.0 * count(*) filter (where exists (select 1 from public.join_requests r
                                      where r.user_id = p.id
                                        and r.created_at <= p.created_at + interval '7 days'))
             / nullif(count(*), 0), 1) as pct
from public.profiles p
where p.created_at <= now() - interval '7 days';

-- 3) Taxa de aceite: das solicitações respondidas, quantas foram aceitas
select count(*) filter (where status = 'accepted') as aceitas,
       count(*) filter (where status = 'declined') as recusadas,
       count(*) filter (where status = 'pending')  as aguardando,
       round(100.0 * count(*) filter (where status = 'accepted')
             / nullif(count(*) filter (where status <> 'pending'), 0), 1) as pct_aceite
from public.join_requests;

-- 4) Permanência no grupo após 30 dias: o grupo vive no WhatsApp, fora do app.
--    Medir por pesquisa curta com os organizadores 30 dias após cada aceite.
--    Lista de aceites com mais de 30 dias para essa pesquisa:
select g.name as grupo, p.name as atleta, r.decided_at::date as aceito_em
from public.join_requests r
join public.groups g on g.id = r.group_id
join public.profiles p on p.id = r.user_id
where r.status = 'accepted' and r.decided_at <= now() - interval '30 days'
order by r.decided_at;
