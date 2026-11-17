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
