// Regras de negócio do Ritmo.
// Funções puras (sem banco e sem tela) para poderem ser testadas com o Vitest.

/**
 * Colunas que todo board novo recebe (história 1). limiteWip null = sem limite.
 * papel marca as colunas que as métricas usam, para elas não dependerem do nome
 * (o time pode renomear a coluna à vontade):
 *   'inicio' = começo do trabalho (Cycle Time começa na primeira entrada aqui)
 *   'fim'    = trabalho pronto (Lead Time e Cycle Time terminam na entrada aqui)
 * Coluna com papel não pode ser arquivada; por isso todo board tem sempre pelo menos 2 colunas.
 */
export const COLUNAS_PADRAO = [
  { nome: 'Backlog', limiteWip: null },
  { nome: 'Sprint Backlog', limiteWip: null },
  { nome: 'Em andamento', limiteWip: 2, papel: 'inicio' },
  { nome: 'Em revisão', limiteWip: 2 },
  { nome: 'Concluído', limiteWip: null, papel: 'fim' },
];

/**
 * Situação do WIP de uma coluna (história 4).
 * @param {{limiteWip: number|null}} coluna
 * @param {number} quantidade cartões que estão na coluna agora
 * @returns {{texto: string, cheia: boolean, acima: boolean}}
 *   texto "2/2" (ou só "3" sem limite); cheia = não cabe mais nenhum; acima = já passou do limite
 */
export function situacaoWip(coluna, quantidade) {
  if (coluna.limiteWip == null) {
    return { texto: String(quantidade), cheia: false, acima: false };
  }
  return {
    texto: `${quantidade}/${coluna.limiteWip}`,
    cheia: quantidade >= coluna.limiteWip,
    acima: quantidade > coluna.limiteWip,
  };
}

/**
 * Confere se um cartão pode ir para outra coluna (histórias 3 e 4).
 * Passar do limite de WIP só é permitido com justificativa.
 * @param {{deColunaId: string, paraColuna: {id: string, limiteWip: number|null}|undefined,
 *          quantidadeNoDestino: number, justificativa?: string}} movimento
 * @returns {string[]} lista de erros; vazia quando o movimento é válido
 */
export function validarMovimento({ deColunaId, paraColuna, quantidadeNoDestino, justificativa }) {
  if (!paraColuna) {
    return ['A coluna de destino não existe neste board.'];
  }
  if (paraColuna.id === deColunaId) {
    return ['O cartão já está nesta coluna.'];
  }
  const { cheia, texto } = situacaoWip(paraColuna, quantidadeNoDestino);
  if (cheia && (!justificativa || justificativa.trim() === '')) {
    return [`A coluna está no limite de WIP (${texto}). Informe uma justificativa para passar.`];
  }
  return [];
}

// ---------- História 4: limite de WIP com justificativa ----------

/**
 * Lê o limite de WIP digitado na tela. Vazio = coluna sem limite (aceita qualquer quantidade).
 * Mesma regra do check da tabela colunas no schema.sql: limite_wip is null or limite_wip > 0.
 * @param {string} texto
 * @returns {{limite: number|null, erros: string[]}}
 */
export function lerLimiteWip(texto) {
  const limpo = (texto ?? '').trim();
  if (limpo === '') return { limite: null, erros: [] };
  // Só dígitos: assim "2.5", "-1" e "3a" já ficam de fora; depois falta só recusar o zero.
  if (!/^\d+$/.test(limpo) || Number(limpo) === 0) {
    return {
      limite: null,
      erros: ['O limite de WIP precisa ser um número inteiro maior que zero (ou vazio para não ter limite).'],
    };
  }
  return { limite: Number(limpo), erros: [] };
}

/** Política de entrada da coluna: sem espaços nas pontas; vazia vira null (sem política). */
export function lerPolitica(texto) {
  const limpo = (texto ?? '').trim();
  return limpo === '' ? null : limpo;
}

/**
 * Passagens do limite de WIP, para o Scrum Master acompanhar (história 4).
 * Uma passagem = movimento com justificativa: a mover_cartao (schema.sql) só exige justificativa
 * quando a coluna de destino está no limite.
 * Devolve uma lista nova, da mais recente para a mais antiga; a original não muda.
 * @param {{id: number, de_coluna_id: string|null, para_coluna_id: string, movido_por: string,
 *          movido_em: string, justificativa: string|null, cartoes: {titulo: string}}[]} movimentos
 * @param {{id: string, nome: string}[]} colunas inclusive as arquivadas (o histórico pode passar por elas)
 * @param {{id: string, nome: string}[]} perfis
 */
export function passagensDeWip(movimentos, colunas, perfis) {
  const nomeDaColuna = (id) => colunas.find((c) => c.id === id)?.nome ?? 'Coluna desconhecida';
  const nomeDaPessoa = (id) => perfis.find((p) => p.id === id)?.nome ?? 'Membro sem nome';
  return movimentos
    .filter((m) => m.justificativa)
    .sort((x, y) => new Date(y.movido_em) - new Date(x.movido_em))
    .map((m) => ({
      id: m.id,
      quando: formatarDataHora(m.movido_em),
      cartao: m.cartoes.titulo,
      de: nomeDaColuna(m.de_coluna_id),
      para: nomeDaColuna(m.para_coluna_id),
      quem: nomeDaPessoa(m.movido_por),
      justificativa: m.justificativa,
    }));
}

// ---------- História 1: conta ----------

/** Tamanho mínimo de senha (o mesmo padrão do Supabase Auth). */
export const SENHA_MINIMA = 6;

/**
 * Confere e-mail e senha antes de mandar para o Supabase (login).
 * O e-mail só precisa ter o formato "algo@algo.algo"; quem confirma se ele existe é o Supabase.
 * @returns {string[]} lista de erros; vazia quando está tudo certo
 */
export function validarCredenciais({ email, senha }) {
  const erros = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email ?? '').trim())) {
    erros.push('Informe um e-mail válido.');
  }
  if ((senha ?? '').length < SENHA_MINIMA) {
    erros.push(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  return erros;
}

/** Cadastro = nome obrigatório + as mesmas regras do login. */
export function validarCadastro({ nome, email, senha }) {
  const erros = [];
  if ((nome ?? '').trim() === '') {
    erros.push('Informe o seu nome.');
  }
  return erros.concat(validarCredenciais({ email, senha }));
}

/**
 * Transforma o erro do Supabase Auth (em inglês) em uma mensagem em português.
 * Procura primeiro pelo código do erro e, se não vier, pelo texto da mensagem.
 */
export function traduzirErroAuth(erro) {
  const codigo = erro?.code ?? '';
  const mensagem = erro?.message ?? '';
  if (codigo === 'invalid_credentials' || mensagem.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (codigo === 'user_already_exists' || mensagem.includes('already registered')) {
    return 'Já existe uma conta com este e-mail.';
  }
  if (codigo === 'weak_password') {
    return 'A senha é fraca demais. Escolha uma senha mais forte.';
  }
  if (codigo === 'email_not_confirmed') {
    return 'Confirme o seu e-mail pelo link enviado antes de entrar.';
  }
  if (codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit') {
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  }
  // Genérica: serve tanto para login quanto para cadastro.
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}

// ---------- História 1: board e colunas ----------

/**
 * Nome obrigatório de board ou coluna. Mesma regra do check do banco: length(trim(nome)) > 0.
 * @param {string} nome
 * @param {string} doQue "do board" ou "da coluna", só para montar a mensagem
 */
export function validarNome(nome, doQue) {
  return (nome ?? '').trim() === '' ? [`Informe o nome ${doQue}.`] : [];
}

/**
 * Troca a coluna de lugar com a vizinha (direcao -1 = sobe, +1 = desce) e renumera as posições 1..n.
 * Devolve uma lista NOVA, ordenada; a original não muda. Na ponta, nada acontece.
 * @param {{id: string, posicao: number}[]} colunas
 * @param {string} id coluna que vai mudar de lugar
 * @param {-1|1} direcao
 */
export function moverColunaNaOrdem(colunas, id, direcao) {
  const lista = [...colunas].sort((x, y) => x.posicao - y.posicao);
  const de = lista.findIndex((c) => c.id === id);
  const para = de + direcao;
  if (de !== -1 && para >= 0 && para < lista.length) {
    [lista[de], lista[para]] = [lista[para], lista[de]];
  }
  return lista.map((c, i) => ({ ...c, posicao: i + 1 }));
}

/**
 * "Excluir" coluna = arquivar: ela some do board, mas continua no banco para não estragar o histórico.
 * Não pode: coluna com papel (usada nas métricas) e coluna com cartões.
 * Mesma regra e mesma ordem da função arquivar_coluna no schema.sql (devolve uma mensagem só).
 * @param {{quantidadeCartoes: number, papel: string|null}} coluna
 */
export function podeArquivarColuna({ quantidadeCartoes, papel }) {
  if (papel) {
    return ['Esta coluna marca o início ou o fim do fluxo nas métricas e não pode ser excluída. Você pode renomeá-la.'];
  }
  if (quantidadeCartoes > 0) {
    return [`A coluna tem ${quantidadeCartoes} cartão(ões). Mova os cartões antes de excluir.`];
  }
  return [];
}

/**
 * Posição de uma coluna nova: depois da maior posição que existe (a coluna entra no fim).
 * Board sem colunas começa na 1. Buracos (de colunas arquivadas) não importam.
 * @param {{posicao: number}[]} colunas
 */
export function proximaPosicao(colunas) {
  return Math.max(0, ...colunas.map((c) => c.posicao)) + 1;
}

/**
 * Compara a ordem antiga com a nova e devolve só as colunas cuja posição mudou,
 * que são as únicas que precisam ser gravadas no banco.
 * @param {{id: string, posicao: number}[]} antes
 * @param {{id: string, posicao: number}[]} depois
 */
export function colunasQueMudaram(antes, depois) {
  return depois.filter((nova) => {
    const antiga = antes.find((c) => c.id === nova.id);
    return !antiga || antiga.posicao !== nova.posicao;
  });
}

// ---------- História 2: convite por código ----------

/**
 * Deixa o código digitado igual ao guardado no banco: sem espaços nas pontas e em maiúsculas.
 * Mesmo tratamento do entrar_no_board no schema.sql: upper(trim(p_codigo)).
 * @param {string} texto
 */
export function normalizarCodigo(texto) {
  return (texto ?? '').trim().toUpperCase();
}

/**
 * Confere o código antes de chamar o banco. O banco gera 6 caracteres (codigo_convite no schema.sql);
 * código fora desse formato nem existe, então já sai a mesma mensagem que o entrar_no_board daria.
 * @param {string} texto
 */
export function validarCodigoConvite(texto) {
  const codigo = normalizarCodigo(texto);
  if (codigo === '') return ['Digite o código de convite.'];
  if (!/^[A-Z0-9]{6}$/.test(codigo)) return ['Código de convite inválido.'];
  return [];
}

/**
 * Lista de membros do board: junta as linhas de membros com os nomes em perfis
 * (as duas tabelas ligam em auth.users, por isso a tela faz duas buscas) e ordena por quem entrou primeiro.
 * Devolve uma lista nova; as originais não mudam.
 * @param {{usuario_id: string, entrou_em: string}[]} membros
 * @param {{id: string, nome: string}[]} perfis
 */
export function nomesDosMembros(membros, perfis) {
  return [...membros]
    .sort((x, y) => new Date(x.entrou_em) - new Date(y.entrou_em))
    .map((m) => perfis.find((p) => p.id === m.usuario_id)?.nome ?? 'Membro sem nome');
}

// ---------- História 3: cartões com histórico de movimentos ----------

/**
 * Confere o cartão antes de criar. Mesmas regras dos checks da tabela cartoes no schema.sql:
 * título com texto (length(trim(titulo)) > 0) e pontos vazio ou inteiro >= 0.
 * O responsável é opcional e vem de uma lista de membros, por isso não precisa de validação aqui.
 * @param {{titulo: string, pontos: string}} cartao pontos como veio do campo (texto)
 * @returns {string[]} lista de erros; vazia quando está tudo certo
 */
export function validarCartao({ titulo, pontos }) {
  const erros = [];
  if ((titulo ?? '').trim() === '') {
    erros.push('O título do cartão é obrigatório.');
  }
  const p = (pontos ?? '').trim();
  if (p !== '' && !/^[0-9]+$/.test(p)) {   // só algarismos: sem sinal, vírgula ou letra
    erros.push('Os pontos precisam ser um número inteiro, de 0 para cima.');
  }
  return erros;
}

/**
 * Coluna para onde o cartão vai pelos botões ← e → (história 3): a vizinha pela posição,
 * pulando as arquivadas. Na ponta do board não há vizinha (null), e o botão fica desativado.
 * @param {{id: string, posicao: number, arquivada?: boolean}[]} colunas
 * @param {string} idAtual coluna em que o cartão está
 * @param {-1|1} direcao -1 = esquerda, +1 = direita
 * @returns {string|null} id da coluna vizinha
 */
export function colunaVizinha(colunas, idAtual, direcao) {
  const ativas = colunas
    .filter((c) => !c.arquivada)
    .sort((x, y) => x.posicao - y.posicao);
  const i = ativas.findIndex((c) => c.id === idAtual);
  const vizinha = ativas[i + direcao];
  return i === -1 || !vizinha ? null : vizinha.id;
}

/** Fuso da tela. O banco guarda tudo em UTC (timestamptz); só a tela converte (regra 5). */
export const FUSO_DA_TELA = 'America/Sao_Paulo';

const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_TELA,
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * Data e hora de um movimento para mostrar na tela, no horário de São Paulo: "16/11/2026 12:03".
 * Monta o texto pelas partes (dia, mês...) para não depender da vírgula que cada navegador põe.
 * @param {string} iso data em UTC, como vem do banco (ex.: "2026-11-16T15:03:00+00:00")
 */
export function formatarDataHora(iso) {
  const partes = {};
  for (const { type, value } of formatoDataHora.formatToParts(new Date(iso))) {
    partes[type] = value;
  }
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/**
 * Movimentos em ordem, do mais antigo para o mais novo: pela hora e, na mesma hora, pelo id
 * (o id do movimento só cresce). Devolve uma lista nova; a original não muda.
 * @param {{id: number, movido_em: string}[]} movimentos
 */
function emOrdem(movimentos) {
  return [...movimentos].sort((x, y) => (new Date(x.movido_em) - new Date(y.movido_em)) || (x.id - y.id));
}

/**
 * Histórico que aparece no cartão (história 3), só para ler: ninguém edita nem apaga movimentos.
 * de_coluna_id nulo é a criação do cartão (o gatilho registrar_criacao grava esse primeiro movimento).
 * Coluna arquivada continua com nome, porque os movimentos antigos apontam para ela.
 * @param {{id: number, de_coluna_id: string|null, para_coluna_id: string, movido_por: string,
 *          movido_em: string}[]} movimentos de um cartão
 * @param {{id: string, nome: string}[]} colunas todas as colunas do board, inclusive as arquivadas
 * @param {{id: string, nome: string}[]} perfis
 * @returns {{quando: string, quem: string, texto: string}[]}
 */
export function montarHistorico(movimentos, colunas, perfis) {
  const nomeDaColuna = (id) => colunas.find((c) => c.id === id)?.nome ?? 'Coluna desconhecida';
  return emOrdem(movimentos).map((m) => ({
    quando: formatarDataHora(m.movido_em),
    quem: perfis.find((p) => p.id === m.movido_por)?.nome ?? 'Membro sem nome',
    texto: m.de_coluna_id === null
      ? `Criado em ${nomeDaColuna(m.para_coluna_id)}`
      : `${nomeDaColuna(m.de_coluna_id)} → ${nomeDaColuna(m.para_coluna_id)}`,
  }));
}

/**
 * "Desfazer" o último movimento (história 3) sem apagar nada: a tela chama mover_cartao de volta
 * para a coluna de origem, e isso grava um movimento NOVO. O histórico fica com os dois.
 * @param {{id: number, de_coluna_id: string|null, movido_em: string}[]} movimentos de um cartão
 * @returns {string|null} coluna para onde o cartão volta; null se ele só foi criado (nada a desfazer)
 */
export function movimentoParaDesfazer(movimentos) {
  const ultimo = emOrdem(movimentos).at(-1);
  return ultimo?.de_coluna_id ?? null;
}

// ---------- História 5: Lead Time, Cycle Time e Throughput ----------
// Definições (regra 3 do CLAUDE.md). As colunas são achadas pelo PAPEL, nunca pelo nome:
// - Lead Time  = criação do cartão até a entrada na coluna de papel 'fim' (Concluído)
// - Cycle Time = PRIMEIRA entrada na coluna de papel 'inicio' (Em andamento) até a entrada no 'fim'
// - Throughput = cartões concluídos por semana (segunda a domingo, no calendário de São Paulo)
// Um cartão só está concluído se está na coluna de fim agora; se ele voltou e foi concluído de novo,
// vale a ÚLTIMA entrada no fim. Tempos em dias com fração, contados da hora exata (12 h = 0,5 dia).

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DA_TELA, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Dia do calendário de São Paulo de um instante em UTC: "AAAA-MM-DD". */
export function diaEmSaoPaulo(iso) {
  return formatoDia.format(new Date(iso)); // o formato en-CA já sai como AAAA-MM-DD
}

const UM_DIA = 24 * 60 * 60 * 1000; // em milissegundos

/** Segunda-feira da semana de um dia "AAAA-MM-DD" (a semana vai de segunda a domingo). */
export function segundaDaSemana(dia) {
  const data = new Date(`${dia}T00:00:00Z`);
  const diasDesdeSegunda = (data.getUTCDay() + 6) % 7; // getUTCDay: domingo = 0, segunda = 1...
  return new Date(data.getTime() - diasDesdeSegunda * UM_DIA).toISOString().slice(0, 10);
}

/** Dias (com fração) entre dois instantes em UTC. */
export function diasEntre(isoInicio, isoFim) {
  return (Date.parse(isoFim) - Date.parse(isoInicio)) / UM_DIA;
}

/**
 * Datas do fluxo de UM cartão, a partir do histórico de movimentos dele.
 * @param {{de_coluna_id: string|null, para_coluna_id: string, movido_em: string, id: number}[]} movimentos
 * @param {{id: string, papel: string|null}[]} colunas do board (inclusive as arquivadas)
 * @returns {{criadoEm: string|null, inicioEm: string|null, fimEm: string|null}}
 *   criadoEm = movimento de criação (de_coluna_id nulo); inicioEm = 1ª entrada na coluna 'inicio';
 *   fimEm = entrada no 'fim', só se o último movimento levou o cartão para lá (senão, não está concluído)
 */
export function datasDoFluxo(movimentos, colunas) {
  const papelDa = (id) => colunas.find((c) => c.id === id)?.papel ?? null;
  const ordem = emOrdem(movimentos);
  const criacao = ordem.find((mov) => mov.de_coluna_id === null);
  const primeiraNoInicio = ordem.find((mov) => papelDa(mov.para_coluna_id) === 'inicio');
  const ultimo = ordem.at(-1);
  return {
    criadoEm: criacao?.movido_em ?? null,
    inicioEm: primeiraNoInicio?.movido_em ?? null,
    fimEm: ultimo && papelDa(ultimo.para_coluna_id) === 'fim' ? ultimo.movido_em : null,
  };
}

/**
 * Lead Time, Cycle Time e Throughput de um período (história 5). Definições no início desta seção.
 * Entram os cartões CONCLUÍDOS no período: o dia (de São Paulo) da entrada no fim está entre de e ate.
 * @param {{cartoes: {id: string, titulo: string}[], movimentos: object[], colunas: object[],
 *          de: string, ate: string}} dados de/ate = "AAAA-MM-DD", inclusive
 * @returns {{cartoes: object[], leadTimeMedio: number|null, cycleTimeMedio: number|null,
 *            throughput: {semana: string, concluidos: number}[], throughputMedio: number}}
 *   cartoes vem do concluído mais recente para o mais antigo; média nula quando não há valor;
 *   throughputMedio = concluídos no período ÷ número de semanas da lista
 */
export function metricasDoFluxo({ cartoes, movimentos, colunas, de, ate }) {
  // Sem esta conferência, "de" depois de "ate" dava zero semanas e throughputMedio = 0 ÷ 0 = NaN.
  const erroNoPeriodo = validarPeriodo(de, ate);
  if (erroNoPeriodo) throw new Error(erroNoPeriodo);

  const concluidos = [];
  for (const cartao of cartoes) {
    const doCartao = movimentos.filter((mov) => mov.cartao_id === cartao.id);
    const { criadoEm, inicioEm, fimEm } = datasDoFluxo(doCartao, colunas);
    if (!fimEm) continue; // não está concluído
    const dia = diaEmSaoPaulo(fimEm);
    if (dia < de || dia > ate) continue; // concluído fora do período
    concluidos.push({
      id: cartao.id,
      titulo: cartao.titulo,
      criadoEm, inicioEm, fimEm,
      leadTime: diasEntre(criadoEm, fimEm),
      cycleTime: inicioEm ? diasEntre(inicioEm, fimEm) : null, // nunca passou pelo início: sem Cycle Time
    });
  }
  concluidos.sort((x, y) => Date.parse(y.fimEm) - Date.parse(x.fimEm));

  const media = (valores) => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);
  const cycleTimes = concluidos.map((c) => c.cycleTime).filter((v) => v !== null);

  // Uma linha para cada semana do período (inclusive as sem nenhum concluído).
  const throughput = [];
  for (let semana = segundaDaSemana(de); semana <= ate;
    semana = new Date(Date.parse(`${semana}T00:00:00Z`) + 7 * UM_DIA).toISOString().slice(0, 10)) {
    const concluidosNaSemana = concluidos.filter((c) => segundaDaSemana(diaEmSaoPaulo(c.fimEm)) === semana);
    throughput.push({ semana, concluidos: concluidosNaSemana.length });
  }

  return {
    cartoes: concluidos,
    leadTimeMedio: media(concluidos.map((c) => c.leadTime)),
    cycleTimeMedio: media(cycleTimes),
    throughput,
    throughputMedio: concluidos.length / throughput.length,
  };
}

/**
 * Confere o período escolhido nas métricas. Datas "AAAA-MM-DD"; nesse formato, comparar os textos
 * é o mesmo que comparar as datas. O mesmo dia nas duas pontas vale (período de um dia).
 * @returns {string|null} a mensagem de erro, ou null se o período está certo
 */
export function validarPeriodo(de, ate) {
  if (!de || !ate || de > ate) return 'Escolha um período válido: a data inicial não pode ser depois da final.';
  return null;
}

const formatoUmaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Dias para a tela: uma casa decimal, com vírgula ("2,5"); sem valor (null) vira "—". */
export function formatarDias(dias) {
  return dias === null ? '—' : formatoUmaCasa.format(dias);
}

/**
 * Período que a tela de métricas mostra ao abrir: as últimas 4 semanas, da segunda-feira de
 * 3 semanas atrás até hoje (dias de São Paulo). Recebe o "agora" para o teste ser sempre igual.
 * @param {string} agoraIso ex.: new Date().toISOString()
 */
export function periodoPadrao(agoraIso) {
  const hoje = diaEmSaoPaulo(agoraIso);
  const segunda = Date.parse(`${segundaDaSemana(hoje)}T00:00:00Z`);
  return { de: new Date(segunda - 21 * UM_DIA).toISOString().slice(0, 10), ate: hoje };
}

// ---------- História 6: Burndown da Sprint ----------
// Definição (regra 3 do CLAUDE.md), a mesma do burndown da Sprint 1 em scripts/metricas.mjs:
// - Real  = pontos dos cartões da Sprint que NÃO estavam na coluna de papel 'fim' no fim de cada dia
//           (dia do calendário de São Paulo). Vale o último movimento do cartão até aquele dia, por
//           isso um cartão que sai de Concluído volta a contar como restante.
// - Ideal = linha reta do total de pontos (1º dia) até zero (último dia): total × (1 − i / (dias − 1)).
// Cartão sem pontos conta 0 e entra no aviso, para o time estimar. Vale o valor atual dos pontos
// (o banco não guarda o histórico dos pontos). Dias depois de "hoje" ainda não têm valor real.

/**
 * Confere a Sprint antes de criar. Os checks de nome e datas também estão na tabela sprints (schema.sql).
 * @param {{nome: string, inicio: string, fim: string, cartoes: string[]}} sprint datas "AAAA-MM-DD"
 * @returns {string[]} lista de erros; vazia quando está tudo certo
 */
export function validarSprint({ nome, inicio, fim, cartoes }) {
  const erros = [];
  if ((nome ?? '').trim() === '') erros.push('O nome da Sprint é obrigatório.');
  if (!inicio || !fim) erros.push('Escolha a data de início e a de fim da Sprint.');
  else if (fim < inicio) erros.push('A data de fim não pode ser antes da data de início.');
  if (!cartoes || cartoes.length === 0) erros.push('Escolha pelo menos um cartão para a Sprint.');
  return erros;
}

/** Todos os dias "AAAA-MM-DD" do início ao fim, inclusive os dois. */
export function diasDaSprint(inicio, fim) {
  const dias = [];
  for (let dia = inicio; dia <= fim;
    dia = new Date(Date.parse(`${dia}T00:00:00Z`) + UM_DIA).toISOString().slice(0, 10)) {
    dias.push(dia);
  }
  return dias;
}

/**
 * Burndown de uma Sprint (história 6). Definições no início desta seção.
 * @param {{cartoes: {id: string, titulo: string, pontos: number|null}[], movimentos: object[],
 *          colunas: object[], inicio: string, fim: string, hoje: string}} dados
 *   cartoes = só os da Sprint; datas "AAAA-MM-DD"; hoje vem de fora para o teste ser sempre igual
 * @returns {{total: number, dias: {dia: string, ideal: number, real: number|null}[],
 *            semPontos: {id: string, titulo: string}[]}}
 */
export function burndown({ cartoes, movimentos, colunas, inicio, fim, hoje }) {
  const papelDa = (id) => colunas.find((c) => c.id === id)?.papel ?? null;
  const pontosDe = (cartao) => cartao.pontos ?? 0;
  const total = cartoes.reduce((soma, c) => soma + pontosDe(c), 0);

  // O cartão estava concluído no fim do dia? Olha o último movimento dele até aquele dia.
  const concluidoNoFimDo = (cartao, dia) => {
    const ate = emOrdem(movimentos.filter((mov) => mov.cartao_id === cartao.id
      && diaEmSaoPaulo(mov.movido_em) <= dia));
    const ultimo = ate.at(-1);
    return ultimo !== undefined && papelDa(ultimo.para_coluna_id) === 'fim';
  };

  const dias = diasDaSprint(inicio, fim);
  return {
    total,
    dias: dias.map((dia, i) => ({
      dia,
      // Sprint de um dia: a linha ideal já termina em zero (evita dividir por zero).
      ideal: dias.length === 1 ? 0 : total * (1 - i / (dias.length - 1)),
      real: dia > hoje ? null
        : cartoes.filter((c) => !concluidoNoFimDo(c, dia)).reduce((soma, c) => soma + pontosDe(c), 0),
    })),
    semPontos: cartoes.filter((c) => c.pontos === null || c.pontos === undefined)
      .map((c) => ({ id: c.id, titulo: c.titulo })),
  };
}

// ---------- História 7: diagrama de fluxo cumulativo (CFD) ----------
// Definição (regra 3 do CLAUDE.md), a mesma do CFD da Sprint 1 em scripts/metricas.mjs:
// para cada dia do período, quantos cartões havia em cada coluna no FIM do dia (São Paulo).
// Cada cartão está na coluna do seu último movimento até aquele dia; cartão que ainda não existia
// não conta. As faixas seguem a ordem das colunas do board (posicao). Coluna arquivada só entra se
// teve cartão no período (para o gráfico não esconder trabalho que passou por ela).
// Dias depois de hoje ficam de fora: eles ainda não têm fim, e repetir o estado de hoje neles
// pareceria trabalho parado (decisão do PO na revisão do PR #22).

/**
 * @param {{movimentos: {cartao_id: string, para_coluna_id: string, movido_em: string, id: number}[],
 *          colunas: {id: string, nome: string, posicao: number, arquivada?: boolean}[],
 *          de: string, ate: string, hoje: string}} dados datas "AAAA-MM-DD", de/ate inclusive;
 *   hoje vem de fora para o teste ser sempre igual (como no burndown)
 * @returns {{colunas: {id: string, nome: string}[], dias: {dia: string, quantidades: number[]}[]}}
 *   quantidades[i] = cartões na colunas[i] no fim daquele dia; dias vazio se o período ainda não começou
 */
export function cfd({ movimentos, colunas, de, ate, hoje }) {
  const erroNoPeriodo = validarPeriodo(de, ate);
  if (erroNoPeriodo) throw new Error(erroNoPeriodo);

  // Todos os dias do período, do "de" até o "ate" ou até hoje, o que vier antes
  // (a mesma lista de dias do burndown, história 6). Se o "de" for depois de hoje, a lista fica vazia.
  const ultimoDia = ate < hoje ? ate : hoje;
  const dias = diasDaSprint(de, ultimoDia);

  // No fim de cada dia: cartão → coluna do último movimento dele até ali.
  const ordem = emOrdem(movimentos);
  const ondeEstava = dias.map((dia) => {
    const coluna = new Map();
    for (const mov of ordem) {
      if (diaEmSaoPaulo(mov.movido_em) <= dia) coluna.set(mov.cartao_id, mov.para_coluna_id);
    }
    return coluna;
  });
  const contar = (i, idColuna) => [...ondeEstava[i].values()].filter((id) => id === idColuna).length;

  const usadas = [...colunas]
    .sort((x, y) => x.posicao - y.posicao)
    .filter((c) => !c.arquivada || dias.some((_, i) => contar(i, c.id) > 0));

  return {
    colunas: usadas.map((c) => ({ id: c.id, nome: c.nome })),
    dias: dias.map((dia, i) => ({ dia, quantidades: usadas.map((c) => contar(i, c.id)) })),
  };
}

/**
 * Texto do CSV do CFD (história 7): "Dia;Coluna 1;Coluna 2..." e uma linha por dia (dd/mm/aaaa).
 * Separado por ";" porque o Excel em português usa a vírgula como separador decimal.
 * Nome de coluna é texto do usuário: com ";", aspas ou quebra de linha vai entre aspas (aspas dobradas);
 * se começar com = + - @, tab ou \r (a lista da OWASP), ganha um apóstrofo na frente, para o Excel
 * não rodar como fórmula.
 * @param {{colunas: {nome: string}[], dias: {dia: string, quantidades: number[]}[]}} resultado do cfd
 */
export function cfdParaCsv({ colunas, dias }) {
  const celula = (texto) => {
    let t = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
    if (/[;"\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const dataBr = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  const linhas = [
    ['Dia', ...colunas.map((c) => celula(c.nome))].join(';'),
    ...dias.map((d) => [dataBr(d.dia), ...d.quantidades].join(';')),
  ];
  return linhas.map((l) => `${l}\r\n`).join('');
}
