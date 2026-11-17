// Telas do Ritmo. História 1: entrar/cadastrar, meus boards e o board com as colunas.
// História 2: código de convite, entrar no board por código e lista de membros.
// História 3: cartões, mover entre colunas (botões ← →), desfazer e histórico de movimentos.
// Segurança: texto digitado pelo usuário entra na página só por textContent (nunca innerHTML),
// para ninguém conseguir injetar HTML ou script pelo nome de um board ou coluna.
import { supabase } from './supabase.js';
import {
  situacaoWip, validarCredenciais, validarCadastro, traduzirErroAuth,
  validarNome, moverColunaNaOrdem, podeArquivarColuna, proximaPosicao, colunasQueMudaram,
  normalizarCodigo, validarCodigoConvite, nomesDosMembros,
  validarCartao, colunaVizinha, montarHistorico, movimentoParaDesfazer,
} from './regras.js';

// Campos do board que as telas usam (o código de convite aparece no board, história 2).
const CAMPOS_BOARD = 'id, nome, codigo_convite';

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

let ocupado = false;

/**
 * Roda uma ação do usuário (entrar, criar, renomear, mover...), uma de cada vez:
 * - ignora novos cliques enquanto a anterior não termina (evita board ou coluna duplicada);
 * - apaga a mensagem antiga antes de começar;
 * - se acontecer uma exceção inesperada (ex.: sem internet), avisa em vez de ficar muda.
 * Enquanto roda, <body aria-busy="true"> deixa TODOS os botões apagados, inclusive o Sair do
 * cabeçalho (ver style.css); assim ninguém clica num botão que seria ignorado sem aviso.
 */
async function acao(fazer) {
  if (ocupado) return;
  ocupado = true;
  document.body.setAttribute('aria-busy', 'true');
  mostrarMensagem('');
  try {
    await fazer();
  } catch {
    mostrarMensagem('Algo deu errado. Confira a sua conexão e tente de novo.');
  } finally {
    ocupado = false;
    document.body.removeAttribute('aria-busy');
  }
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

$('#form-entrar').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(entrar);
});

async function entrar() {
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
  await abrirMeusBoards();
}

$('#sair').addEventListener('click', () => acao(sair));

async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    mostrarMensagem('Não foi possível sair. Tente de novo.');
  }
  // Se deu certo, quem volta para a tela de entrar é o onAuthStateChange (evento SIGNED_OUT) abaixo.
}

/** Volta para a tela de entrar (depois de sair ou se a sessão acabar). */
function voltarParaEntrar() {
  $('#sair').hidden = true;
  modoCadastro = false; // quem acabou de sair quer "Entrar", não "Criar conta"
  atualizarModo();
  mostrarTela('tela-entrar');
}

// Se a sessão acabar por outro motivo (ex.: saiu em outra aba), a tela acompanha.
// O supabase-js já renova o token sozinho; este aviso cobre o caso em que a sessão é encerrada.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') voltarParaEntrar();
});

// ---------- Tela 2: meus boards ----------

async function abrirMeusBoards() {
  mostrarTela('tela-boards');
  $('#sair').hidden = false;
  $('#lista-boards').replaceChildren(); // apaga a lista antiga enquanto a nova não chega

  // O RLS ("ver meus boards") faz o banco devolver só os boards de que a pessoa é membro.
  const { data: boards, error } = await supabase.from('boards').select(CAMPOS_BOARD).order('criado_em');
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
    item.append(criarBotao(board.nome, `Abrir o board ${board.nome}`, () => acao(() => abrirBoard(board))));
    lista.append(item);
  }
}

$('#form-board').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(criarBoard);
});

async function criarBoard() {
  const nome = $('#nome-board-novo').value;
  const erros = validarNome(nome, 'do board');
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }

  // O gatilho preparar_board cria as 5 colunas padrão e coloca quem criou como membro.
  const { data: board, error } = await supabase
    .from('boards').insert({ nome: nome.trim() }).select(CAMPOS_BOARD).single();
  if (error) {
    mostrarMensagem('Não foi possível criar o board.');
    return;
  }
  $('#form-board').reset();
  await abrirBoard(board);
}

$('#form-convite').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(entrarComCodigo);
});

async function entrarComCodigo() {
  const digitado = $('#codigo-convite').value;
  const erros = validarCodigoConvite(digitado);
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }

  // entrar_no_board (schema.sql) procura o board pelo código e coloca a pessoa como membro.
  // Se ela já era membro, nada muda e o board só abre. Código que não existe: o banco recusa.
  const { data: idBoard, error } = await supabase.rpc('entrar_no_board', { p_codigo: normalizarCodigo(digitado) });
  if (error) {
    // A frase do banco para código errado é a mesma de validarCodigoConvite (teste da regra 2).
    const codigoErrado = error.message === 'Código de convite inválido.';
    mostrarMensagem(codigoErrado ? error.message : 'Não foi possível entrar no board.');
    return;
  }

  // Agora que é membro, o RLS deixa ler o board.
  const { data: board, error: erroBoard } = await supabase
    .from('boards').select(CAMPOS_BOARD).eq('id', idBoard).single();
  if (erroBoard) {
    mostrarMensagem('Você entrou no board, mas não foi possível abri-lo. Volte a Meus boards.');
    return;
  }
  $('#form-convite').reset();
  await abrirBoard(board);
}

// ---------- Tela 3: o board com as colunas ----------

let boardAtual = null;
let colunasAtuais = []; // só as ativas (sem as arquivadas), na ordem do board

async function abrirBoard(board) {
  boardAtual = board;
  mostrarTela('tela-board');
  $('#nome-board').textContent = board.nome;
  $('#codigo-board').textContent = board.codigo_convite;
  $('#lista-membros').replaceChildren(); // apaga os membros do board anterior
  $('#titulo-membros').textContent = 'Membros'; // e a contagem antiga também (revisão do Paulo)
  await desenharColunas(); // desenha também a lista de membros (desenharMembros)
}

/**
 * Lista quem é membro do board (história 2), na ordem em que cada um entrou.
 * Os dados vêm de desenharColunas, que já busca membros e perfis para os cartões (história 3).
 */
function desenharMembros(membros, perfis) {
  const nomes = nomesDosMembros(membros, perfis);
  $('#titulo-membros').textContent = `Membros (${nomes.length}):`;
  $('#lista-membros').replaceChildren(...nomes.map((nome) => {
    const item = document.createElement('li');
    item.textContent = nome; // textContent: nome digitado pelo usuário nunca vira HTML
    return item;
  }));
}

$('#voltar').addEventListener('click', () => acao(abrirMeusBoards));

/**
 * Busca tudo o que o board mostra e desenha o quadro: colunas, cartões, o histórico de cada cartão
 * e os membros (para o nome do responsável, de quem moveu e a lista do formulário de cartão novo).
 * O RLS só devolve dados de boards de que a pessoa é membro.
 */
async function desenharColunas() {
  const [colunas, cartoes, membros] = await Promise.all([
    // Todas as colunas, inclusive as arquivadas: o histórico mostra o nome delas.
    supabase.from('colunas').select('id, nome, posicao, limite_wip, papel, arquivada')
      .eq('board_id', boardAtual.id).order('posicao'),
    supabase.from('cartoes').select('id, coluna_id, titulo, pontos, responsavel_id')
      .eq('board_id', boardAtual.id).order('criado_em'),
    supabase.from('membros').select('usuario_id, entrou_em').eq('board_id', boardAtual.id),
  ]);
  if (colunas.error || cartoes.error || membros.error) {
    mostrarMensagem('Não foi possível carregar o board.');
    return;
  }
  // Movimentos e perfis dependem dos ids que acabaram de chegar, por isso vêm numa segunda busca.
  // (membros e perfis ligam em auth.users, não uma na outra, por isso não dá para buscar juntos.)
  const [movimentos, perfis] = await Promise.all([
    supabase.from('movimentos')
      .select('id, cartao_id, de_coluna_id, para_coluna_id, movido_por, movido_em')
      .in('cartao_id', cartoes.data.map((c) => c.id)),
    supabase.from('perfis').select('id, nome').in('id', membros.data.map((m) => m.usuario_id)),
  ]);
  if (movimentos.error || perfis.error) {
    mostrarMensagem('Não foi possível carregar o board.');
    return;
  }

  colunasAtuais = colunas.data.filter((c) => !c.arquivada);
  desenharMembros(membros.data, perfis.data);
  preencherResponsaveis(perfis.data);
  const cartoesNa = (idColuna) => cartoes.data.filter((c) => c.coluna_id === idColuna);
  const quantidadeNa = (idColuna) => cartoesNa(idColuna).length;

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
      criarBotao('Renomear', `Renomear a coluna ${coluna.nome}`, () => acao(() => renomearColuna(coluna))),
      criarBotao('←', `Mover ${coluna.nome} uma posição para trás`,
        () => acao(() => reordenarColuna(coluna.id, -1)), i === 0),
      criarBotao('→', `Mover ${coluna.nome} uma posição para frente`,
        () => acao(() => reordenarColuna(coluna.id, +1)), i === colunasAtuais.length - 1),
      // Colunas com papel (início/fim das métricas) não podem ser excluídas: o botão já vem desativado.
      criarBotao('Excluir',
        coluna.papel ? `${coluna.nome} é usada nas métricas e não pode ser excluída` : `Excluir a coluna ${coluna.nome}`,
        () => acao(() => excluirColuna(coluna, quantidade)), Boolean(coluna.papel)),
    );

    const secao = document.createElement('section');
    secao.className = 'coluna';
    secao.append(titulo, acoes);

    // Texto visível com o motivo do "Excluir" desativado (o title de botão desativado
    // nem sempre aparece no navegador).
    if (coluna.papel) {
      const aviso = document.createElement('p');
      aviso.className = 'aviso-papel';
      aviso.textContent = coluna.papel === 'inicio'
        ? 'Início do fluxo nas métricas: não pode ser excluída.'
        : 'Fim do fluxo nas métricas: não pode ser excluída.';
      secao.append(aviso);
    }

    // Cartões da coluna (história 3).
    const lista = document.createElement('ol');
    lista.className = 'cartoes';
    lista.setAttribute('aria-label', `Cartões em ${coluna.nome}`);
    for (const cartao of cartoesNa(coluna.id)) {
      const doCartao = movimentos.data.filter((m) => m.cartao_id === cartao.id);
      lista.append(desenharCartao(cartao, doCartao, colunas.data, perfis.data));
    }
    secao.append(lista);
    quadro.append(secao);
  });
}

/**
 * Um cartão: título, pontos e responsável; botões ← → (mover) e Desfazer; e o histórico.
 * Todo texto do usuário entra por textContent.
 */
function desenharCartao(cartao, movimentos, todasAsColunas, perfis) {
  const item = document.createElement('li');
  item.className = 'cartao';

  const titulo = document.createElement('p');
  titulo.className = 'titulo-cartao';
  titulo.textContent = cartao.titulo;
  item.append(titulo);

  const detalhes = [];
  if (cartao.pontos !== null) detalhes.push(`${cartao.pontos} pt`);
  if (cartao.responsavel_id) {
    detalhes.push(perfis.find((p) => p.id === cartao.responsavel_id)?.nome ?? 'Membro sem nome');
  }
  if (detalhes.length > 0) {
    const info = document.createElement('p');
    info.className = 'info-cartao';
    info.textContent = detalhes.join(' · ');
    item.append(info);
  }

  // Botões em vez de arrastar: funcionam no celular e no teclado.
  const esquerda = colunaVizinha(colunasAtuais, cartao.coluna_id, -1);
  const direita = colunaVizinha(colunasAtuais, cartao.coluna_id, +1);
  const voltarPara = movimentoParaDesfazer(movimentos);
  const nomeDa = (id) => todasAsColunas.find((c) => c.id === id)?.nome;
  const acoes = document.createElement('div');
  acoes.className = 'acoes';
  acoes.append(
    criarBotao('←', esquerda ? `Mover "${cartao.titulo}" para ${nomeDa(esquerda)}` : 'Não há coluna à esquerda',
      () => acao(() => moverCartao(cartao.id, esquerda)), !esquerda),
    criarBotao('→', direita ? `Mover "${cartao.titulo}" para ${nomeDa(direita)}` : 'Não há coluna à direita',
      () => acao(() => moverCartao(cartao.id, direita)), !direita),
    // Desfazer = movimento NOVO de volta para a coluna de origem; nada é apagado do histórico.
    criarBotao('Desfazer',
      voltarPara ? `Desfazer o último movimento de "${cartao.titulo}" (volta para ${nomeDa(voltarPara)})`
        : 'O cartão acabou de ser criado: não há movimento para desfazer',
      () => acao(() => moverCartao(cartao.id, voltarPara)), !voltarPara),
  );
  item.append(acoes);

  // Histórico só para ler: não há botão de editar nem de apagar (e o banco também não deixa).
  const historico = montarHistorico(movimentos, todasAsColunas, perfis);
  const caixa = document.createElement('details');
  const resumo = document.createElement('summary');
  resumo.textContent = `Histórico (${historico.length})`;
  const linhas = document.createElement('ol');
  linhas.className = 'historico';
  for (const h of historico) {
    const linha = document.createElement('li');
    linha.textContent = `${h.quando} · ${h.texto} · ${h.quem}`;
    linhas.append(linha);
  }
  caixa.append(resumo, linhas);
  item.append(caixa);
  return item;
}

/**
 * Move o cartão pela função mover_cartao do banco: ela confere o WIP, muda a coluna e grava
 * o movimento (origem, destino, data e hora, quem moveu), tudo junto.
 */
async function moverCartao(idCartao, paraColuna) {
  if (!paraColuna) return;
  const { error } = await supabase.rpc('mover_cartao', { p_cartao: idCartao, p_para_coluna: paraColuna });
  if (error) {
    mostrarMensagem(error.message); // a mensagem do banco já está em português (ex.: limite de WIP)
    return;
  }
  await desenharColunas();
}

/** Lista "Responsável" do formulário de cartão novo: ninguém ou um dos membros do board. */
function preencherResponsaveis(perfis) {
  const lista = $('#responsavel-novo');
  const escolhido = lista.value;
  const ninguem = document.createElement('option');
  ninguem.value = '';
  ninguem.textContent = 'Ninguém';
  const opcoes = [...perfis]
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    .map((p) => {
      const opcao = document.createElement('option');
      opcao.value = p.id;
      opcao.textContent = p.nome;
      return opcao;
    });
  lista.replaceChildren(ninguem, ...opcoes);
  // Mantém a escolha se a pessoa ainda estiver na lista (o quadro é redesenhado a cada ação).
  lista.value = opcoes.some((o) => o.value === escolhido) ? escolhido : '';
}

$('#form-cartao').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(criarCartao);
});

/** Cria o cartão na primeira coluna do board. O gatilho registrar_criacao grava o 1º movimento. */
async function criarCartao() {
  const titulo = $('#titulo-cartao-novo').value;
  const pontos = $('#pontos-cartao-novo').value;
  const erros = validarCartao({ titulo, pontos });
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  // Só os campos que o banco deixa mandar (grant insert): criado_em e criado_por vêm do banco.
  const { error } = await supabase.from('cartoes').insert({
    board_id: boardAtual.id,
    coluna_id: colunasAtuais[0].id, // a primeira coluna (colunasAtuais já vem na ordem do board)
    titulo: titulo.trim(),
    pontos: pontos.trim() === '' ? null : Number(pontos),
    responsavel_id: $('#responsavel-novo').value || null,
  });
  if (error) {
    mostrarMensagem('Não foi possível criar o cartão.');
    return;
  }
  $('#form-cartao').reset();
  await desenharColunas();
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
  // regras.js calcula a nova ordem e quais colunas mudaram; aqui só gravamos essas.
  // (Ainda são updates separados; uma função no banco que grave tudo de uma vez fica para a Sprint 2.)
  const novaOrdem = moverColunaNaOrdem(colunasAtuais, idColuna, direcao);
  const mudaram = colunasQueMudaram(colunasAtuais, novaOrdem);
  const resultados = await Promise.all(
    mudaram.map((c) => supabase.from('colunas').update({ posicao: c.posicao }).eq('id', c.id)),
  );
  if (resultados.some((r) => r.error)) {
    mostrarMensagem('Não foi possível mudar a ordem das colunas.');
  }
  await desenharColunas();
}

async function excluirColuna(coluna, quantidadeCartoes) {
  const erros = podeArquivarColuna({ quantidadeCartoes, papel: coluna.papel });
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

$('#form-coluna').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(criarColuna);
});

async function criarColuna() {
  const nome = $('#nome-coluna-nova').value;
  const erros = validarNome(nome, 'da coluna');
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  // A coluna nova entra no fim (proximaPosicao, em regras.js).
  const { error } = await supabase.from('colunas')
    .insert({ board_id: boardAtual.id, nome: nome.trim(), posicao: proximaPosicao(colunasAtuais) });
  if (error) {
    mostrarMensagem('Não foi possível criar a coluna.');
    return;
  }
  $('#form-coluna').reset();
  await desenharColunas();
}

// ---------- Início ----------
// A sessão do Supabase fica guardada no navegador: quem já entrou vai direto para os boards.
atualizarModo();
const { data: { session }, error } = await supabase.auth.getSession();
if (error) {
  mostrarTela('tela-entrar');
  mostrarMensagem('Não foi possível conectar ao Supabase.');
} else if (session) {
  acao(abrirMeusBoards);
} else {
  mostrarTela('tela-entrar');
}
