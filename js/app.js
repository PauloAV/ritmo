// Telas do Ritmo. História 1: entrar/cadastrar, meus boards e o board com as colunas.
// Segurança: texto digitado pelo usuário entra na página só por textContent (nunca innerHTML),
// para ninguém conseguir injetar HTML ou script pelo nome de um board ou coluna.
import { supabase } from './supabase.js';
import {
  situacaoWip, validarCredenciais, validarCadastro, traduzirErroAuth,
  validarNome, moverColunaNaOrdem, podeArquivarColuna,
} from './regras.js';

const $ = (seletor) => document.querySelector(seletor);

// ---------- Utilidades ----------

/** Mostra só a tela pedida e esconde as outras. */
function mostrarTela(id) {
  for (const tela of document.querySelectorAll('.tela')) {
    tela.hidden = tela.id !== id;
  }
  mostrarMensagem('');
}

/** Mensagem de erro ou aviso no topo da página. */
function mostrarMensagem(texto) {
  $('#status').textContent = texto;
}

/** Cria um botão. rotulo = texto lido pelo leitor de tela (útil quando o botão é só uma seta). */
function criarBotao(texto, rotulo, aoClicar, desativado = false) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = texto;
  botao.setAttribute('aria-label', rotulo);
  botao.title = rotulo;
  botao.disabled = desativado;
  botao.addEventListener('click', aoClicar);
  return botao;
}

// ---------- Tela 1: entrar ou criar conta ----------

let modoCadastro = false;

function atualizarModo() {
  $('#titulo-entrar').textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  $('#campo-nome').hidden = !modoCadastro;
  $('#botao-entrar').textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  $('#trocar-modo').textContent = modoCadastro ? 'Já tenho conta' : 'Criar uma conta';
  $('#senha').autocomplete = modoCadastro ? 'new-password' : 'current-password';
  mostrarMensagem('');
}

$('#trocar-modo').addEventListener('click', () => {
  modoCadastro = !modoCadastro;
  atualizarModo();
});

$('#form-entrar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = { nome: $('#nome').value, email: $('#email').value.trim(), senha: $('#senha').value };

  // 1º confere no navegador (regras.js); só depois chama o Supabase.
  const erros = modoCadastro ? validarCadastro(dados) : validarCredenciais(dados);
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }

  const { data, error } = modoCadastro
    // O nome vai em options.data.nome; o gatilho criar_perfil do banco grava em perfis.
    ? await supabase.auth.signUp({
      email: dados.email, password: dados.senha, options: { data: { nome: dados.nome.trim() } },
    })
    : await supabase.auth.signInWithPassword({ email: dados.email, password: dados.senha });

  if (error) {
    mostrarMensagem(traduzirErroAuth(error));
    return;
  }
  if (!data.session) {
    // Só acontece se "Confirm email" estiver ligado no Supabase (o README pede para desligar).
    mostrarMensagem('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
    return;
  }
  $('#form-entrar').reset();
  abrirMeusBoards();
});

$('#sair').addEventListener('click', async () => {
  await supabase.auth.signOut();
  $('#sair').hidden = true;
  modoCadastro = false; // quem acabou de sair quer "Entrar", não "Criar conta"
  atualizarModo();
  mostrarTela('tela-entrar');
});

// ---------- Tela 2: meus boards ----------

async function abrirMeusBoards() {
  mostrarTela('tela-boards');
  $('#sair').hidden = false;
  $('#lista-boards').replaceChildren(); // apaga a lista antiga enquanto a nova não chega

  // O RLS ("ver meus boards") faz o banco devolver só os boards de que a pessoa é membro.
  const { data: boards, error } = await supabase.from('boards').select('id, nome').order('criado_em');
  if (error) {
    mostrarMensagem('Não foi possível carregar os boards.');
    return;
  }

  const lista = $('#lista-boards');
  lista.replaceChildren();
  if (boards.length === 0) {
    const vazio = document.createElement('li');
    vazio.textContent = 'Você ainda não tem board. Crie o primeiro abaixo.';
    lista.append(vazio);
  }
  for (const board of boards) {
    const item = document.createElement('li');
    item.append(criarBotao(board.nome, `Abrir o board ${board.nome}`, () => abrirBoard(board)));
    lista.append(item);
  }
}

$('#form-board').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nome = $('#nome-board-novo').value;
  const erros = validarNome(nome, 'do board');
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }

  // O gatilho preparar_board cria as 5 colunas padrão e coloca quem criou como membro.
  const { data: board, error } = await supabase
    .from('boards').insert({ nome: nome.trim() }).select('id, nome').single();
  if (error) {
    mostrarMensagem('Não foi possível criar o board.');
    return;
  }
  $('#form-board').reset();
  abrirBoard(board);
});

// ---------- Tela 3: o board com as colunas ----------

let boardAtual = null;
let colunasAtuais = [];

async function abrirBoard(board) {
  boardAtual = board;
  mostrarTela('tela-board');
  $('#nome-board').textContent = board.nome;
  await desenharColunas();
}

$('#voltar').addEventListener('click', () => abrirMeusBoards());

/** Busca as colunas (sem as arquivadas) e quantos cartões há em cada uma, e desenha o quadro. */
async function desenharColunas() {
  const [colunas, cartoes] = await Promise.all([
    supabase.from('colunas').select('id, nome, posicao, limite_wip')
      .eq('board_id', boardAtual.id).eq('arquivada', false).order('posicao'),
    supabase.from('cartoes').select('coluna_id').eq('board_id', boardAtual.id),
  ]);
  if (colunas.error || cartoes.error) {
    mostrarMensagem('Não foi possível carregar o board.');
    return;
  }
  colunasAtuais = colunas.data;
  const quantidadeNa = (idColuna) => cartoes.data.filter((c) => c.coluna_id === idColuna).length;

  const quadro = $('#quadro');
  quadro.replaceChildren();
  colunasAtuais.forEach((coluna, i) => {
    const quantidade = quantidadeNa(coluna.id);
    const { texto } = situacaoWip({ limiteWip: coluna.limite_wip }, quantidade);

    const nome = document.createElement('span');
    nome.textContent = coluna.nome;
    const wip = document.createElement('span');
    wip.className = 'wip';
    wip.textContent = texto;
    const titulo = document.createElement('h3');
    titulo.append(nome, wip);

    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    acoes.append(
      criarBotao('Renomear', `Renomear a coluna ${coluna.nome}`, () => renomearColuna(coluna)),
      criarBotao('←', `Mover ${coluna.nome} uma posição para trás`,
        () => reordenarColuna(coluna.id, -1), i === 0),
      criarBotao('→', `Mover ${coluna.nome} uma posição para frente`,
        () => reordenarColuna(coluna.id, +1), i === colunasAtuais.length - 1),
      criarBotao('Excluir', `Excluir a coluna ${coluna.nome}`, () => excluirColuna(coluna, quantidade)),
    );

    const secao = document.createElement('section');
    secao.className = 'coluna';
    secao.append(titulo, acoes);
    quadro.append(secao);
  });
}

async function renomearColuna(coluna) {
  const novoNome = prompt('Novo nome da coluna:', coluna.nome);
  if (novoNome === null) return; // clicou em Cancelar
  const erros = validarNome(novoNome, 'da coluna');
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  const { error } = await supabase.from('colunas').update({ nome: novoNome.trim() }).eq('id', coluna.id);
  if (error) {
    mostrarMensagem('Não foi possível renomear a coluna.');
    return;
  }
  await desenharColunas();
}

async function reordenarColuna(idColuna, direcao) {
  // regras.js calcula a nova ordem; aqui só gravamos as colunas cuja posição mudou.
  const novaOrdem = moverColunaNaOrdem(colunasAtuais, idColuna, direcao);
  const mudaram = novaOrdem.filter(
    (nova) => nova.posicao !== colunasAtuais.find((antiga) => antiga.id === nova.id).posicao,
  );
  const resultados = await Promise.all(
    mudaram.map((c) => supabase.from('colunas').update({ posicao: c.posicao }).eq('id', c.id)),
  );
  if (resultados.some((r) => r.error)) {
    mostrarMensagem('Não foi possível mudar a ordem das colunas.');
  }
  await desenharColunas();
}

async function excluirColuna(coluna, quantidadeCartoes) {
  const erros = podeArquivarColuna(quantidadeCartoes);
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  if (!confirm(`Excluir a coluna "${coluna.nome}"? O histórico dos cartões que passaram por ela continua guardado.`)) {
    return;
  }
  // arquivar_coluna confere de novo no banco (pode ter entrado um cartão nesse meio-tempo).
  const { error } = await supabase.rpc('arquivar_coluna', { p_coluna: coluna.id });
  if (error) {
    mostrarMensagem(error.message); // a mensagem do banco já está em português
    return;
  }
  await desenharColunas();
}

$('#form-coluna').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nome = $('#nome-coluna-nova').value;
  const erros = validarNome(nome, 'da coluna');
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  // A coluna nova entra no fim: maior posição + 1.
  const ultimaPosicao = Math.max(0, ...colunasAtuais.map((c) => c.posicao));
  const { error } = await supabase.from('colunas')
    .insert({ board_id: boardAtual.id, nome: nome.trim(), posicao: ultimaPosicao + 1 });
  if (error) {
    mostrarMensagem('Não foi possível criar a coluna.');
    return;
  }
  $('#form-coluna').reset();
  await desenharColunas();
});

// ---------- Início ----------
// A sessão do Supabase fica guardada no navegador: quem já entrou vai direto para os boards.
atualizarModo();
const { data: { session }, error } = await supabase.auth.getSession();
if (error) {
  mostrarTela('tela-entrar');
  mostrarMensagem('Não foi possível conectar ao Supabase.');
} else if (session) {
  abrirMeusBoards();
} else {
  mostrarTela('tela-entrar');
}
