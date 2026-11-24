-- Migração 004 (H6, burndown da Sprint). Rode UMA vez no Supabase: SQL Editor > New query > Run.
-- Projeto novo não precisa: o schema.sql já está com tudo isto.
--
-- O que muda:
--   1. Tabela sprints (nome, início, fim) e sprint_cartoes (cartões escolhidos), com RLS.
--      O board_id nas chaves faz o banco recusar cartão de outro board.
--   2. Função criar_sprint: cria a Sprint e liga os cartões numa transação só.
--   3. Sprint não é apagada; membros só mudam nome e datas. Cartões entram e saem da Sprint.
-- Não mexe em movimentos nem em nenhum dado que já existe.

-- 1. Tabelas
alter table public.cartoes add unique (board_id, id);

create table public.sprints (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  nome       text not null check (length(trim(nome)) > 0),
  inicio     date not null,
  fim        date not null,
  criado_por uuid not null default auth.uid() references auth.users (id),
  criado_em  timestamptz not null default now(),
  check (fim >= inicio),
  unique (board_id, id)
);

create table public.sprint_cartoes (
  sprint_id uuid not null,
  board_id  uuid not null,
  cartao_id uuid not null,
  primary key (sprint_id, cartao_id),
  foreign key (board_id, sprint_id) references public.sprints (board_id, id) on delete cascade,
  foreign key (board_id, cartao_id) references public.cartoes (board_id, id) on delete cascade
);

-- 2. Função
create function public.criar_sprint(p_board uuid, p_nome text, p_inicio date, p_fim date, p_cartoes uuid[])
returns uuid
language plpgsql set search_path = public as $$
declare
  v_sprint uuid;
begin
  if coalesce(array_length(p_cartoes, 1), 0) = 0 then
    raise exception 'Escolha pelo menos um cartão para a Sprint.';
  end if;

  insert into public.sprints (board_id, nome, inicio, fim)
  values (p_board, p_nome, p_inicio, p_fim)
  returning id into v_sprint;

  insert into public.sprint_cartoes (sprint_id, board_id, cartao_id)
  select v_sprint, p_board, unnest(p_cartoes);

  return v_sprint;
end $$;

-- 3. Permissões
revoke insert, update, delete on public.sprints from anon, authenticated;
grant insert (board_id, nome, inicio, fim) on public.sprints to authenticated;
grant update (nome, inicio, fim) on public.sprints to authenticated;
revoke update on public.sprint_cartoes from anon, authenticated;

-- 4. Regras de acesso (RLS)
alter table public.sprints        enable row level security;
alter table public.sprint_cartoes enable row level security;

create policy "ver sprints do time" on public.sprints for select to authenticated
using (public.eh_membro(board_id));
create policy "criar sprint" on public.sprints for insert to authenticated
with check (public.eh_membro(board_id) and criado_por = auth.uid());
create policy "editar sprint" on public.sprints for update to authenticated
using (public.eh_membro(board_id)) with check (public.eh_membro(board_id));

create policy "ver cartoes da sprint" on public.sprint_cartoes for select to authenticated
using (public.eh_membro(board_id));
create policy "incluir cartao na sprint" on public.sprint_cartoes for insert to authenticated
with check (public.eh_membro(board_id));
create policy "tirar cartao da sprint" on public.sprint_cartoes for delete to authenticated
using (public.eh_membro(board_id));
