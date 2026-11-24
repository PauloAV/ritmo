# Log das sessões com o Claude Code

Resumo do que foi feito, decidido e deixado pendente em cada sessão, para quem chegar depois
(pessoa ou Claude) ter o contexto antes de começar. O mais recente fica no fim.

Regras deste arquivo:
- Ao terminar uma sessão, acrescente uma seção nova no fim (data, quem, o que fez, decisões, pendências).
- Sem chaves, senhas, URLs privadas ou dados pessoais (mesma regra 7 do CLAUDE.md).
- O detalhe de cada uso da IA para o relatório fica em `docs/registro-ia.md`; aqui é o contexto de trabalho.

---

## 11 e 12/11/2026 · Paulo · Sprint 1

### O que foi feito
1. **Leitura do repositório inteiro** e lista de pontos de atenção. Principais:
   - Um membro podia trocar `boards.criado_por`, virar dono e excluir o board, o que apagaria o histórico. **Corrigido na H1.**
   - Os movimentos apontam para as colunas com `on delete restrict`, então coluna usada não pode ser apagada. Isso levou à decisão de **arquivar**.
   - `innerHTML` com texto do usuário é risco de XSS. **Regra: texto do usuário só entra com `textContent`.**
   - `mover_cartao` trava só o cartão. Dois movimentos simultâneos para a mesma coluna podem passar do WIP. Aceito por ora; saber explicar na defesa.
2. **Node.js instalado** (`winget install OpenJS.NodeJS.LTS`). Depois de instalar, é preciso reabrir o terminal para o `npm` funcionar.
3. **H1 (#1) feita com TDD** na branch `historia-1-conta-board`, **PR #12**:
   - Regras em `js/regras.js`: `validarCredenciais`, `validarCadastro`, `traduzirErroAuth`, `validarNome`, `moverColunaNaOrdem` e `podeArquivarColuna`. São 24 testes no total.
   - `schema.sql`:
     - campo `colunas.arquivada` e função `arquivar_coluna`, que bloqueia coluna com cartões;
     - `mover_cartao` e a criação de cartão ignoram coluna arquivada;
     - board só com `nome` editável; colunas sem `delete` direto.
   - Telas em `index.html`, `js/app.js` e `css/style.css`: Entrar/Criar conta → Meus boards → Board (renomear, ← →, excluir, adicionar coluna).
4. **Supabase configurado** (projeto do time, região São Paulo):
   - `schema.sql` **desta branch** rodado no banco, que já tem `arquivada` e `arquivar_coluna`;
   - "Confirm email" desligado;
   - `js/config.js` local criado. Ele fica fora do Git. **A URL vai sem `/rest/v1/` no fim**: esse erro já aconteceu.
5. **Teste no navegador (headless) da H1, ponta a ponta.** Passou: cadastro, board sem nome, 5 colunas padrão, renomear, criar, reordenar, arquivar, senha errada, sair e entrar, e-mail repetido. Ele achou **3 erros da IA**, todos corrigidos:
   - o formulário ficava em "Criar conta" depois de sair;
   - a lista antiga de boards aparecia por um instante;
   - o botão Sair ficava branco sobre branco.
   
   O teste criou contas fictícias `teste<número>@teste.com` no Supabase, que podem ser apagadas.
6. **GitHub configurado:**
   - Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `PROJECT_TOKEN`;
   - Pages com fonte "GitHub Actions" (https://pauloav.github.io/ritmo/);
   - workflows do board: "Pull request linked to issue" → Em revisão e "Item closed" → Concluído.
7. **Automação do board**, branch `automacao-board`, **PR #13**:
   - `.github/workflows/board.yml`: ao enviar a branch `historia-N-...`, a issue N vai para "Em andamento" e o campo **Início** recebe a data, só na primeira vez. Ela avisa se passar do WIP 2.
   - O campo **Início** do board substitui o `docs/metricas/datas.csv`, que foi removido.

### Decisões do PO (Paulo)
- "Excluir coluna" = **arquivar**. Coluna com cartões não pode ser arquivada.
- Membros só editam o **nome** do board.
- A data de início das histórias fica no campo **Início** do board, não em CSV.
- A ida para **Sprint Backlog** continua manual, porque é decisão do Sprint Planning. O resto do caminho do cartão é automático.
- A H1 foi feita pelo Paulo sozinho, sem par. **O Kauan revisa antes do merge.**

### Estado do board ao fim da sessão
- H1: **Em revisão** (PR #12), Início 12/11.
- H2: **Em andamento** (Kauan), Início 12/11.
- H3 e H4: **Sprint Backlog**.

### Pendências
1. **Kauan:** revisar e mesclar o **PR #12 (H1)** e depois o **PR #13 (automação)**. Depois do merge da H1, conferir os critérios no site publicado.
2. **Kauan:** começar a H2 a partir da `main` já com a H1:
   ```
   git switch main && git pull
   git switch -c historia-2-convite
   git push -u origin historia-2-convite
   ```
   A H2 usa a função `entrar_no_board`, que já existe no `schema.sql`. A tela de "Meus boards" já existe, e o convite entra nela.
3. Na **H3**, conferir se a Action `board.yml` move o cartão e grava o Início. A parte que move o cartão ainda não rodou de verdade; se falhar, o erro aparece em Actions → "Board".
   - **Correção de um erro da IA:** a IA disse que a Action só dispararia depois de estar na `main`. Isso está errado. No evento `create`, o GitHub usa o `board.yml` **da branch criada**. Ela já rodou ao criar a `automacao-board` e foi ignorada corretamente. Ou seja: só funciona em branch `historia-N` criada a partir de uma branch que já tenha o `board.yml`. Na prática, isso vale depois do merge do PR #13.
4. **Registro de Uso da IA da Sprint 1:** 3 registros, todos do Paulo. **Falta pelo menos 1 do Kauan** (regra: os dois integrantes).
5. **"X" vermelho na `main`:** é o deploy de 11/11, que falhou porque os Secrets ainda não existiam ("Faltam as variáveis SUPABASE_URL e/ou SUPABASE_ANON_KEY"). Os Secrets já estão criados, e o próximo deploy sai no merge do PR #12.
6. Quando o site estiver no ar, trocar "_(link do GitHub Pages)_" no README pelo link real.
7. Se o `esm.sh` (CDN do supabase-js) continuar lento, trocar pelo jsDelivr, sem dependência nova.

---

## 12/11/2026 (noite) · Paulo · Sprint 1 · revisão do PR #12

### O que aconteceu
1. **O Kauan revisou o PR #12** com ajuda do Claude, pelo terminal (`gh`). Mandou 14 comentários nas linhas e um resumo.
   Quase tudo procedia. Dois "bugs" eram exagerados: o `supabase-js` já devolve erro de rede em `error` e já renova o token sozinho. Mesmo assim, entraram proteções simples para os dois.
2. **Correções (commit `27c82e8`):**
   - Toda ação da tela passa por `acao()` em `js/app.js`: um clique por vez, mensagem antiga apagada, aviso em exceção e botões apagados durante o pedido.
   - `signOut` confere o erro, e `onAuthStateChange` volta para "Entrar" quando a sessão termina.
   - `traduzirErroAuth` cobre mais erros.
   - `proximaPosicao` e `colunasQueMudaram` foram para o `regras.js`, com teste.
   - Novo teste lê o `schema.sql` e compara com `COLUNAS_PADRAO` (regra 2). Foi provado que ele falha quando os dois lados divergem.
3. **Decisões do PO depois da revisão:**
   - Senha com menos de 6 caracteres no login continua mostrando "precisa ter 6 caracteres" (fica como está).
   - **Board não pode ser excluído**, por ninguém.
   - **O board nunca fica sem colunas.**
   - **Campo `colunas.papel`** (`'inicio'` em Em andamento, `'fim'` em Concluído). As métricas (H5 em diante) acham as colunas pelo papel, não pelo nome. Coluna com papel pode ser renomeada, mas não arquivada. Isso também garante o item anterior.
4. **Primeira migração:** `supabase/migracoes/001-papel-e-protecoes.sql`. A partir de agora, toda mudança no banco ganha um arquivo numerado ali, além de entrar no `schema.sql`.

### Ficou para depois
- **Sprint 2:**
  - reordenar colunas numa transação só (função `reordenar_colunas`);
  - testes do banco (`arquivar_coluna`, `grant`/`revoke`).
- **H2:** impedir que o usuário escolha o `codigo_convite` no insert do board (dar `grant insert (nome)` em `boards`).

### Pendências novas
1. **Rodar a migração 001 no Supabase.** Sem ela, a tela da branch dá erro, porque busca a coluna `papel`.
2. O Kauan revisa de novo o PR #12 e aprova.
3. O Kauan faz o registro dele no `docs/registro-ia.md` (revisão com IA).
4. **Erro da IA achado no teste do navegador depois da revisão:** com a `acao()`, um clique em **Sair** durante um carregamento era ignorado sem aviso. O Sair fica no cabeçalho, fora do `<main>`, e por isso não aparecia apagado. Corrigido: o estado "ocupado" agora fica no `<body>`, e todos os botões aparecem apagados.
5. **Teste no navegador desta rodada, depois da migração 001:** passaram o clique duplo (1 board e 1 coluna só), a mensagem que some depois de um acerto, o Excluir desativado em Em andamento e Concluído, renomear coluna com papel, arquivar coluna sem papel e sair e entrar mantendo o board. Chamando o banco direto, sem a tela, ele recusou arquivar coluna com papel, excluir board e criar coluna com papel.

---

## 12 e 13/11/2026 · Paulo · Sprint 1 · segunda revisão do PR #12

### O que aconteceu
1. **O Kauan fez a 2ª revisão do PR #12** (12/11, 23h36). Não achou bug que impeça o merge. Pediu 2 itens para aprovar e sugeriu mais 1:
   - (PO) atualizar o critério 3 da issue #1, porque as colunas com papel também não podem ser excluídas;
   - teste da regra 2 para as mensagens de `arquivar_coluna`;
   - (opcional) mostrar na tela por que o "Excluir" está desativado.
2. **Correções (commit `cff0395`):**
   - novo teste lê o `schema.sql` e confere as duas mensagens de `podeArquivarColuna`. A de cartões é comparada com `%` no lugar do número. Foi provado que ele falha quando as mensagens divergem. São 38 testes no total;
   - as colunas com papel mostram o texto "Início/Fim do fluxo nas métricas: não pode ser excluída.";
   - Sair: `sair()` só trata o erro, e quem volta para a tela de entrar é o listener `SIGNED_OUT`. Antes, `voltarParaEntrar()` rodava duas vezes.
   - Os 4 comentários nas linhas foram respondidos.
3. **13/11:**
   - critério 3 da issue #1 atualizado: "…(coluna com cartões e as colunas de início e fim das métricas não podem ser excluídas)";
   - no PR #12, um comentário responde ao resumo da 2ª revisão e pede a aprovação.

### Lição para as próximas migrações
A migração 001 marcou o `papel` pelo **nome** da coluna. Num board com duas colunas "Em andamento" ativas, o `unique (board_id, papel)` faria a migração falhar. Daqui para frente: filtrar também pela posição padrão ou pegar só a de menor posição.

### Estado ao fim da sessão
- **PR #12 (H1):** os itens pedidos estão resolvidos e o CI passou. **Falta o Kauan aprovar e mesclar.**
- **PR #13 (automação):** aberto, sem revisão. Entra depois do #12.
- **`main`:** ainda só com a estrutura inicial.
- **H2, H3 e H4:** sem branch. Sobram 4 dias de Sprint (termina em 17/11). O que não ficar pronto volta ao backlog.

### Pendências
1. **Kauan:**
   - conferir o `cff0395` e aprovar e mesclar o PR #12;
   - depois, revisar o PR #13.
2. **Depois do merge:**
   - conferir o deploy no Pages;
   - trocar o link no README;
   - conferir os critérios no site publicado.
3. **Kauan:** criar a `historia-2-convite` a partir da `main` atualizada. Na H2, impedir que o usuário escolha o `codigo_convite`.
4. **H3:** conferir se a Action `board.yml` move o cartão e grava o Início. Conferir também, de verdade, "coluna com cartões não pode ser excluída".
5. **Registro de Uso da IA da Sprint 1:** continua sem nenhum registro do Kauan, e a regra exige os dois integrantes.
6. **Sprint 2:**
   - abrir as issues de testes do banco e de `reordenar_colunas`;
   - nas migrações, não marcar nada só pelo nome.

---

## 14 e 15/11/2026 · Kauan · Sprint 1 · merge da H1 e H2

### O que foi feito
1. **3ª conferência do PR #12 pela DoD** (`/revisar-dod`): os três itens da 2ª revisão estavam resolvidos. Os registros de uso da IA do Kauan ainda não estavam commitados; entraram no `98250c6`. **PR #12 aprovado e mesclado** (`8cfc8d5`) e o deploy no Pages passou. A issue #1 fechou.
2. **H2 (#2) com TDD**, branch `historia-2-convite`, **PR #14**:
   - Regras em `js/regras.js`: `normalizarCodigo` (igual ao `upper(trim())` do banco), `validarCodigoConvite` e `nomesDosMembros`. São 46 testes. Um deles confere que a mensagem "Código de convite inválido." é a mesma no `entrar_no_board` (regra 2).
   - Tela: formulário "Entrar no board" em Meus boards; código de convite e "Membros (n)" na tela do board.
   - Banco: `grant insert (nome)` em `boards`, para ninguém escolher o próprio código (pendência da revisão da H1). **Migração `002-convite.sql` já rodada no Supabase do time.**
3. **Teste no navegador (headless, Chrome) com 3 contas fictícias**, no projeto do time. Passou: código visível, entrar por código (minúsculo e com espaços), lista de membros nos dois lados, entrar de novo sem duplicar, código vazio/errado/inexistente sem criar nada, e uma conta de fora chamando o banco direto sem ver nada (nem conseguir se inserir em `membros`). O teste achou **1 erro da IA**, corrigido: o `maxlength="6"` no campo cortava o código colado com espaço.

### Cuidados
- **O `js/config.js` do Kauan apontava para outro projeto do Supabase.** Nesse projeto, o usuário logado não lia nem `boards`. Foi trocado pelo projeto do time. Para conferir qual projeto está em uso, compare o começo da URL com o `js/config.js` do site publicado. A migração 002 pode ter rodado também nesse outro projeto; ele não é usado pelo time.
- O teste no navegador usou o `playwright-core` instalado só na pasta temporária da sessão, com o Chrome do computador. O projeto não ganhou dependência nova.

### Dados fictícios criados
- No Supabase do time: contas `teste<número>a/b/c@teste.com` (Ana, Bia e Caio Teste) e boards "Board Convite Teste".
- No outro projeto (`config.js` antigo): contas de teste e um board "Debug 2".

Todos podem ser apagados.

### Pendências
1. **Paulo:** revisar o **PR #14 (H2)**. Depois do merge, conferir os critérios no site publicado.
2. **PR #13 (automação do board):** ✅ mesclado (`3fcb976`).
3. **H3 e H4:** sem branch, e a Sprint 1 termina em 17/11. O que não ficar pronto volta ao backlog.
4. Trocar "_(link do GitHub Pages)_" no README por https://pauloav.github.io/ritmo/.
5. A pendência 5 da sessão anterior está resolvida: a Sprint 1 já tem registros de uso da IA dos dois integrantes.

---

## 13 e 15/11/2026 · Paulo · Sprint 1 · fechamento do PR #12 e revisão do PR #14

### O que foi feito
1. **13/11:** depois do log da 2ª revisão (`2be3e74`), a revisão do PR #12 foi pedida de novo ao Kauan pelo GitHub (`gh pr edit --add-reviewer`). Ele aprovou e mesclou o #12 em 14/11 e também mesclou o #13.
2. **15/11: revisão do PR #14 (H2, do Kauan) pela DoD** (`/revisar-dod`), publicada no PR **sem aprovar** (resumo + 3 comentários nas linhas):
   - `npm test` na branch do PR: 46 testes passando; CI passou; sem conflito com a `main`.
   - Os 4 critérios da issue #2 e a DoD estão atendidos. Não há bug que impeça o merge.
   - Sugestões rápidas antes de aprovar:
     - zerar o título "Membros (n)" ao abrir outro board (`js/app.js`), porque a contagem do anterior aparece por um instante;
     - tirar do log a pendência "PR #13 sem revisão", porque o #13 já foi mesclado.
   - Para a defesa:
     - a regra da tela aceita `A-Z0-9`, mas o banco gera só hex;
     - a `entrar_no_board` não limita tentativas (~16,7 milhões de códigos);
     - o nome do perfil pode vir da parte do e-mail antes do `@`.
3. **Registro de Uso da IA da revisão do #14** escrito. Ele inclui um erro da IA: ela disse que o link do README "pode já ter sido resolvido" pelo #13, mas o README da `main` ainda tem o texto provisório.

### Decisão
- O registro de IA e esta seção do log **não entram no PR #14**, para não mexer no PR do Kauan. Ficaram guardados no stash `registro-ia: revisao do PR #14 (Paulo, 15/11) - aplicar depois do merge do #14`, no computador do Paulo.

### Estado ao fim da sessão
- `main`: H1 (#12) e automação (#13) mescladas; o deploy no Pages funciona.
- PR #14 (H2): revisado, esperando os ajustes do Kauan e a aprovação do Paulo.
- H3 e H4 sem branch, e a Sprint 1 termina em 17/11.
- Registros de IA da Sprint 1 contando este: 9 (5 do Paulo e 4 do Kauan), com erro da IA corrigido. A regra está cumprida.

### Pendências
1. **Kauan:** ajustar a contagem de membros e o log no PR #14. **Paulo:** conferir de novo e aprovar.
2. **Depois do merge do #14:** criar a branch `registro-ia-revisao-h2` a partir da `main`, rodar `git stash pop`, fazer commit e abrir um PR curto só de documentação.
3. Conferir os critérios da H2 no site publicado.
4. Trocar "_(link do GitHub Pages)_" no README por https://pauloav.github.io/ritmo/.
5. Começar a H3 o quanto antes. Ela vai testar a Action `board.yml` de verdade.

---

## 15/11/2026 · Kauan · Sprint 1 · H4

### O que foi feito
1. **H4 (#4) com TDD**, branch `historia-4-wip` criada a partir da `main` e enviada na hora (para a Action do board gravar o Início):
   - Regras em `js/regras.js`, logo depois do `validarMovimento`: `lerLimiteWip` (vazio = sem limite; só inteiro > 0, igual ao `check` do banco), `lerPolitica`, `formatarDataHora` (UTC → São Paulo) e `passagensDeWip`. São 48 testes.
   - Tela: botão "WIP e política" em cada coluna; política abaixo do título; "n/limite" amarelo quando a coluna enche e vermelho quando passa; seção "Passagens do limite de WIP (para o Scrum Master)" no fim do board.
   - **Banco sem mudança, sem migração.** `limite_wip`, `politica`, `movimentos.justificativa` e a conferência na `mover_cartao` já existiam.
2. **Teste no navegador (headless, Chrome, tela de celular)**, no projeto do time: 21/21. Como a tela de mover é da H3, os movimentos foram feitos chamando `mover_cartao` direto: o 3º cartão em "Em andamento" (WIP 2) foi recusado sem justificativa e com justificativa só de espaços, e passou com justificativa. O update direto em `movimentos` foi recusado.

### Decisões
- **Critério 2 da H4:** a função `pedirJustificativaSePreciso` (em `js/app.js`) está pronta, mas ainda não é chamada. **Depois do merge da H3**, atualizar a branch da H4 com a `main` e chamar a função no mover da H3, antes da `rpc('mover_cartao')`, passando o `justificativa` dela em `p_justificativa`. Se `pode` vier `false`, não mover.
- A seção do SM aparece para todo o time, porque o banco não tem papel de Scrum Master; o título diz para quem ela é.

### Cuidados
- A H4 saiu da `main`, sem a H2. Ao mesclar os dois PRs, esperar conflito simples em `js/app.js` (import e `abrirBoard`, que nas duas histórias chama mais de uma função de desenho), no `index.html` e no fim de `docs/registro-ia.md` e deste log. Manter as duas partes.
- `mover_cartao` trava só o cartão: dois movimentos ao mesmo tempo para a mesma coluna ainda podem passar do WIP sem justificativa (já anotado na sessão de 11/11).

### Dados fictícios criados
- No Supabase do time: contas `teste<número>w@teste.com` (Ana Teste), boards "Board WIP Teste" e cartões "Cartão A/B/C". Podem ser apagados (os movimentos não saem pela tela, por regra).

### Pendências
1. **Paulo:** revisar o PR da H4. Ele só fica completo depois da H3 (critério 2).
2. **Kauan:** depois do merge da H3, ligar `pedirJustificativaSePreciso` ao mover e repetir o teste no navegador pela tela.
3. Sprint 1 termina em 17/11: o que não ficar pronto volta ao backlog.

---

## 16 e 17/11/2026 · Paulo · Sprint 1 · merge da H2 e H3 (PR #15)

### O que foi feito
1. **PR #14 (H2):**
   - o Kauan respondeu a revisão e corrigiu a contagem de membros e o log (`fee5414`);
   - 3ª conferência pela DoD, com os testes rodados numa cópia do PR: 46 passando;
   - PR aprovado e **mesclado** (`23caf21`), e a issue #2 fechou.
2. **H3 (#3) com TDD**, na branch `historia-3-cartoes-movimentos`, enviada ao GitHub logo no começo (16/11, 00h14):
   - regras com 18 testes novos: `validarCartao`, `colunaVizinha`, `formatarDataHora` (UTC → São Paulo), `montarHistorico` e `movimentoParaDesfazer`. Um deles é o teste da regra 2 com os checks de `cartoes`;
   - tela com o formulário de cartão novo, os botões ← → e Desfazer (movimento novo) e o histórico só de leitura;
   - **migração `003-cartoes.sql`, que o Paulo rodou no Supabase do time.** Ela fecha dois furos: o `criado_em` falso no insert do cartão, que deixava o Lead Time falso, e o responsável de fora do board.
3. **Teste no navegador (headless)**, no computador e no celular:
   - os 4 critérios passaram, e o banco recusou todas as tentativas de burlar o histórico;
   - também foi visto funcionando o "coluna com cartões não pode ser excluída" da H1;
   - os prints mostraram 3 problemas de CSS, corrigidos. Um deles vinha da H1: o hover deixava o texto dos botões roxos invisível.
4. **Merge da `main` (H2) na H3** (`5c7d72b`):
   - os conflitos em `index.html`, `regras.js` e nos testes foram resolvidos mantendo as duas histórias;
   - no `app.js`, a lista de membros passou a usar os dados que a H3 já busca;
   - um teste com duas contas confirmou a H2 e a H3 juntas. São 64 testes.
5. **Board:** a Action falhou, e a issue #3 foi movida à mão para "Em andamento", com **Início 16/11** (a data do push).
6. **PR #15 aberto**, com o Kauan como revisor e um comentário com os pontos de atenção. A issue #3 foi sozinha para "Em revisão".
7. **Registro de Uso da IA** da H3 escrito.
   - O registro da revisão do #14 e a seção do log de 13 e 15/11, que estavam no stash, entraram nesta branch.
   - Não foi preciso uma branch de documentação separada.

### Problemas encontrados
- **A Action `board.yml` falha com `unknown owner type`**, na `historia-3-cartoes-movimentos` e na `historia-4-wip`.
  - O mesmo comando funciona com o `gh` local, que tem os escopos `project`, `read:org` e `repo`.
  - Suspeita, **não confirmada:** falta escopo no `PROJECT_TOKEN`. Gerar de novo com `project`, `read:org` e `repo` e testar na próxima branch `historia-N`.
- **Resolver conflito por script é perigoso.** Ao inverter a ordem das duas partes, a chave que fechava a última função da H2, que era comum às duas, foi parar no fim do arquivo. O `node --check` e o Vitest pegaram o erro. **Depois de resolver um conflito, rodar `npm test` antes do commit.**
- **Os arquivos ficam com CRLF no Windows** (`core.autocrlf=true`). Script que edita arquivo precisa manter o CRLF.
- **O `npm run dev` "parado" por falta de memória continuou rodando** na porta 8080, e o servidor novo deu `EADDRINUSE`.

### Dados fictícios criados (no Supabase do time)
- Contas `teste<número>@teste.com` (Ana Teste e Bia Teste).
- Boards "Board H3 Teste", "Board Visual Teste", "Board H2+H3 Teste" e "Board Sozinha Teste".

Todos podem ser apagados.

### Estado ao fim da sessão
- **`main`:** H1, H2 e a automação do board. A H2 está no deploy do Pages.
- **PR #15 (H3):** em revisão com o Kauan. O CI passou, e o PR pode ser mesclado sem conflito.
- **H4:** branch `historia-4-wip` do Kauan. A issue #4 continua em "Sprint Backlog" no board, porque a Action falhou.
- **A Sprint 1 termina hoje (17/11).**
- **Registros de IA da Sprint 1:** 10 (6 do Paulo e 4 do Kauan), com vários erros da IA corrigidos.

### Pendências
1. **Kauan:** revisar e mesclar o PR #15 hoje, para a H3 entrar na Sprint 1.
2. **Kauan:**
   - mover a issue #4 à mão para "Em andamento", com o Início da data em que a branch foi enviada;
   - atualizar a `historia-4-wip` com a `main` depois do #15. Deve dar conflito em `moverCartao` (`js/app.js`).
3. **Paulo:** gerar de novo o `PROJECT_TOKEN` com `read:org` e `repo` e trocar o secret.
4. **Depois dos merges:** conferir a H2 e a H3 no Pages e trocar o link no README.
5. **Fim da Sprint 1:** métricas (skill `/metricas-sprint`), Sprint Review e Retrospectiva. O que não ficar pronto volta ao backlog.
6. **Backlog:** "arrastar com o mouse" e "editar cartão" ficaram fora da H3. Decidir com o PO se viram itens novos.
7. **Pequenos:** encerrar o `node` antigo na porta 8080, se ainda estiver rodando; ver se o 404 do carregamento é mesmo o `favicon.ico`.

---

## 17/11/2026 · Kauan · Sprint 1 · revisão do PR #15 e fechamento da H4

### O que foi feito
1. **PR #14 (H2):** os 3 comentários da revisão do Paulo foram respondidos (`fee5414`: contagem "Membros (n)" zerada ao abrir o board e log atualizado). O Paulo aprovou e mesclou (`23caf21`).
2. **Revisão do PR #15 (H3, do Paulo) pela DoD:** 64 testes, os 4 critérios e a DoD atendidos. **Aprovado e mesclado** (`595c26e`), e o deploy no Pages passou. A issue #3 fechou.
3. **H4 atualizada com a `main`** (merge `4dac013`, na `historia-4-wip`):
   - conflitos em `js/app.js` e nos docs resolvidos mantendo as duas partes;
   - **`formatarDataHora` repetida:** a H3 e a H4 criaram a mesma função em linhas diferentes. O Git juntou **sem conflito** e deixou dois exports iguais, o que é erro de sintaxe. Ficou só a da H3, que dá o mesmo resultado;
   - **critério 2 ligado:** o `moverCartao` da H3 chama `pedirJustificativaSePreciso` antes da `mover_cartao` e manda a justificativa. O Desfazer também passa por ele, e a lista do SM é redesenhada depois de mover.
4. **Teste pela tela (headless, Chrome), no projeto do time, em 1280 px e 390 px:** 18/18 nas duas larguras. Passaram: política e "0/2" no topo; coluna sem limite com 3 cartões; "2/2" em destaque; Cancelar e justificativa só de espaços não movem; com justificativa move e mostra "3/2" em vermelho; justificativa gravada no movimento e na lista do SM; Desfazer para coluna sem limite não pergunta; Desfazer para coluna cheia pede justificativa; a H2 continua igual.
5. **PR #16 (H4)** aberto, com o Paulo como revisor.

### Para saber explicar na defesa
- "Desfazer" é um movimento novo; clicar duas vezes refaz. Se a coluna de volta estiver cheia, ele também pede justificativa.
- A tela conta os cartões do destino com os dados da última vez que desenhou o board. A `mover_cartao` confere de novo no banco, porque outra pessoa pode ter movido um cartão nesse meio-tempo.

### Dados fictícios criados (no Supabase do time)
Contas `teste<número>h4@teste.com` (Ana Teste), boards "Board H4 Teste" e cartões "Cartão A/B/C". Podem ser apagados (os movimentos não saem, por regra).

### Pendências
1. **Paulo:** revisar e mesclar o **PR #16 (H4)** hoje, para fechar a Sprint 1.
2. **Depois do merge:** conferir H2, H3 e H4 no Pages e trocar o link provisório no README.
3. **Paulo:** gerar de novo o `PROJECT_TOKEN` (a Action do board falhou na H3 e na H4) e conferir se a #4 está na coluna certa do board.
4. **Sprint 1 Review e Retrospectiva:** calcular as métricas da Sprint (`/metricas-sprint`).
5. **Sprint 2:** filtrar os movimentos pelo board (a busca `.in('cartao_id', ...)` cresce com o número de cartões) e abrir as issues de testes do banco e de `reordenar_colunas`.

---

## 17/11/2026 · Paulo · Sprint 1 · merge da H4, token e métricas da Sprint 1

### O que foi feito
1. **PR #15 (H3):** o Kauan aprovou e mesclou (`595c26e`), com 4 observações. As que ficam para depois:
   - a busca `.in('cartao_id', ...)` cresce com o número de cartões;
   - se o responsável sair do board, a política "editar cartao" trava a edição do cartão até trocar o responsável. Hoje não há tela de edição, e mover não é afetado.
2. **PR #16 (H4):** revisão pela DoD, com os testes numa cópia do PR (74 passando).
   - **Aprovado com 4 sugestões** (teste da mensagem de WIP, desempate pelo `id`, comentário do CSS e um ponto para a defesa) e **mesclado** (`1767264`).
   - A issue #4 fechou.
3. **`PROJECT_TOKEN` gerado de novo** pelo Paulo, com `project`, `read:org` e `repo`. O rerun da Action da H3 passou: **o `unknown owner type` era falta de escopo no token.**
4. **Início da #4 gravado à mão: 15/11**, a data do push da `historia-4-wip`.
5. **Métricas da Sprint 1** (`/metricas-sprint`), na branch `metricas-sprint-1`:
   - dados em `docs/metricas/sprint-1.json`, com o histórico de colunas tirado da API GraphQL (`PROJECT_V2_ITEM_STATUS_CHANGED_EVENT`);
   - `scripts/metricas.mjs`, gráficos `burndown-sprint-1.svg` e `cfd-sprint-1.svg` e relatório `docs/metricas/sprint-1.md`;
   - **Lead Time 5,0 dias · Cycle Time 2,25 dias · Throughput 4 · Velocity 16/16.**
6. **Limpeza:** as branches mescladas `automacao-board`, `historia-1-conta-board` e `historia-3-cartoes-movimentos` foram apagadas, no GitHub e no computador. O `node` antigo da porta 8080 foi encerrado.

### O que as métricas mostraram
- Tudo foi entregue, mas **11 dos 16 pontos fecharam nos dois últimos dias**.
- O Lead Time é mais que o dobro do Cycle Time: H3 e H4 esperaram no Sprint Backlog por depender da H1 e da H2.
- A revisão da H1 levou 2 dias.
- Bons pontos para a Retrospectiva: quebrar dependências, revisar mais rápido e começar em paralelo o que não depende de nada.

### Decisões
- Por causa do fim da Sprint, o PR #16 foi aprovado com as sugestões **depois do merge**, em vez de pedir o teste da mensagem de WIP antes.

### Pendências
1. **Confirmar com o time o Início da H1 e da H2.**
   - Pelo log, a H1 começou em 11/11, e o board diz 12/11.
   - O código da H2 começou em 14/11, e o board diz 12/11.
   - Se mudar, coletar os dados de novo e rodar `node scripts/metricas.mjs docs/metricas/sprint-1.json`.
2. ✅ Commit e PR da branch `metricas-sprint-1`: é o PR #17.
3. Conferir H2, H3 e H4 no Pages. (O link do README já foi trocado pelo Kauan, no `a34c867`.)
4. **Sprint Review e Retrospectiva da Sprint 1.**
5. **Sprint 2, a partir das sugestões dos PRs #15 e #16:**
   - teste da regra 2 para a mensagem de WIP;
   - desempate pelo `id` nas passagens;
   - filtrar os movimentos pelo board;
   - testes do banco e `reordenar_colunas`.
6. **Backlog (decisão do PO):** "arrastar com o mouse" e "editar cartão". No "editar cartão", tratar o responsável que saiu do board.

---

## 19/11/2026 · Kauan · Sprint 2 · merge da H5, ajuste do período e H6

### O que foi feito
1. **PR #18 (H5):** já estava aprovado, mas ficou com conflito em `docs/registro-ia.md` depois do merge do #17. O conflito foi resolvido mantendo as linhas das duas branches, em ordem de data (`28f152a`). Depois, `npm test` (90) e CI passando, e **mesclado** (`9f33a88`). A issue #5 fechou.
2. **PR #20 (`ajuste-metricas-periodo`):** é a sugestão 2 da revisão da H5. A `validarPeriodo` faz a `metricasDoFluxo` recusar "de" depois de "ate", em vez de devolver throughput médio `NaN`. Também traz o registro da revisão do #18. Está esperando o Paulo.
3. **H6 (#6) com TDD**, branch `historia-6-burndown`:
   - regras `validarSprint`, `diasDaSprint` e `burndown`, com exemplo feito à mão (99 testes);
   - migração **`004-sprints.sql`, rodada no Supabase do time**;
   - seção "Burndown da Sprint" com gráfico em SVG feito à mão.
   - Teste no navegador: 40/40.
4. **Board:** a #6 tinha sido movida à mão para "Em andamento", sem Início. Ela foi devolvida ao Sprint Backlog, e a Action moveu o cartão e gravou o **Início em 19/11**.

### Decisões
- **Ficam com o PO (Paulo), sem mudança:**
  - casas decimais da H5 (Cycle médio "1,8" e throughput com 2 casas);
  - semana incompleta nas pontas do período contando como semana inteira;
  - a seção da sessão da H5 neste log.
- **Provisórias da H6, para o Paulo confirmar no PR:**
  1. vale a lista atual de cartões da Sprint, e a tela só escolhe os cartões ao criar (o banco já deixa incluir e tirar depois);
  2. cartão sem pontos conta 0 e aparece no aviso;
  3. o dia termina à meia-noite de São Paulo;
  4. vale o valor atual dos pontos;
  5. Sprint não pode ser apagada.

### Cuidados
- **Na primeira vez, a migração 004 não ficou no projeto do time.** O teste acusou `PGRST202` e `PGRST205`, e ela foi rodada de novo. Depois de rodar uma migração, conferir em *Table Editor* se as tabelas apareceram.
- **O PR #20 e o PR da H6 criam, cada um, a seção "## Sprint 2"** no `docs/registro-ia.md`. Ao mesclar o segundo, juntar as linhas numa seção só, em ordem de data.
- **Antes de mesclar um PR já aprovado, conferir de novo se ele pode ser mesclado**, porque outro PR pode ter entrado depois da aprovação.

### Dados fictícios criados (no Supabase do time)
- Contas `teste<número>h6a/h6m/h6x@teste.com` (Ana Teste e Caio Teste).
- Boards "Board H6 Teste …" e "Board Outro Teste", com os cartões A a D e "Cartão de fora", e Sprints "Sprint Teste".

Todos podem ser apagados (os movimentos não saem, por regra).

### Pendências
1. **Paulo:** revisar o PR #20 e o PR da H6 e confirmar as 5 decisões provisórias.
2. **Paulo:** decidir as casas decimais e a semana incompleta da H5, e escrever a seção da sessão da H5 neste log. O registro de IA dele de 19/11 está embaixo de "Sprint 1", mas é da Sprint 2.
3. **Depois dos merges:** conferir a H5 e a H6 no Pages.
4. **H7 (CFD):** Sprint 2 vai até 24/11. Ela pode usar a `diasDaSprint` e o estado no fim de cada dia do `burndown`.

---

## 19 a 24/11/2026 · Paulo · Sprint 2 · H5, revisões do Kauan e início da H7

### O que foi feito
1. **PR #17 (métricas da Sprint 1):** o Kauan revisou e refez as contas à mão.
   - Os ajustes pedidos foram feitos no `6df7ae8`: pendências do log marcadas como feitas, `status` ordenado por data no script e rótulo do CFD em duas variáveis com nome. Os gráficos e os números não mudaram.
   - Ele aprovou e mesclou em 19/11.
2. **H5 (#5), Lead Time, Cycle Time e Throughput, com TDD.** Branch `historia-5-lead-cycle-throughput`, **PR #18**:
   - **a Action do board funcionou sozinha pela primeira vez** (token novo): a #5 foi para "Em andamento" com Início 19/11;
   - regras `diaEmSaoPaulo`, `segundaDaSemana`, `diasEntre`, `datasDoFluxo`, `metricasDoFluxo`, `formatarDias` e `periodoPadrao`, com 16 testes, a conta feita à mão no comentário e um teste de colunas renomeadas;
   - seção "Métricas do fluxo" na tela;
   - a busca dos movimentos passou a filtrar pelo board (`cartoes!inner`), como o Kauan sugeriu no #15;
   - o teste no navegador achou **2 erros da IA**, corrigidos: o throughput aparecia arredondado ("0,3" em vez de 0,25) e o texto das definições dependia do nome das colunas;
   - o Kauan revisou e mesclou em 20/11.
3. **Entrega de 19/11 para o professor:** print do board (página pública do GitHub Projects) e o texto "pronto / em andamento / o que travou", reescrito para ficar com a nossa voz.
4. **24/11: revisão dos 3 PRs abertos do Kauan** (`/revisar-dod`, testes numa cópia de cada PR):
   - **#20** (recusar período com "de" depois de "ate"; corrigia um `NaN` da H5): aprovado e **mesclado** (`8f040d6`);
   - **#21** (H6, burndown): aprovado, com as 5 decisões do PO confirmadas (abaixo);
   - **#19** (log e registro do Kauan): conteúdo certo, mas com conflito; foi pedido que ele atualize a branch.
5. **H7 (#7), CFD: começou.** Branch `historia-7-cfd`; a Action gravou o Início 24/11.
   - As regras `cfd` e `cfdParaCsv` estão prontas, com 5 testes (98 no total), no commit `92ec5f9`.
   - **A tela ainda não foi feita:** ela espera o merge do #21, para reaproveitar o gráfico em SVG da H6.

### Decisões do PO
- **H5:**
  - só conta como concluído quem **está** na coluna de fim, e vale a **última** entrada;
  - cartão sem passagem pelo início fica com Cycle Time "—", fora da média;
  - dias com uma casa decimal, contados da hora exata;
  - semana de segunda a domingo, com período padrão de 4 semanas;
  - entram os cartões concluídos no período.
- **Depois do #20:** mantidas a uma casa decimal e a semana incompleta nas pontas do período (o período padrão começa numa segunda, então só a última semana fica incompleta).
- **H6:**
  - vale a lista **atual** de cartões da Sprint;
  - cartão sem pontos conta 0 e aparece no aviso;
  - o dia termina à meia-noite de São Paulo;
  - vale o valor atual dos pontos;
  - Sprint não pode ser apagada.
- **H7:**
  - o CFD usa o mesmo período (De/Até) das métricas da H5;
  - coluna arquivada só entra se teve cartão no período;
  - CSV com `;`, datas em dd/mm/aaaa e apóstrofo antes de `=`, `+`, `-` e `@`;
  - da 9ª coluna em diante, cinza, com o nome escrito.
- **Combinado do time:** toda mudança passa por PR, até as pequenas. O `a34c867` (links do README) foi direto na `main`.

### Cuidados
- **No Git Bash daqui, o heredoc com Python pode comer as barras invertidas.** Um `\r\n` dentro do texto virou quebra de linha de verdade e quebrou o arquivo de testes da H7 (erro da IA, corrigido antes do commit). Para script com `\`, gravar um arquivo `.py` e rodar dali.
- **Rodar o script de métricas regrava os SVGs com LF.** Se o conteúdo não mudou, restaurar com `git checkout -- <arquivo>`.
- **O `npm run dev` "parado" por falta de memória continua rodando.** Conferir a porta 8080 e encerrar o `http-server`.

### Estado ao fim da sessão
- **`main`:** H1 a H5, as métricas da Sprint 1 e o ajuste do período (#20).
- **PRs abertos:**
  - **#19** (log do Kauan): com conflito;
  - **#21** (H6): aprovado, com conflito na seção "## Sprint 2" do registro.
- **H7:** regras prontas na `historia-7-cfd`, sem PR.
- **A Sprint 2 termina hoje (24/11).** H5 entregue; H6 aprovada e esperando o merge; H7 pela metade.

### Pendências
1. **Kauan:** resolver o conflito do #19 e do #21, nessa ordem, e mesclar.
2. **Paulo (com a IA), depois do #21:**
   - atualizar a `historia-7-cfd` com a `main` e trocar o laço de dias pelo `diasDaSprint` da H6;
   - fazer a tela do CFD (gráfico, tabela e "Baixar CSV") e testar no navegador;
   - abrir o PR.
3. **Registro de Uso da IA:**
   - mover o registro do Paulo de 19/11 (H5), que ficou embaixo de "Sprint 1", para a seção "Sprint 2";
   - acrescentar o registro de 24/11: revisões e H7, com o erro das barras invertidas.
4. **Fechamento da Sprint 2:**
   - decidir se a H7 passa para a Sprint 3;
   - métricas da Sprint 2;
   - Review e Retrospectiva.
5. **Ainda da Sprint 1:**
   - decidir o Início da H1 e da H2;
   - Review e Retrospectiva;
   - conferir as histórias no Pages.

---

## 24/11/2026 (noite) · Paulo · Sprint 2 · merge do #21 e tela do CFD (PR #22)

### O que foi feito
1. **PR #21 (H6):** o Kauan trouxe a `main` (#18 e #20) para a branch (`4137d63`).
   - A resolução foi conferida numa cópia da branch: 102 testes, nenhum marcador de conflito, CRLF mantido. Ficou registrado num comentário no PR.
   - **Mesclado** (`29b39bc`), e a issue #6 fechou.
2. **H7 (#7), na `historia-7-cfd`:**
   - merge da `main` com a H6 (`56199cb`): 4 conflitos do tipo "as duas acrescentaram no mesmo lugar", resolvidos mantendo as duas partes, com a H6 antes da H7;
   - o `cfd` passou a usar o `diasDaSprint` da H6 (`4b69730`);
   - **tela do CFD** (`6028232`): gráfico de áreas empilhadas em SVG feito à mão, legenda, dica por dia, tabela e "Baixar CSV". São 107 testes.
   - Teste no navegador (1280 e 390 px): **14/14**. Os prints mostraram rótulos do eixo x encavalados e o último dia cortado; corrigido.
3. **PR #22 (H7)** aberto, com o Kauan como revisor.
4. **Issue #23 (bug):** o burndown da H6 tem o mesmo código de rótulos do eixo x e encavala os dois últimos dias em Sprint com mais de 8 dias. Por decisão do PO, é um item separado, sem Sprint escolhida.

### Decisões
- **PO:** a correção dos rótulos do burndown vira um item separado (#23), fora do PR da H7.
- **Erro da ordem dos merges (abaixo):** não reverter o #21 na `main`. O único efeito foi o conflito no #19, que se resolve atualizando a branch dele.

### Erros da IA
- **Mesclou o #21 antes do #19**, contra a ordem combinada. O #19 voltou a ter conflito, só no `docs/log-sessoes.md` (as duas branches acrescentam seções no fim). O `docs/registro-ia.md` junta sem conflito.
- Uma edição deixou o `js/app.js` inteiro com LF; pego antes do commit.
- Para descobrir o usuário do Kauan no GitHub, a IA rodou um `gh pr create` que **abriu o PR #22 de verdade**, com o corpo provisório "x" e um revisor que não existe. Corrigido em seguida (descrição completa e revisor `kafs87`).

### Cuidados
- **Antes de mesclar, conferir no log a ordem combinada dos PRs.**
- `gh pr create` cria o PR na hora: nunca usar para "testar" um parâmetro. Para achar o usuário de alguém: `gh api repos/PauloAV/ritmo/collaborators --jq '.[].login'`.
- Num board novo, o CFD aparece como um "pico" no último dia, porque o banco não aceita movimento com data passada (regra 1). Não é erro.

### Dados fictícios criados (no Supabase do time)
Contas `teste<número>h7@teste.com` (Ana Teste) e boards "Board H7 Teste" e "Board H7 Outro Teste", com os cartões A a D. Podem ser apagados (os movimentos não saem, por regra).

### Estado ao fim da sessão
- **`main`:** H1 a H6, as métricas da Sprint 1 e o ajuste do período (#20).
- **PRs abertos:**
  - **#19** (log e registro do Kauan): conflito no log, sem aprovação;
  - **#22** (H7): esperando a revisão do Kauan.
- **A Sprint 2 termina hoje (24/11).** H5 e H6 entregues; H7 em revisão.

### Pendências
1. **Kauan:** atualizar o #19 com a `main`, mantendo a seção dele (17 a 19/11) antes da seção de 19/11 que já está na `main`. **Paulo:** revisar e mesclar o #19 **antes** do #22.
2. **Paulo (com a IA), depois do #19:** atualizar a `historia-7-cfd` com a `main`. Deve dar conflito no fim deste log; manter as duas partes, em ordem de data.
3. **Kauan:** revisar o #22. Depois do merge, conferir o CFD no Pages.
4. **Fechamento da Sprint 2:** métricas (`/metricas-sprint`), Review e Retrospectiva. Decidir se a H7 conta na Sprint 2 (depende do merge hoje).
5. **Sprint Planning da Sprint 3:** decidir em qual Sprint entra a #23.
6. **Ainda da Sprint 1:** decidir o Início da H1 e da H2; Review e Retrospectiva.
