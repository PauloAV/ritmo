// Ponto de entrada da página. Na Sprint 1 entram aqui as telas de login,
// boards, cartões e movimentos (histórias 1 a 4).
import { supabase } from './supabase.js';
import { COLUNAS_PADRAO, situacaoWip } from './regras.js';

const status = document.querySelector('#status');
const quadro = document.querySelector('#quadro');

// Desenha as colunas padrão vazias, só para conferir que o deploy funciona.
for (const coluna of COLUNAS_PADRAO) {
  const secao = document.createElement('section');
  secao.className = 'coluna';
  const { texto } = situacaoWip(coluna, 0);
  secao.innerHTML = `<h2>${coluna.nome} <span class="wip">${texto}</span></h2>`;
  quadro.append(secao);
}

// Confere se a página consegue falar com o Supabase.
const { error } = await supabase.auth.getSession();
status.textContent = error
  ? 'Não foi possível conectar ao Supabase.'
  : 'Conectado ao Supabase.';
