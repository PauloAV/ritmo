#!/usr/bin/env bash
# Prepara o board do Ritmo: renomeia para "Ritmo", deixa público, apaga histórias antigas
# (de ideias anteriores) e cria as 11 histórias do Ritmo no Backlog, com os pontos.
# Uso (dentro da pasta do repositório):  bash preparar_board.sh NUMERO_DO_PROJETO
# O número do projeto aparece na URL do board: github.com/users/SEU-USUARIO/projects/NUMERO
set -euo pipefail

PROJETO="${1:?Informe o número do projeto. Ex.: bash preparar_board.sh 1}"
DONO=$(gh repo view --json owner --jq .owner.login)

echo "Criando etiquetas..."
gh label create "história"  --color 1f3a5f --description "História de usuário" --force
gh label create "sprint 1"  --color 0e8a16 --force
gh label create "sprint 2"  --color fbca04 --force
gh label create "sprint 3"  --color d93f0b --force
gh label create "se sobrar" --color bfd4f2 --force

echo "Renomeando o board para Ritmo e deixando público..."
gh project edit "$PROJETO" --owner "$DONO" --title "Ritmo" --visibility PUBLIC >/dev/null || echo "AVISO: não consegui renomear/publicar; faça em Settings do board."

echo "Lendo o board..."
PROJ_ID=$(gh project view "$PROJETO" --owner "$DONO" --format json --jq .id)
STATUS_ID=$(gh project field-list "$PROJETO" --owner "$DONO" --format json --jq '.fields[] | select(.name=="Status") | .id')
BACKLOG_ID=$(gh project field-list "$PROJETO" --owner "$DONO" --format json --jq '.fields[] | select(.name=="Status") | .options[]? | select(.name=="Backlog") | .id')

PONTOS_ID=$(gh project field-list "$PROJETO" --owner "$DONO" --format json --jq '.fields[] | select(.name=="Pontos") | .id')
if [ -z "$PONTOS_ID" ]; then
  gh project field-create "$PROJETO" --owner "$DONO" --name "Pontos" --data-type NUMBER >/dev/null
  PONTOS_ID=$(gh project field-list "$PROJETO" --owner "$DONO" --format json --jq '.fields[] | select(.name=="Pontos") | .id')
fi

if [ -z "$BACKLOG_ID" ]; then
  echo "AVISO: não achei a coluna \"Backlog\" no campo Status. Os cartões vão entrar sem coluna."
fi


# Histórias antigas: issues com título "H<número> · ..." que não são do Ritmo.
NOVOS="H1 · Conta e board com colunas|H2 · Convidar o time por código|H3 · Cartões com histórico de movimentos|H4 · Limite de WIP com justificativa|H5 · Lead Time, Cycle Time e Throughput|H6 · Burndown da Sprint|H7 · Diagrama de fluxo cumulativo (CFD)|H8 · Previsão de entrega (Monte Carlo)|H9 · Simulador de cenários (E se…?)|H10 · Cartão envelhecendo|H11 · Exportar métricas da Sprint"
ANTIGAS=$(gh issue list --state all --limit 200 --json title,url --jq '.[] | select(.title | test("^H[0-9]+ · ")) | "\(.url)\t\(.title)"' | grep -v -F -f <(printf '%s\n' "$NOVOS" | tr '|' '\n') || true)
if [ -n "$ANTIGAS" ]; then
  echo
  echo "Estas histórias antigas serão APAGADAS (não dá para desfazer):"
  echo "$ANTIGAS" | cut -f2
  read -r -p "Digite SIM para apagar: " RESP
  if [ "$RESP" = "SIM" ]; then
    echo "$ANTIGAS" | cut -f1 | while read -r u; do gh issue delete "$u" --yes; done
  else
    echo "Mantidas. Apague à mão depois, se quiser."
  fi
fi

criar() { # titulo, pontos, sprint, corpo
  local url item tentativa
  # Se a issue já existe (de uma execução anterior), reaproveita em vez de duplicar.
  url=$(gh issue list --state all --limit 200 --json title,url --jq ".[] | select(.title == \"$1\") | .url")
  if [ -z "$url" ]; then
    url=$(gh issue create --title "$1" --label "história" --label "$3" --body "$4")
  fi

  # Tenta adicionar ao board. Se o board já adicionou sozinho (Auto-add), procura o cartão.
  item=$(gh project item-add "$PROJETO" --owner "$DONO" --url "$url" --format json --jq .id 2>/dev/null) || item=""
  for tentativa in 1 2 3 4 5; do
    [ -n "$item" ] && break
    sleep 2
    item=$(gh project item-list "$PROJETO" --owner "$DONO" --limit 200 --format json \
      --jq ".items[] | select(.content.url == \"$url\") | .id")
  done
  if [ -z "$item" ]; then
    echo "AVISO: não achei o cartão de \"$1\" no board. Adicione à mão: $url"
    return
  fi

  gh project item-edit --id "$item" --project-id "$PROJ_ID" --field-id "$PONTOS_ID" --number "$2" >/dev/null
  if [ -n "$BACKLOG_ID" ]; then
    gh project item-edit --id "$item" --project-id "$PROJ_ID" --field-id "$STATUS_ID" --single-select-option-id "$BACKLOG_ID" >/dev/null
  fi
  echo "OK  $1  ->  $url"
}

criar "H1 · Conta e board com colunas" 5 "sprint 1" "**Como** membro do time, **quero** criar uma conta e um board com as colunas do meu fluxo, **para** organizar o trabalho do time em um só lugar.

### Critérios de aceite
- [ ] Cadastro e login com e-mail e senha; senha errada mostra mensagem de erro.
- [ ] Board criado com nome (obrigatório) e colunas padrão: Backlog, Sprint Backlog, Em andamento, Em revisão e Concluído.
- [ ] É possível renomear, criar, reordenar e excluir colunas (coluna com cartões não pode ser excluída).
- [ ] Ao sair e entrar de novo, o board continua na lista.

**Pontos:** 5 · **Sprint planejada:** 1"

criar "H2 · Convidar o time por código" 3 "sprint 1" "**Como** membro do time, **quero** convidar meus colegas por um código do board, **para** que todos trabalhem no mesmo quadro.

### Critérios de aceite
- [ ] Cada board tem um código de convite visível para os membros.
- [ ] Quem digita um código válido entra no board e aparece na lista de membros.
- [ ] Código inválido mostra mensagem de erro e não cria nada.
- [ ] Quem não é membro não vê nada do board.

**Pontos:** 3 · **Sprint planejada:** 1"

criar "H3 · Cartões com histórico de movimentos" 5 "sprint 1" "**Como** membro do time, **quero** criar cartões e movê-los entre as colunas, com a data e hora de cada movimento registradas automaticamente, **para** que as métricas venham de dados reais.

### Critérios de aceite
- [ ] O cartão tem título (obrigatório), responsável e pontos (opcional).
- [ ] O cartão pode ser arrastado ou movido por um botão (funciona no celular).
- [ ] Cada movimento grava coluna de origem, coluna de destino, data e hora e quem moveu.
- [ ] O histórico aparece no cartão e não pode ser editado nem apagado; desfazer gera um novo movimento.

**Pontos:** 5 · **Sprint planejada:** 1"

criar "H4 · Limite de WIP com justificativa" 3 "sprint 1" "**Como** membro do time, **quero** que cada coluna tenha limite de WIP e política de entrada, **para** que o time termine o que começou antes de puxar trabalho novo.

### Critérios de aceite
- [ ] Cada coluna pode ter limite de WIP e um texto de política, visíveis no topo (ex.: \"2/2\").
- [ ] Ao tentar passar do limite, o app avisa e só deixa mover com uma justificativa.
- [ ] A justificativa fica registrada no movimento e aparece para o Scrum Master.
- [ ] Coluna sem limite aceita qualquer quantidade.

**Pontos:** 3 · **Sprint planejada:** 1"

criar "H5 · Lead Time, Cycle Time e Throughput" 5 "sprint 2" "**Como** Scrum Master, **quero** ver Lead Time, Cycle Time e Throughput calculados a partir do histórico do board, **para** acompanhar o fluxo sem planilha.

### Critérios de aceite
- [ ] Lead Time = criação do cartão até a entrada em Concluído; Cycle Time = primeira entrada em Em andamento até Concluído.
- [ ] Throughput = cartões concluídos por semana.
- [ ] Mostra a média do período escolhido e o valor de cada cartão, para conferir a conta.
- [ ] Os valores batem com um exemplo calculado à mão (teste automatizado).

**Pontos:** 5 · **Sprint planejada:** 2"

criar "H6 · Burndown da Sprint" 3 "sprint 2" "**Como** Scrum Master, **quero** ver o burndown da Sprint, **para** saber todo dia se o time vai cumprir o planejado.

### Critérios de aceite
- [ ] A Sprint tem data de início, data de fim e os cartões escolhidos.
- [ ] O gráfico mostra os pontos restantes por dia (linha real) e a linha ideal.
- [ ] Um cartão que sai de Concluído volta a contar como restante.
- [ ] Cartão sem pontos aparece em um aviso, para o time estimar.

**Pontos:** 3 · **Sprint planejada:** 2"

criar "H7 · Diagrama de fluxo cumulativo (CFD)" 5 "sprint 2" "**Como** Scrum Master, **quero** ver o diagrama de fluxo cumulativo (CFD) do board, **para** enxergar gargalos e acúmulo de trabalho.

### Critérios de aceite
- [ ] O CFD mostra, para cada dia, quantos cartões havia em cada coluna, reconstruído a partir do histórico de movimentos.
- [ ] As faixas seguem a ordem das colunas do board.
- [ ] É possível escolher o período.
- [ ] Os dados do gráfico podem ser baixados em CSV.

**Pontos:** 5 · **Sprint planejada:** 2"

criar "H8 · Previsão de entrega (Monte Carlo)" 5 "sprint 3" "**Como** Product Owner, **quero** saber com probabilidade quando os cartões restantes ficarão prontos, **para** responder \"quando fica pronto?\" com dados e não no chute.

### Critérios de aceite
- [ ] O app simula 10.000 cenários sorteando o throughput diário real do time (método de Monte Carlo).
- [ ] Mostra as datas com 50%, 85% e 95% de chance de terminar os cartões restantes.
- [ ] Com menos de 10 dias de histórico, avisa que a previsão ainda não é confiável.
- [ ] Com a mesma semente de sorteio, o resultado é sempre o mesmo (testável).

**Pontos:** 5 · **Sprint planejada:** 3"

criar "H9 · Simulador de cenários (E se…?)" 3 "sprint 3" "**Como** Product Owner, **quero** simular \"e se…?\" mudando o escopo ou a data-alvo, **para** decidir o que cortar antes que seja tarde.

### Critérios de aceite
- [ ] É possível tirar ou acrescentar cartões na simulação sem mudar o board real.
- [ ] Mostra a chance de terminar até uma data escolhida (ex.: \"62% até 24/11\").
- [ ] O cenário simulado aparece lado a lado com o cenário atual.
- [ ] Nada do que é simulado altera o histórico.

**Pontos:** 3 · **Sprint planejada:** 3"

criar "H10 · Cartão envelhecendo" 5 "sprint 3" "**Como** membro do time, **quero** que o cartão mude de cor quando estiver parado há mais tempo que o normal do time, **para** agir antes de virar gargalo.

### Critérios de aceite
- [ ] A idade do cartão conta desde a primeira entrada em Em andamento.
- [ ] O limite \"normal\" é o tempo em que 85% dos cartões do time costumam ficar prontos (percentil 85 do Cycle Time).
- [ ] O cartão fica amarelo a partir de 70% desse limite e vermelho acima dele.
- [ ] O topo do board lista os cartões em risco.

**Pontos:** 5 · **Sprint planejada:** 3"

criar "H11 · Exportar métricas da Sprint" 3 "se sobrar" "**Como** Scrum Master, **quero** exportar as métricas e os gráficos da Sprint, **para** levar à Review e ao relatório sem refazer nada.

### Critérios de aceite
- [ ] Exporta Lead Time, Cycle Time, Throughput e Velocity da Sprint em uma tabela.
- [ ] Baixa o burndown e o CFD como imagem.
- [ ] Cada número vem com a explicação de como foi calculado.

**Pontos:** 3 · **Sprint planejada:** se sobrar tempo"

echo "Pronto! As 11 histórias do Ritmo estão no Backlog do board."
