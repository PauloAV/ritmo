-- Ritmo - banco de dados (Supabase / PostgreSQL)
-- Cobre as histórias 1 a 4 da Sprint 1. Rode no Supabase em SQL Editor > New query.
-- Regra de ouro: o histórico de movimentos (tabela movimentos) NUNCA é editado nem apagado.
-- É dele que saem Lead Time, Cycle Time, Throughput, burndown, CFD e a previsão.

-- ============ Tabelas ============

-- Nome de exibição de cada usuário (o login fica em auth.users, gerenciado pelo Supabase).
create table public.perfis (
  id   uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0)
);

create table public.boards (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  codigo_convite text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  criado_por     uuid not null default auth.uid() references auth.users (id),
  criado_em      timestamptz not null default now()
);

create table public.membros (
  board_id   uuid not null references public.boards (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  entrou_em  timestamptz not null default now(),
  primary key (board_id, usuario_id)
);

create table public.colunas (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  nome       text not null check (length(trim(nome)) > 0),
  posicao    integer not null,
  limite_wip integer check (limite_wip is null or limite_wip > 0),
  politica   text,
  -- "Excluir" coluna = arquivar (história 1): some do board, mas fica no banco,
  -- porque os movimentos antigos apontam para ela e o histórico não pode ser apagado.
  arquivada  boolean not null default false,
  -- Colunas que as métricas usam, para não dependerem do nome (que o time pode mudar):
  -- 'inicio' = começo do trabalho (Cycle Time), 'fim' = pronto (Lead e Cycle Time).
  -- Só preparar_board define o papel; coluna com papel não pode ser arquivada.
  papel      text check (papel in ('inicio', 'fim')),
  unique (board_id, id),
  unique (board_id, papel)  -- um início e um fim por board (vários null são permitidos)
);

create table public.cartoes (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards (id) on delete cascade,
  coluna_id      uuid not null,
  titulo         text not null check (length(trim(titulo)) > 0),
  pontos         integer check (pontos is null or pontos >= 0),
  responsavel_id uuid references auth.users (id),
  criado_por     uuid not null default auth.uid() references auth.users (id),
  criado_em      timestamptz not null default now(),
  -- a coluna precisa ser do MESMO board; coluna com cartões não pode ser apagada
  foreign key (board_id, coluna_id) references public.colunas (board_id, id) on delete restrict
);

-- Histórico de movimentos (história 3). de_coluna_id nulo = cartão acabou de ser criado.
create table public.movimentos (
  id             bigint generated always as identity primary key,
  cartao_id      uuid not null references public.cartoes (id) on delete cascade,
  de_coluna_id   uuid references public.colunas (id) on delete restrict,
  para_coluna_id uuid not null references public.colunas (id) on delete restrict,
  movido_por     uuid not null default auth.uid() references auth.users (id),
  movido_em      timestamptz not null default now(),
  justificativa  text   -- preenchida quando o movimento passou do limite de WIP (história 4)
);

-- ============ Gatilhos (triggers) ============

-- Ao criar a conta, grava o nome informado no cadastro (options.data.nome no signUp).
create function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger ao_criar_usuario
after insert on auth.users
for each row execute function public.criar_perfil();

-- Board novo: quem criou vira membro e o board ganha as 5 colunas padrão (história 1).
-- Deve bater com COLUNAS_PADRAO em js/regras.js.
create function public.preparar_board() returns trigger
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

create trigger ao_criar_board
after insert on public.boards
for each row execute function public.preparar_board();

-- Cartão novo: registra o primeiro movimento (criação), início do Lead Time.
create function public.registrar_criacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.movimentos (cartao_id, de_coluna_id, para_coluna_id, movido_por, movido_em)
  values (new.id, null, new.coluna_id, new.criado_por, new.criado_em);
  return new;
end $$;

create trigger ao_criar_cartao
after insert on public.cartoes
for each row execute function public.registrar_criacao();

-- ============ Funções usadas pelo app e pelas regras ============

-- "O usuário logado é membro deste board?"
-- security definer evita recursão infinita nas regras da tabela membros.
create function public.eh_membro(p_board uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where board_id = p_board and usuario_id = auth.uid()
  );
$$;

-- Entrar em um board pelo código de convite (história 2).
-- No app: supabase.rpc('entrar_no_board', { p_codigo: 'AB12CD' })
create function public.entrar_no_board(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_board uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  select id into v_board from public.boards where codigo_convite = upper(trim(p_codigo));
  if v_board is null then
    raise exception 'Código de convite inválido.';
  end if;
  insert into public.membros (board_id, usuario_id) values (v_board, auth.uid())
  on conflict do nothing;
  return v_board;
end $$;

-- Mover um cartão (histórias 3 e 4). É o ÚNICO jeito de mudar a coluna de um cartão:
-- confere o WIP, atualiza o cartão e grava o movimento, tudo junto.
-- Mesma regra de validarMovimento em js/regras.js.
-- No app: supabase.rpc('mover_cartao', { p_cartao: id, p_para_coluna: idColuna, p_justificativa: null })
create function public.mover_cartao(p_cartao uuid, p_para_coluna uuid, p_justificativa text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_cartao  public.cartoes%rowtype;
  v_destino public.colunas%rowtype;
  v_qtd     integer;
  v_mov     bigint;
begin
  select * into v_cartao from public.cartoes where id = p_cartao for update;
  if v_cartao.id is null or not public.eh_membro(v_cartao.board_id) then
    raise exception 'Cartão não encontrado.';
  end if;

  select * into v_destino from public.colunas
  where id = p_para_coluna and board_id = v_cartao.board_id
    and not arquivada;  -- coluna arquivada não existe mais para o board
  if v_destino.id is null then
    raise exception 'A coluna de destino não existe neste board.';
  end if;
  if v_destino.id = v_cartao.coluna_id then
    raise exception 'O cartão já está nesta coluna.';
  end if;

  select count(*) into v_qtd from public.cartoes where coluna_id = v_destino.id;
  if v_destino.limite_wip is not null and v_qtd >= v_destino.limite_wip
     and coalesce(trim(p_justificativa), '') = '' then
    raise exception 'A coluna está no limite de WIP (%/%). Informe uma justificativa para passar.',
      v_qtd, v_destino.limite_wip;
  end if;

  update public.cartoes set coluna_id = v_destino.id where id = v_cartao.id;

  insert into public.movimentos (cartao_id, de_coluna_id, para_coluna_id, justificativa)
  values (v_cartao.id, v_cartao.coluna_id, v_destino.id, nullif(trim(p_justificativa), ''))
  returning id into v_mov;

  return v_mov;
end $$;

-- "Excluir" (arquivar) uma coluna (história 1). Não pode: coluna com papel (métricas)
-- e coluna com cartões. Mesma regra e mesma ordem de podeArquivarColuna em js/regras.js.
-- Como as 2 colunas com papel nunca saem, o board nunca fica sem colunas.
-- No app: supabase.rpc('arquivar_coluna', { p_coluna: idColuna })
create function public.arquivar_coluna(p_coluna uuid) returns void
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

-- ============ Permissões ============
-- Ninguém muda a coluna de um cartão direto (só por mover_cartao),
-- e ninguém edita ou apaga movimentos.
revoke update on public.cartoes from anon, authenticated;
grant update (titulo, pontos, responsavel_id) on public.cartoes to authenticated;
revoke insert, update, delete on public.movimentos from anon, authenticated;

-- Board: membros só mudam o nome. Sem isso, um membro poderia trocar criado_por,
-- virar "dono" e excluir o board (o que apagaria o histórico junto).
revoke update on public.boards from anon, authenticated;
grant update (nome) on public.boards to authenticated;
-- Board não é excluído por ninguém: o cascade apagaria cartões e movimentos (histórico).
revoke delete on public.boards from anon, authenticated;

-- Colunas: membros mudam nome, posição, WIP e política. Arquivar só por arquivar_coluna,
-- e ninguém apaga coluna de verdade (os movimentos apontam para ela).
revoke update, delete on public.colunas from anon, authenticated;
grant update (nome, posicao, limite_wip, politica) on public.colunas to authenticated;
-- Coluna nova: o membro não escolhe papel nem arquivada (só preparar_board define o papel).
revoke insert on public.colunas from anon, authenticated;
grant insert (board_id, nome, posicao, limite_wip, politica) on public.colunas to authenticated;

-- ============ Regras de acesso (Row Level Security) ============

alter table public.perfis     enable row level security;
alter table public.boards     enable row level security;
alter table public.membros    enable row level security;
alter table public.colunas    enable row level security;
alter table public.cartoes    enable row level security;
alter table public.movimentos enable row level security;

-- Perfis: vejo o meu e o de quem está em algum board comigo.
create policy "ver perfis do time" on public.perfis for select to authenticated
using (
  id = auth.uid() or exists (
    select 1 from public.membros outro
    where outro.usuario_id = perfis.id and public.eh_membro(outro.board_id)
  )
);
create policy "editar meu perfil" on public.perfis for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- Boards
-- (criado_por = auth.uid() permite o insert(...).select() logo depois de criar.)
create policy "ver meus boards" on public.boards for select to authenticated
using (criado_por = auth.uid() or public.eh_membro(id));
create policy "criar board" on public.boards for insert to authenticated
with check (criado_por = auth.uid());
create policy "editar board do time" on public.boards for update to authenticated
using (public.eh_membro(id)) with check (public.eh_membro(id));
-- Sem política de delete: board não é excluído (decisão do PO; o histórico é sagrado).

-- Membros: entrar só pela função entrar_no_board; sair é livre.
create policy "ver membros do time" on public.membros for select to authenticated
using (public.eh_membro(board_id));
create policy "sair do board" on public.membros for delete to authenticated
using (usuario_id = auth.uid());

-- Colunas: membros do board veem e configuram (nome, posição, WIP, política).
create policy "membros mexem nas colunas" on public.colunas for all to authenticated
using (public.eh_membro(board_id)) with check (public.eh_membro(board_id));

-- Cartões: membros veem, criam e editam título, pontos e responsável.
-- Não há política de delete: cartão com histórico não é apagado.
create policy "ver cartoes do time" on public.cartoes for select to authenticated
using (public.eh_membro(board_id));
create policy "criar cartao" on public.cartoes for insert to authenticated
with check (
  public.eh_membro(board_id) and criado_por = auth.uid()
  and exists (select 1 from public.colunas k                 -- não cria cartão em coluna arquivada
              where k.id = coluna_id and not k.arquivada)
);
create policy "editar cartao" on public.cartoes for update to authenticated
using (public.eh_membro(board_id)) with check (public.eh_membro(board_id));

-- Movimentos: só leitura para os membros do board.
create policy "ver historico do time" on public.movimentos for select to authenticated
using (exists (select 1 from public.cartoes c
               where c.id = cartao_id and public.eh_membro(c.board_id)));
