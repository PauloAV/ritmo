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
