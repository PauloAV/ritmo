---
name: metricas-sprint
description: Calcula as métricas da Sprint do Ritmo (Lead Time, Cycle Time, Throughput, Velocity, Burndown e CFD) a partir dos dados do board e das issues. Use no fim de cada Sprint ou quando pedirem métricas, burndown ou CFD.
---

# Métricas da Sprint

Atenção: aqui são as métricas do NOSSO projeto (para o relatório). Quando o Ritmo já estiver no ar
e o time estiver usando ele como board, prefira os números do próprio Ritmo e use esta skill para conferir.

Regra do professor: **as métricas saem dos dados do board; a IA ajuda a ler, mas não substitui a conta.**
Nunca invente número. Toda conta precisa poder ser refeita pelo time.

## Dados
1. Datas das issues: `gh issue list --state all --label história --json number,title,createdAt,closedAt,labels`
2. Pontos e início (campos "Pontos" e "Início" do board):
   `gh project item-list 3 --owner PauloAV --format json` (no JSON, o campo aparece como `"início"`).
3. Início do trabalho (para o Cycle Time): o GitHub não guarda quando o cartão foi para
   "Em andamento", por isso a Action `.github/workflows/board.yml` grava a data no campo "Início"
   quando a branch `historia-N-...` é enviada (só se o cartão estava em "Sprint Backlog").
   Se faltar alguma data, pergunte; não estime. Atenção: a data é a do **push** da branch; se alguém
   começou antes e enviou a branch depois, pergunte ao time a data real e use a do time.
4. Datas da Sprint: veja o CLAUDE.md.

## Definições (escreva-as junto com os valores no relatório)
- **Lead Time** = fechamento da issue − criação da issue (dias), média das histórias concluídas.
- **Cycle Time** = fechamento − início (campo "Início" do board), média das histórias concluídas.
- **Throughput** = número de histórias concluídas na Sprint.
- **Velocity** = soma dos pontos das histórias concluídas (história pela metade conta zero).
- **Burndown** = pontos restantes no fim de cada dia da Sprint (planejado × real).
- **CFD** = quantidade de cartões em cada coluna por dia (precisa das datas de cada coluna).

## Como calcular
1. Gere ou atualize `scripts/metricas.mjs` (Node puro, sem dependências) que lê os JSONs e o CSV
   e imprime a tabela. Rode e mostre a saída.
2. Para o burndown, gere `docs/metricas/burndown-sprint-N.svg` (gráfico simples de linhas).
3. Entregue para o relatório: a tabela "Métrica | Valor | Como foi calculada" e 2 ou 3 frases sobre
   o que os números dizem (ex.: Cycle Time alto em uma história indica gargalo na revisão).
4. Explique cada conta de forma que o time consiga refazer na defesa.
