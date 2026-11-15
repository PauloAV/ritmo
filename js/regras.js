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
 * Data e hora do banco (guardada em UTC) no horário de São Paulo, no formato "15/11/2026 14:30".
 * Regra 5 do CLAUDE.md: guardar em UTC e converter para o fuso de São Paulo só na tela.
 * @param {string} iso ex.: '2026-11-15T17:30:00Z'
 */
export function formatarDataHora(iso) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  // Monta o texto pelas partes, porque a vírgula entre data e hora muda de um navegador para outro.
  const p = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
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
