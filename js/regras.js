// Regras de negócio do Ritmo.
// Funções puras (sem banco e sem tela) para poderem ser testadas com o Vitest.

/** Colunas que todo board novo recebe (história 1). limiteWip null = sem limite. */
export const COLUNAS_PADRAO = [
  { nome: 'Backlog', limiteWip: null },
  { nome: 'Sprint Backlog', limiteWip: null },
  { nome: 'Em andamento', limiteWip: 2 },
  { nome: 'Em revisão', limiteWip: 2 },
  { nome: 'Concluído', limiteWip: null },
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
 * Coluna com cartões não pode ser arquivada. Mesma regra da função arquivar_coluna no schema.sql.
 * @param {number} quantidadeCartoes cartões que estão na coluna agora
 */
export function podeArquivarColuna(quantidadeCartoes) {
  return quantidadeCartoes > 0
    ? [`A coluna tem ${quantidadeCartoes} cartão(ões). Mova os cartões antes de excluir.`]
    : [];
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
