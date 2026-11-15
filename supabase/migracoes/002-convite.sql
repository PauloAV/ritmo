-- Migração 002 (H2, convite por código). Rode UMA vez no Supabase: SQL Editor > New query > Run.
-- Projeto novo não precisa: o schema.sql já está com tudo isto.
--
-- O que muda:
--   1. Ao criar um board, o usuário só informa o nome. O código de convite (e id, criado_por,
--      criado_em) sempre vem do default do banco; ninguém escolhe um código fácil de adivinhar.

revoke insert on public.boards from anon, authenticated;
grant insert (nome) on public.boards to authenticated;
