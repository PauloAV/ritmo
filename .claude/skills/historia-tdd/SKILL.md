---
name: historia-tdd
description: Implementa uma história do backlog do Ritmo (H1 a H11) com TDD, seguindo a DoD do time. Use quando pedirem para fazer, começar ou continuar uma história ou issue.
---

# Implementar uma história com TDD

Argumento esperado: número da issue/história (ex.: `/historia-tdd 4`). Se não vier, pergunte.

## 1. Entender antes de codar
1. Leia a história: `gh issue view <número>`.
2. Confira se ela é da Sprint atual (veja o CLAUDE.md). Se não for, avise e pare.
3. Liste os critérios de aceite e, para cada um, diga em uma linha como ele será testado.
4. Mostre o plano (arquivos que vão mudar, tabelas novas, telas) e **espere o OK** antes de editar.

## 2. Branch
`git switch -c historia-<número>-<resumo-curto>` (ex.: `historia-3-mover-cartao`).

## 3. Ciclo TDD, um critério por vez
1. **Vermelho:** escreva o teste em `tests/` (Vitest) com dados fictícios. Rode `npm test` e mostre que falha.
2. **Verde:** escreva o código mínimo em `js/regras.js` (regra pura) até passar.
3. **Refatorar:** limpe nomes e duplicação, rode `npm test` de novo.
4. Explique o que o teste e o código fazem em linguagem simples (o time precisa defender sozinho).

Regras do Ritmo: métrica sempre conferida com exemplo calculado à mão; simulação com semente por parâmetro
(nada de `Math.random()` direto); datas em UTC; o histórico de movimentos nunca é editado nem apagado.

## 4. Banco (se a história precisar)
- Altere `supabase/schema.sql`: tabela nova com RLS habilitado e políticas explícitas.
- Escrita sensível via função `security definer` que confere participante e valores.
- A coluna de um cartão só muda por `mover_cartao`; `movimentos` continua só leitura.
- Se mudar uma regra que existe nos dois lados (`js/regras.js` e `schema.sql`), mude os dois.
- Diga ao time exatamente qual trecho rodar no SQL Editor do Supabase e como conferir.

## 5. Tela
- Ligue a regra à tela em `js/app.js` com HTML simples e acessível; funcione em tela de celular.
- Mensagens de erro em português claro.

## 6. Fechar
1. `npm test` passando.
2. Rode a skill `revisar-dod` (checklist da DoD).
3. Sugira a mensagem de commit (com `Co-authored-by` se foi em par) — não faça commit sem pedirem.
4. Sugira o texto do PR seguindo `.github/pull_request_template.md`, com `Closes #<número>`.
5. Lembre de registrar o uso da IA com a skill `registro-ia`.
