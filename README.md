# Ritmo

**Board Kanban que mede sozinho e prevê o futuro.**

O Ritmo é um board Kanban com colunas e limite de WIP que registra a data de cada movimento dos cartões. A partir desse histórico, ele calcula sozinho Lead Time, Cycle Time, Throughput, burndown e CFD, e prevê com probabilidade quando o trabalho restante fica pronto, com o método de Monte Carlo. Exemplo: "85% de chance de terminar até 24/11".

Projeto M2 de Métodos Ágeis, Engenharia de Software (UMC), 4ºC Noturno, Prof. José Felipe de França.

| Integrante | Papel no Scrum |
|---|---|
| Kauan Ferreira da Silva | Scrum Master e Desenvolvedor |
| Paulo Augusto de Jesus Vilela | Product Owner e Desenvolvedor |

- **Projeto no ar:** _(link do GitHub Pages)_
- **Board:** _(link do GitHub Projects)_

## Tecnologias

- HTML, CSS e JavaScript puro (módulos ES, sem framework)
- [Supabase](https://supabase.com): banco PostgreSQL, login e regras de acesso (RLS)
- [Vitest](https://vitest.dev): testes automatizados
- GitHub Actions: roda os testes em todo push/PR e publica no GitHub Pages quando a `main` muda

## Estrutura

```
index.html                  página principal
css/style.css               estilos
js/app.js                   ponto de entrada da página
js/supabase.js              cliente do Supabase
js/regras.js                regras de negócio (funções puras, testadas)
js/config.example.js        modelo de configuração (o js/config.js real não vai para o Git)
tests/                      testes do Vitest
scripts/build.mjs           monta a pasta dist/ e gera o config.js a partir dos Secrets
supabase/schema.sql         tabelas, funções e regras de acesso do banco
docs/registro-ia.md         Registro de Uso da IA (Parte 8 do relatório)
docs/metricas/              gráficos e dados das métricas do nosso próprio projeto
CLAUDE.md, .claude/skills/  instruções e skills do time para o Claude Code
.github/workflows/ci-cd.yml Integração Contínua e deploy
.github/workflows/board.yml move o cartão para "Em andamento" e grava o "Início" no board
.github/pull_request_template.md  checklist da DoD em todo PR
```

## Configuração (uma vez só)

1. **Supabase**: crie um projeto no plano gratuito. Em *SQL Editor*, rode o conteúdo de `supabase/schema.sql`.
2. Em *Authentication > Sign In / Providers > Email*, desative **Confirm email**, para os testes funcionarem com e-mails fictícios (ex.: `ana@teste.com`).
3. **GitHub > Settings > Secrets and variables > Actions**: crie os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` (valores em *Supabase > Project Settings > API*).
4. **GitHub > Settings > Pages**: em *Source*, escolha **GitHub Actions**.
5. **Automação do board**: crie um token em *GitHub > Settings (do usuário) > Developer settings > Personal access tokens > Tokens (classic)* com os escopos `project` e `repo` e uma data de validade, e salve como secret `PROJECT_TOKEN` no repositório.
6. **Workflows do board** (*board > ⋯ > Workflows*): ligue *Pull request linked to issue* → Status **Em revisão** e confira *Item closed* → Status **Concluído**. O board precisa ter o campo de data **Início**.

> A chave `anon` do Supabase é pública por natureza (ela vai para o navegador). Quem protege os dados são as regras de RLS e as permissões do `schema.sql`. Mesmo assim, ela fica fora do repositório e entra só no deploy, pelos Secrets. Nunca use a chave `service_role` no front.

## Rodar no computador

```bash
npm install
cp js/config.example.js js/config.js   # e coloque a URL e a chave do Supabase
npm test                               # roda os testes
npm run dev                            # abre em http://localhost:8080
```

## Como o time trabalha

No Sprint Planning, o time move à mão as histórias escolhidas de **Backlog** para **Sprint Backlog**. O resto do caminho do cartão é automático:

1. Pegue uma história do **Sprint Backlog** (WIP 2 em andamento, no máximo 1 por pessoa), crie a branch com o número da issue e envie para o GitHub na hora:
   ```bash
   git switch -c historia-3-mover-cartao
   git push -u origin historia-3-mover-cartao
   ```
   A Action `board.yml` move o cartão para **Em andamento** e grava a data no campo **Início** (usado no Cycle Time).
2. Escreva o teste da regra primeiro, depois o código (TDD).
3. Abra um pull request com `Closes #3`. O cartão vai sozinho para **Em revisão**. O template traz a checklist da DoD e o campo de uso da IA. O Actions roda os testes.
4. O outro integrante revisa e faz o merge. A issue fecha, o cartão vai para **Concluído** e o deploy acontece sozinho.
6. Em programação em par, o commit leva os dois autores:

```
git commit -m "Mover cartão com registro do movimento

Co-authored-by: Nome do Colega <email-do-colega@users.noreply.github.com>"
```

## Regras

- Nada de senha, chave ou dado pessoal real no código, nos commits ou nos pedidos para a IA. Nos testes, só dados fictícios.
- Todo código, inclusive o escrito pela IA, passa pela mesma DoD e quem fez precisa saber explicar.
- O histórico de movimentos nunca é editado nem apagado: as métricas dependem dele.
