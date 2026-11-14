-- Migração 001 (H1, revisão do PR #12). Rode UMA vez no Supabase: SQL Editor > New query > Run.
-- Projeto novo não precisa: o schema.sql já está com tudo isto.
--
-- O que muda:
--   1. colunas.papel ('inicio' / 'fim'): as métricas acham as colunas pelo papel, não pelo nome.
--   2. preparar_board passa a marcar o papel de "Em andamento" e "Concluído".
--   3. arquivar_coluna não arquiva coluna com papel (logo, o board nunca fica sem colunas).
--   4. Board não pode mais ser excluído (o cascade apagaria o histórico).
--   5. Membro não escolhe papel nem arquivada ao criar coluna.

-- 1. Campo papel
alter table public.colunas
  add column papel text check (papel in ('inicio', 'fim')),
  add constraint colunas_board_papel_unico unique (board_id, papel);

-- Boards que já existem: marca pelo nome padrão. Board em que essas colunas já foram renomeadas
-- fica sem papel (só boards de teste até agora); confira com a consulta no fim.
update public.colunas set papel = 'inicio' where nome = 'Em andamento' and not arquivada;
update public.colunas set papel = 'fim'    where nome = 'Concluído'    and not arquivada;

-- 2. preparar_board com papel
create or replace function public.preparar_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.membros (board_id, usuario_id) values (new.id, new.criado_por);
  insert into public.colunas (board_id, nome, posicao, limite_wip, papel) values
    (new.id, 'Backlog',        1, null, null),
    (new.id, 'Sprint Backlog', 2, null, null),
    (new.id, 'Em andamento',   3, 2,    'inicio'),
    (new.id, 'Em revisão',     4, 2,    null),
    (new.id, 'Concluído',      5, null, 'fim');
  return new;
end $$;

-- 3. arquivar_coluna recusa coluna com papel
create or replace function public.arquivar_coluna(p_coluna uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_coluna public.colunas%rowtype;
  v_qtd    integer;
begin
  select * into v_coluna from public.colunas where id = p_coluna for update;
  if v_coluna.id is null or not public.eh_membro(v_coluna.board_id) then
    raise exception 'Coluna não encontrada.';
  end if;

  if v_coluna.papel is not null then
    raise exception 'Esta coluna marca o início ou o fim do fluxo nas métricas e não pode ser excluída. Você pode renomeá-la.';
  end if;

  select count(*) into v_qtd from public.cartoes where coluna_id = v_coluna.id;
  if v_qtd > 0 then
    raise exception 'A coluna tem % cartão(ões). Mova os cartões antes de excluir.', v_qtd;
  end if;

  update public.colunas set arquivada = true where id = v_coluna.id;
end $$;

-- 4. Ninguém exclui board
drop policy "excluir board que criei" on public.boards;
revoke delete on public.boards from anon, authenticated;

-- 5. Criar coluna só com os campos do usuário
revoke insert on public.colunas from anon, authenticated;
grant insert (board_id, nome, posicao, limite_wip, politica) on public.colunas to authenticated;

-- Para conferir depois de rodar (cada board deve ter 1 'inicio' e 1 'fim'):
--   select b.nome, count(*) filter (where c.papel = 'inicio') as inicio,
--          count(*) filter (where c.papel = 'fim') as fim
--   from public.boards b join public.colunas c on c.board_id = b.id
--   group by b.nome;
