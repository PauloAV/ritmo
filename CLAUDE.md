# Ritmo – instruções para o Claude Code

Projeto M2 de Métodos Ágeis (Engenharia de Software, UMC, 4ºC Noturno, Prof. José Felipe de França).
Responda sempre em **português do Brasil**.

## O que é o projeto
Board Kanban com colunas e limite de WIP que registra a data de cada movimento dos cartões e, a partir
desse histórico, calcula sozinho Lead Time, Cycle Time, Throughput, burndown e CFD e prevê, com
probabilidade (Monte Carlo), quando o trabalho restante fica pronto. Visão geral: @README.md

**Antes de começar qualquer tarefa,** leia o log das sessões anteriores (contexto, decisões e
pendências): @docs/log-sessoes.md

## Time
- Paulo Augusto de Jesus Vilela – Product Owner e Desenvolvedor
- Kauan Ferreira da Silva – Scrum Master e Desenvolvedor

## Sprints (uma semana cada; a data não muda, o que não fica pronto volta ao backlog)
- Sprint 1: 10/11 a 17/11 – H1 a H4 (conta e board, convite, cartões com histórico de movimentos, WIP)
- Sprint 2: 17/11 a 24/11 – H5 a H7 (Lead/Cycle/Throughput, burndown, CFD)
- Sprint 3: 24/11 a 01/12 – H8 a H10 (previsão Monte Carlo, "E se…?", cartão envelhecendo); H11 só se sobrar
- As histórias, com critérios de aceite, estão nas issues: `gh issue view <número>`
- Não implemente história fora da Sprint atual sem o PO (Paulo) pedir.

## Stack
HTML, CSS e JavaScript puro (módulos ES, sem framework e sem bundler) · Supabase (PostgreSQL, Auth, RLS)
· Vitest · GitHub Actions (testes em todo push/PR, deploy no GitHub Pages quando a `main` muda).

## Comandos
- `npm test` – roda os testes (rode antes de dizer que algo está pronto)
- `npm run dev` – servidor local em http://localhost:8080 (precisa de `js/config.js`)
- `npm run build` – gera `dist/` (precisa de SUPABASE_URL e SUPABASE_ANON_KEY no ambiente)

## Estrutura
- `js/regras.js` – regras puras e testáveis: WIP, movimentos e, depois, métricas e simulação
- `js/app.js` – telas e eventos; `js/supabase.js` – cliente do Supabase
- `tests/` – testes do Vitest; `supabase/schema.sql` – tabelas, funções e RLS
- `docs/registro-ia.md` – Registro de Uso da IA; `docs/metricas/` – dados das nossas métricas
- `docs/log-sessoes.md` – log das sessões com o Claude; ao terminar uma sessão, acrescente um resumo no fim

## Regras que não podem ser quebradas
1. **O histórico é sagrado.** A tabela `movimentos` nunca é editada nem apagada. A coluna de um cartão
   só muda pela função `mover_cartao`, que confere o WIP e grava o movimento junto.
2. **Regra igual nos dois lados.** O que está em `js/regras.js` (ex.: `validarMovimento`,
   `COLUNAS_PADRAO`) precisa bater com o `schema.sql` (`mover_cartao`, `preparar_board`).
3. **Métrica conferível.** Toda métrica tem teste com um exemplo pequeno calculado à mão, e a definição
   fica escrita no código (ex.: Cycle Time = primeira entrada em "Em andamento" até "Concluído").
   As métricas acham essas colunas pelo `papel` (`'inicio'` / `'fim'`), **nunca pelo nome**, que o
   time pode mudar. Coluna com papel não pode ser arquivada.
4. **Simulação testável.** O Monte Carlo recebe o sorteio (semente) por parâmetro; nos testes a semente
   é fixa e o resultado é sempre o mesmo. Nunca use `Math.random()` direto dentro da regra.
5. **Datas sem surpresa.** Guarde em UTC (`timestamptz`) e converta para o fuso de São Paulo só na tela.
6. **Segurança no banco.** Toda tabela nova tem RLS habilitado com políticas explícitas.
7. **Sem segredos.** Nunca coloque chave, senha, `service_role` ou dado pessoal real em código, commit,
   teste ou exemplo. `js/config.js` está no .gitignore. Testes usam cartões, nomes e datas fictícios.
8. **TDD.** Para regra nova: primeiro o teste que falha, depois o código mínimo, depois refatorar.

## Como trabalhar com o time
- O time precisa **explicar sozinho, sem consulta,** tudo o que entra no repositório (defesa individual).
  Por isso: antes de editar, diga o plano em poucas linhas; faça mudanças pequenas; depois de cada
  mudança, explique em linguagem simples o que cada trecho faz e por quê.
- Prefira código simples e legível a soluções "espertas". Sem dependências novas sem perguntar
  (gráficos: SVG feito à mão antes de pensar em biblioteca).
- Fluxo: branch por história (`historia-3-mover-cartao`) → testes → PR com o template → revisão do
  outro integrante → merge. Nunca faça commit, push ou merge na `main` sem pedirem.
- Programação em par: o commit leva o coautor no fim da mensagem
  (`Co-authored-by: Nome <usuario@users.noreply.github.com>`).
- Se não tiver certeza de algo (API do Supabase, estatística), diga que não tem certeza.
- Ao final de cada tarefa, lembre de registrar o uso da IA (skill `/registro-ia`). O relatório exige
  pelo menos 3 registros por Sprint, com os dois integrantes, e 1 erro da IA encontrado e corrigido.
