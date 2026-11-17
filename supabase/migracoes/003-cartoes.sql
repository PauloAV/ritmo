-- Migração 003 (H3, cartões com histórico). Rode UMA vez no Supabase: SQL Editor > New query > Run.
-- Projeto novo não precisa: o schema.sql já está com tudo isto.
--
-- O que muda:
--   1. Ao criar um cartão, o usuário só informa board, coluna, título, pontos e responsável.
--      criado_em e criado_por sempre vêm do banco. Antes, dava para mandar um criado_em antigo,
--      e o primeiro movimento (que copia essa data) deixava o Lead Time falso.
--   2. O responsável do cartão precisa ser membro do board (ou ficar vazio), ao criar e ao editar.

-- 1. Campos do insert
revoke insert on public.cartoes from anon, authenticated;
grant insert (board_id, coluna_id, titulo, pontos, responsavel_id) on public.cartoes to authenticated;

-- 2. Responsável do time
create function public.pode_ser_responsavel(p_board uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_usuario is null or exists (
    select 1 from public.membros
    where board_id = p_board and usuario_id = p_usuario
  );
$$;

drop policy "criar cartao" on public.cartoes;
create policy "criar cartao" on public.cartoes for insert to authenticated
with check (
  public.eh_membro(board_id) and criado_por = auth.uid()
  and public.pode_ser_responsavel(board_id, responsavel_id)
  and exists (select 1 from public.colunas k
              where k.id = coluna_id and not k.arquivada)
);

drop policy "editar cartao" on public.cartoes;
create policy "editar cartao" on public.cartoes for update to authenticated
using (public.eh_membro(board_id))
with check (public.eh_membro(board_id) and public.pode_ser_responsavel(board_id, responsavel_id));
