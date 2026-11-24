// Telas do Ritmo. História 1: entrar/cadastrar, meus boards e o board com as colunas.
// História 2: código de convite, entrar no board por código e lista de membros.
// História 3: cartões, mover entre colunas (botões ← →), desfazer e histórico de movimentos.
// História 4: limite de WIP e política por coluna, justificativa ao passar do limite e lista para o SM.
// História 5: Lead Time, Cycle Time e Throughput do período escolhido, com o valor de cada cartão.
// História 6: Sprints (datas e cartões escolhidos) e o burndown de cada uma, em SVG feito à mão.
// História 7: CFD do período das métricas (áreas empilhadas em SVG), com tabela e "Baixar CSV".
// Segurança: texto digitado pelo usuário entra na página só por textContent (nunca innerHTML),
// para ninguém conseguir injetar HTML ou script pelo nome de um board ou coluna.
import { supabase } from './supabase.js';
import {
  situacaoWip, validarMovimento, lerLimiteWip, lerPolitica, passagensDeWip,
  validarCredenciais, validarCadastro, traduzirErroAuth,
  validarNome, moverColunaNaOrdem, podeArquivarColuna, proximaPosicao, colunasQueMudaram,
  normalizarCodigo, validarCodigoConvite, nomesDosMembros,
  validarCartao, colunaVizinha, montarHistorico, movimentoParaDesfazer,
  metricasDoFluxo, formatarDias, formatarDataHora, periodoPadrao, validarPeriodo,
  validarSprint, burndown, diaEmSaoPaulo,
  cfd, cfdParaCsv,
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

/**
 * Abre a caixa de diálogo da página (#dialogo, index.html), no lugar do prompt() e do confirm()
 * do navegador. Diferenças: tem o visual do Ritmo, mostra vários campos de uma vez e, se o valor
 * estiver errado, mostra o erro dentro da caixa e deixa a pessoa corrigir sem perder o que digitou.
 * Texto vindo do usuário (nome da coluna, política) entra só por textContent e value.
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} [opcoes.texto] explicação acima dos campos (\n quebra a linha)
 * @param {{rotulo: string, valor?: string, multilinha?: boolean, inputmode?: string}[]} opcoes.campos
 *        lista vazia = só confirmar (como o confirm())
 * @param {string} opcoes.botaoOk texto do botão que confirma (ex.: "Renomear")
 * @param {(valores: string[]) => string[]} [opcoes.validar] devolve os erros; vazio = pode fechar
 * @returns {Promise<string[]|null>} valores digitados, na ordem dos campos; null = Cancelar ou Esc
 */
function perguntar({ titulo, texto = '', campos, botaoOk, validar = () => [] }) {
  const dialogo = $('#dialogo');
  $('#dialogo-titulo').textContent = titulo;
  $('#dialogo-texto').textContent = texto;
  $('#dialogo-texto').hidden = texto === '';
  $('#dialogo-erro').textContent = '';
  $('#dialogo-ok').textContent = botaoOk;

  const entradas = campos.map((campo) => {
    const rotulo = document.createElement('label');
    rotulo.textContent = campo.rotulo;
    const entrada = document.createElement(campo.multilinha ? 'textarea' : 'input');
    if (!campo.multilinha) entrada.type = 'text';
    entrada.value = campo.valor ?? '';
    entrada.autocomplete = 'off';
    if (campo.inputmode) entrada.inputMode = campo.inputmode;
    rotulo.append(entrada);
    return entrada;
  });
  $('#dialogo-campos').replaceChildren(...entradas.map((entrada) => entrada.parentElement));

  return new Promise((resolver) => {
    const form = $('#dialogo-form');
    const cancelar = $('#dialogo-cancelar');

    function aoConfirmar(evento) {
      evento.preventDefault();
      const valores = entradas.map((entrada) => entrada.value);
      const erros = validar(valores);
      if (erros.length > 0) {
        $('#dialogo-erro').textContent = erros.join(' '); // a caixa continua aberta
        return;
      }
      fechar(valores);
    }
    function aoCancelar(evento) {
      evento.preventDefault(); // Esc: quem fecha é o fechar(), para tirar os listeners junto
      fechar(null);
    }
    function fechar(resultado) {
      form.removeEventListener('submit', aoConfirmar);
      cancelar.removeEventListener('click', aoCancelar);
      dialogo.removeEventListener('cancel', aoCancelar);
      dialogo.close();
      resolver(resultado);
    }

    form.addEventListener('submit', aoConfirmar);
    cancelar.addEventListener('click', aoCancelar);
    dialogo.addEventListener('cancel', aoCancelar); // tecla Esc
    dialogo.showModal();
    // Foco no primeiro campo. Sem campos (excluir), o foco fica no Cancelar: Enter sem querer não exclui.
    (entradas[0] ?? cancelar).focus();
  });
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
let cartoesAtuais = []; // cartões do board, para contar quantos há no destino (WIP, história 4)
// Dados que as métricas usam (história 5): os mesmos que o quadro acabou de buscar, sem nova busca.
let dadosDoFluxo = { cartoes: [], movimentos: [], colunas: [] };
// Sprints do board aberto (história 6) e as ligações sprint_cartoes ({ sprint_id, cartao_id }).
let sprintsDoBoard = [];
let cartoesDasSprints = [];

async function abrirBoard(board) {
  boardAtual = board;
  mostrarTela('tela-board');
  $('#nome-board').textContent = board.nome;
  $('#codigo-board').textContent = board.codigo_convite;
  $('#lista-membros').replaceChildren(); // apaga os membros do board anterior
  $('#titulo-membros').textContent = 'Membros'; // e a contagem antiga também (revisão do Paulo)
  $('#lista-passagens').replaceChildren(); // apaga as passagens do board anterior
  // Sprints e dados do board anterior não podem aparecer no novo (história 6).
  dadosDoFluxo = { cartoes: [], movimentos: [], colunas: [] };
  sprintsDoBoard = [];
  cartoesDasSprints = [];
  limparCfd(); // o CFD do board anterior também não (história 7)
  $('#sprint-escolhida').replaceChildren();
  // desenharColunas desenha também a lista de membros (desenharMembros).
  await Promise.all([desenharColunas(), desenharPassagens(), carregarSprints()]);
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
    // politica (história 4) aparece abaixo do título da coluna.
    supabase.from('colunas').select('id, nome, posicao, limite_wip, politica, papel, arquivada')
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
    // movimentos não tem board_id: o cartoes!inner junta o cartão e filtra pelo board dele.
    // (Antes era .in() com a lista de ids dos cartões, que cresce com o board; revisão do PR #15.)
    supabase.from('movimentos')
      .select('id, cartao_id, de_coluna_id, para_coluna_id, movido_por, movido_em, cartoes!inner(board_id)')
      .eq('cartoes.board_id', boardAtual.id),
    supabase.from('perfis').select('id, nome').in('id', membros.data.map((m) => m.usuario_id)),
  ]);
  if (movimentos.error || perfis.error) {
    mostrarMensagem('Não foi possível carregar o board.');
    return;
  }

  colunasAtuais = colunas.data.filter((c) => !c.arquivada);
  cartoesAtuais = cartoes.data;
  dadosDoFluxo = { cartoes: cartoes.data, movimentos: movimentos.data, colunas: colunas.data };
  desenharMetricas(); // a cada movimento, as métricas acompanham
  preencherCartoesParaSprint(); // cartão novo já aparece para escolher na Sprint
  desenharBurndown(); // e o burndown também acompanha cada movimento
  desenharCfd(); // e o CFD (história 7)
  desenharMembros(membros.data, perfis.data);
  preencherResponsaveis(perfis.data);
  const cartoesNa = (idColuna) => cartoes.data.filter((c) => c.coluna_id === idColuna);
  const quantidadeNa = (idColuna) => cartoesNa(idColuna).length;

  const quadro = $('#quadro');
  quadro.replaceChildren();
  colunasAtuais.forEach((coluna, i) => {
    const quantidade = quantidadeNa(coluna.id);
    const { texto, cheia, acima } = situacaoWip({ limiteWip: coluna.limite_wip }, quantidade);

    const nome = document.createElement('span');
    nome.textContent = coluna.nome;
    const wip = document.createElement('span');
    // "2/2" no topo (história 4): em destaque quando a coluna enche e em vermelho quando passa.
    wip.className = acima ? 'wip acima' : cheia ? 'wip cheia' : 'wip';
    wip.textContent = texto;
    wip.title = coluna.limite_wip == null
      ? 'Cartões na coluna (sem limite de WIP)'
      : 'Cartões na coluna / limite de WIP';
    const titulo = document.createElement('h3');
    titulo.append(nome, wip);

    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    acoes.append(
      criarBotao('Renomear', `Renomear a coluna ${coluna.nome}`, () => acao(() => renomearColuna(coluna))),
      criarBotao('WIP e política', `Mudar o limite de WIP e a política da coluna ${coluna.nome}`,
        () => acao(() => editarWipEPolitica(coluna))),
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
    secao.append(titulo);
    // Política de entrada (história 4), visível no topo. textContent: texto do usuário nunca vira HTML.
    if (coluna.politica) {
      const politica = document.createElement('p');
      politica.className = 'politica';
      politica.textContent = `Política: ${coluna.politica}`;
      secao.append(politica);
    }
    secao.append(acoes);

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
      () => acao(() => moverCartao(cartao, esquerda)), !esquerda),
    criarBotao('→', direita ? `Mover "${cartao.titulo}" para ${nomeDa(direita)}` : 'Não há coluna à direita',
      () => acao(() => moverCartao(cartao, direita)), !direita),
    // Desfazer = movimento NOVO de volta para a coluna de origem; nada é apagado do histórico.
    criarBotao('Desfazer',
      voltarPara ? `Desfazer o último movimento de "${cartao.titulo}" (volta para ${nomeDa(voltarPara)})`
        : 'O cartão acabou de ser criado: não há movimento para desfazer',
      () => acao(() => moverCartao(cartao, voltarPara)), !voltarPara),
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
 * o movimento (origem, destino, data e hora, quem moveu e a justificativa), tudo junto.
 * Serve para os botões ← → e para o Desfazer (história 3).
 */
async function moverCartao(cartao, paraColuna) {
  if (!paraColuna) return;
  // Desfazer pode apontar para uma coluna que foi arquivada depois: ela não está mais no board.
  const destino = colunasAtuais.find((c) => c.id === paraColuna);
  if (!destino) {
    mostrarMensagem('A coluna de destino não existe neste board.');
    return;
  }
  // História 4: se o destino está no limite de WIP, avisa e pede a justificativa antes de mover.
  const quantidadeNoDestino = cartoesAtuais.filter((c) => c.coluna_id === paraColuna).length;
  const { pode, justificativa } = await pedirJustificativaSePreciso(destino, cartao.coluna_id, quantidadeNoDestino);
  if (!pode) return; // cancelou ou deixou a justificativa vazia: o cartão fica onde está

  const { error } = await supabase.rpc('mover_cartao', {
    p_cartao: cartao.id, p_para_coluna: paraColuna, p_justificativa: justificativa,
  });
  if (error) {
    mostrarMensagem(error.message); // a mensagem do banco já está em português (ex.: limite de WIP)
    return;
  }
  // A passagem do limite aparece na hora na lista do Scrum Master.
  await Promise.all([desenharColunas(), desenharPassagens()]);
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
  const valores = await perguntar({
    titulo: 'Renomear coluna',
    campos: [{ rotulo: 'Novo nome da coluna', valor: coluna.nome }],
    botaoOk: 'Renomear',
    validar: ([nome]) => validarNome(nome, 'da coluna'),
  });
  if (valores === null) return; // clicou em Cancelar
  const [novoNome] = valores;
  const { error } = await supabase.from('colunas').update({ nome: novoNome.trim() }).eq('id', coluna.id);
  if (error) {
    mostrarMensagem('Não foi possível renomear a coluna.');
    return;
  }
  await desenharColunas();
}

/** Muda o limite de WIP e a política de entrada da coluna (história 4). */
async function editarWipEPolitica(coluna) {
  // Os dois campos na mesma caixa (antes eram dois prompt() seguidos).
  const valores = await perguntar({
    titulo: `WIP e política de "${coluna.nome}"`,
    campos: [
      { rotulo: 'Limite de WIP (vazio = sem limite)', valor: String(coluna.limite_wip ?? ''), inputmode: 'numeric' },
      { rotulo: 'Política de entrada (ex.: "Só entra com critério de aceite claro"; vazio = sem política)',
        valor: coluna.politica ?? '', multilinha: true },
    ],
    botaoOk: 'Salvar',
    validar: ([digitado]) => lerLimiteWip(digitado).erros,
  });
  if (valores === null) return; // clicou em Cancelar
  const [digitado, politica] = valores;
  const { limite } = lerLimiteWip(digitado); // já conferido no validar

  const { error } = await supabase.from('colunas')
    .update({ limite_wip: limite, politica: lerPolitica(politica) }).eq('id', coluna.id);
  if (error) {
    mostrarMensagem('Não foi possível salvar o limite de WIP e a política.');
    return;
  }
  await desenharColunas();
}

/**
 * Antes de mover um cartão (história 4): se a coluna de destino está no limite de WIP, avisa e
 * pede a justificativa. Quem chama é o moverCartao (história 3), que depois manda a justificativa para a
 * mover_cartao (p_justificativa). O banco confere de novo, porque pode ter entrado outro cartão.
 * @param {{id: string, nome: string, limite_wip: number|null, politica: string|null}} destino
 * @param {string} deColunaId coluna onde o cartão está agora
 * @param {number} quantidadeNoDestino cartões que já estão no destino
 * @returns {Promise<{pode: boolean, justificativa: string|null}>} pode = false quando a pessoa desistiu
 */
async function pedirJustificativaSePreciso(destino, deColunaId, quantidadeNoDestino) {
  const paraColuna = { id: destino.id, limiteWip: destino.limite_wip };
  const { cheia, texto } = situacaoWip(paraColuna, quantidadeNoDestino);
  if (!cheia) return { pode: true, justificativa: null }; // cabe (ou não tem limite): não pergunta nada

  const politica = destino.politica ? `\nPolítica da coluna: ${destino.politica}` : '';
  // validarMovimento (regras.js) é a mesma regra da mover_cartao: justificativa vazia ou só com
  // espaços não passa. O erro aparece na caixa, e a pessoa pode escrever ou cancelar.
  const valores = await perguntar({
    titulo: 'Coluna no limite de WIP',
    texto: `A coluna "${destino.nome}" está no limite de WIP (${texto}).${politica}`,
    campos: [{ rotulo: 'Para mover mesmo assim, escreva a justificativa (o Scrum Master vai ver)', multilinha: true }],
    botaoOk: 'Mover mesmo assim',
    validar: ([justificativa]) => validarMovimento({ deColunaId, paraColuna, quantidadeNoDestino, justificativa }),
  });
  if (valores === null) return { pode: false, justificativa: null }; // Cancelar
  return { pode: true, justificativa: valores[0].trim() };
}

/**
 * Passagens do limite de WIP, para o Scrum Master (história 4): movimentos com justificativa.
 * movimentos não tem board_id; o cartoes!inner junta o cartão e filtra pelo board dele.
 * As colunas vêm inclusive as arquivadas, porque o histórico pode ter passado por elas.
 */
async function desenharPassagens() {
  const [movimentos, colunas] = await Promise.all([
    supabase.from('movimentos')
      .select('id, de_coluna_id, para_coluna_id, movido_por, movido_em, justificativa, cartoes!inner(titulo, board_id)')
      .eq('cartoes.board_id', boardAtual.id).not('justificativa', 'is', null),
    supabase.from('colunas').select('id, nome').eq('board_id', boardAtual.id),
  ]);
  if (movimentos.error || colunas.error) {
    mostrarMensagem('Não foi possível carregar as passagens do limite de WIP.');
    return;
  }
  const idsPessoas = [...new Set(movimentos.data.map((m) => m.movido_por))];
  const perfis = await supabase.from('perfis').select('id, nome').in('id', idsPessoas);
  if (perfis.error) {
    mostrarMensagem('Não foi possível carregar as passagens do limite de WIP.');
    return;
  }

  const passagens = passagensDeWip(movimentos.data, colunas.data, perfis.data);
  const lista = $('#lista-passagens');
  if (passagens.length === 0) {
    const vazio = document.createElement('li');
    vazio.textContent = 'Nenhum cartão passou do limite de WIP neste board.';
    lista.replaceChildren(vazio);
    return;
  }
  // textContent em tudo: título, nomes e justificativa foram digitados por usuários.
  lista.replaceChildren(...passagens.map((p) => {
    const item = document.createElement('li');
    const cabecalho = document.createElement('strong');
    cabecalho.textContent = `${p.quando} · ${p.cartao}: ${p.de} → ${p.para} · ${p.quem}`;
    const motivo = document.createElement('p');
    motivo.textContent = `Justificativa: ${p.justificativa}`;
    item.append(cabecalho, motivo);
    return item;
  }));
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
  const confirmou = await perguntar({
    titulo: `Excluir a coluna "${coluna.nome}"?`,
    texto: 'O histórico dos cartões que passaram por ela continua guardado.',
    campos: [],
    botaoOk: 'Excluir',
  });
  if (confirmou === null) return; // Cancelar
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

// ---------- Métricas do fluxo (história 5) ----------
// As contas estão em metricasDoFluxo (regras.js), com as definições e os testes.
// Aqui só lemos o período escolhido e desenhamos as tabelas. Não há busca nova no banco:
// os dados são os que o quadro acabou de buscar (dadosDoFluxo).

// Ao abrir a página, o período são as últimas 4 semanas (periodoPadrao).
{
  const { de, ate } = periodoPadrao(new Date().toISOString());
  $('#metricas-de').value = de;
  $('#metricas-ate').value = ate;
}
$('#metricas-de').addEventListener('change', desenharMetricas);
$('#metricas-ate').addEventListener('change', desenharMetricas);

/** Desenha médias, o valor de cada cartão e o throughput por semana do período escolhido. */
function desenharMetricas() {
  const de = $('#metricas-de').value;
  const ate = $('#metricas-ate').value;
  const resumo = $('#resumo-metricas');
  const erroNoPeriodo = validarPeriodo(de, ate); // a mesma conferência que a metricasDoFluxo faz
  if (erroNoPeriodo) {
    resumo.textContent = erroNoPeriodo;
    $('#tabela-metricas').replaceChildren();
    $('#tabela-throughput').replaceChildren();
    return;
  }

  const r = metricasDoFluxo({ ...dadosDoFluxo, de, ate });
  resumo.textContent = `${r.cartoes.length} cartão(ões) concluído(s) no período · `
    + `Lead Time médio: ${formatarDias(r.leadTimeMedio)} dias · `
    + `Cycle Time médio: ${formatarDias(r.cycleTimeMedio)} dias · `
    // Throughput com até 2 casas: 1 cartão em 4 semanas aparece 0,25 (e não 0,3), como na conta à mão.
    + `Throughput médio: ${r.throughputMedio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} por semana`;

  // Valor de cada cartão, para conferir a conta (critério 3).
  $('#tabela-metricas').replaceChildren(
    linhaDeTabela('th', ['Cartão', 'Criado', 'Início', 'Concluído', 'Lead Time (dias)', 'Cycle Time (dias)']),
    ...r.cartoes.map((c) => linhaDeTabela('td', [
      c.titulo, formatarDataHora(c.criadoEm), c.inicioEm ? formatarDataHora(c.inicioEm) : '—',
      formatarDataHora(c.fimEm), formatarDias(c.leadTime), formatarDias(c.cycleTime),
    ])),
  );
  // Uma linha por semana (segunda a domingo), inclusive as semanas sem nenhum concluído.
  $('#tabela-throughput').replaceChildren(
    linhaDeTabela('th', ['Semana (segunda a domingo)', 'Concluídos']),
    ...r.throughput.map((s) => linhaDeTabela('td', [`a partir de ${diaCurto(s.semana)}`, String(s.concluidos)])),
  );
}

/** "2026-11-16" → "16/11/2026". */
function diaCurto(dia) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

/** Uma linha de tabela com células th (cabeçalho) ou td. textContent: o título é texto do usuário. */
function linhaDeTabela(tipo, textos) {
  const linha = document.createElement('tr');
  linha.append(...textos.map((texto) => {
    const celula = document.createElement(tipo);
    if (tipo === 'th') celula.scope = 'col';
    celula.textContent = texto;
    return celula;
  }));
  return linha;
}

// ---------- Burndown da Sprint (história 6) ----------
// A conta está em burndown (regras.js), com a definição e o teste do exemplo feito à mão.
// Aqui: buscar as Sprints, criar uma nova, escolher qual mostrar e desenhar gráfico e tabela.
// Movimentos e cartões vêm de dadosDoFluxo (o que o quadro acabou de buscar): sem busca nova.

/** Busca as Sprints do board e os cartões de cada uma. escolher = id da Sprint para deixar selecionada. */
async function carregarSprints(escolher) {
  const [sprints, ligacoes] = await Promise.all([
    supabase.from('sprints').select('id, nome, inicio, fim')
      .eq('board_id', boardAtual.id).order('inicio', { ascending: false }), // a mais recente primeiro
    supabase.from('sprint_cartoes').select('sprint_id, cartao_id').eq('board_id', boardAtual.id),
  ]);
  if (sprints.error || ligacoes.error) {
    mostrarMensagem('Não foi possível carregar as Sprints.');
    return;
  }
  sprintsDoBoard = sprints.data;
  cartoesDasSprints = ligacoes.data;

  const lista = $('#sprint-escolhida');
  const antes = escolher ?? lista.value; // mantém a Sprint que estava escolhida
  lista.replaceChildren(...sprintsDoBoard.map((s) => {
    const opcao = document.createElement('option');
    opcao.value = s.id;
    opcao.textContent = `${s.nome} (${diaCurto(s.inicio)} a ${diaCurto(s.fim)})`; // nome é texto do usuário
    return opcao;
  }));
  if (sprintsDoBoard.some((s) => s.id === antes)) lista.value = antes;
  desenharBurndown();
}

$('#sprint-escolhida').addEventListener('change', desenharBurndown);

/** Caixinhas com os cartões do board, para escolher os da Sprint nova. Mantém o que já foi marcado. */
function preencherCartoesParaSprint() {
  const caixa = $('#cartoes-para-sprint');
  const marcados = new Set([...caixa.querySelectorAll('input:checked')].map((i) => i.value));
  caixa.replaceChildren(...cartoesAtuais.map((cartao) => {
    const rotulo = document.createElement('label');
    const caixinha = document.createElement('input');
    caixinha.type = 'checkbox';
    caixinha.value = cartao.id;
    caixinha.checked = marcados.has(cartao.id);
    const pontos = cartao.pontos === null ? 'sem pontos' : `${cartao.pontos} pt`;
    rotulo.append(caixinha, `${cartao.titulo} (${pontos})`); // texto puro, nunca vira HTML
    return rotulo;
  }));
}

$('#form-sprint').addEventListener('submit', (evento) => {
  evento.preventDefault();
  acao(criarSprint);
});

/** Cria a Sprint com os cartões marcados. A criar_sprint grava tudo numa transação só. */
async function criarSprint() {
  const nome = $('#nome-sprint').value;
  const inicio = $('#inicio-sprint').value;
  const fim = $('#fim-sprint').value;
  const cartoes = [...$('#cartoes-para-sprint').querySelectorAll('input:checked')].map((i) => i.value);
  const erros = validarSprint({ nome, inicio, fim, cartoes });
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  const { data: idNova, error } = await supabase.rpc('criar_sprint', {
    p_board: boardAtual.id, p_nome: nome.trim(), p_inicio: inicio, p_fim: fim, p_cartoes: cartoes,
  });
  if (error) {
    mostrarMensagem('Não foi possível criar a Sprint.');
    return;
  }
  $('#form-sprint').reset(); // limpa o nome, as datas e as caixinhas
  await carregarSprints(idNova); // já mostra o burndown da Sprint nova
}

/** Número para a tela, com vírgula e até uma casa: 7.5 → "7,5"; 10 → "10". */
function numero(valor) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Desenha o resumo, o aviso de cartões sem pontos, o gráfico e a tabela da Sprint escolhida. */
function desenharBurndown() {
  const resumo = $('#resumo-burndown');
  const aviso = $('#aviso-sem-pontos');
  const sprint = sprintsDoBoard.find((s) => s.id === $('#sprint-escolhida').value);
  if (!sprint) {
    resumo.textContent = 'Nenhuma Sprint criada ainda. Crie uma acima, com as datas e os cartões.';
    aviso.textContent = '';
    $('#grafico-burndown').replaceChildren();
    $('#tabela-burndown').replaceChildren();
    return;
  }

  const idsDaSprint = new Set(cartoesDasSprints.filter((l) => l.sprint_id === sprint.id).map((l) => l.cartao_id));
  const r = burndown({
    ...dadosDoFluxo,
    cartoes: dadosDoFluxo.cartoes.filter((c) => idsDaSprint.has(c.id)),
    inicio: sprint.inicio,
    fim: sprint.fim,
    hoje: diaEmSaoPaulo(new Date().toISOString()), // dias depois de hoje ainda não têm valor real
  });

  const ultimoDia = r.dias.filter((d) => d.real !== null).at(-1);
  resumo.textContent = `${idsDaSprint.size} cartão(ões) · ${r.total} pontos planejados · `
    + (ultimoDia ? `faltam ${ultimoDia.real} pontos em ${diaCurto(ultimoDia.dia)}`
      : 'a Sprint ainda não começou');
  // Critério 4: cartão sem pontos conta 0 no gráfico, por isso o time precisa ver e estimar.
  aviso.textContent = r.semPontos.length === 0 ? ''
    : `⚠ Cartões sem pontos (contam 0 no burndown; estimem): ${r.semPontos.map((c) => c.titulo).join(', ')}.`;

  $('#grafico-burndown').replaceChildren(graficoBurndown(r));
  // A tabela tem os mesmos números do gráfico, para conferir a conta (e para leitor de tela).
  $('#tabela-burndown').replaceChildren(
    linhaDeTabela('th', ['Dia', 'Ideal (pontos)', 'Real (pontos)']),
    ...r.dias.map((d) => linhaDeTabela('td', [diaCurto(d.dia), numero(d.ideal), d.real === null ? '—' : String(d.real)])),
  );
}

const SVG = 'http://www.w3.org/2000/svg';

/** Cria um elemento SVG com atributos e, se vier, um texto (textContent: nunca vira HTML). */
function elementoSvg(tipo, atributos, texto) {
  const elemento = document.createElementNS(SVG, tipo);
  for (const [nome, valor] of Object.entries(atributos)) elemento.setAttribute(nome, valor);
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

/**
 * Gráfico do burndown em SVG feito à mão (sem biblioteca): eixo de pontos (y) e dias (x),
 * linha ideal tracejada e linha real cheia com um ponto por dia. Passar o mouse num ponto
 * mostra o valor do dia (o <title> do SVG vira a dica do navegador).
 */
function graficoBurndown(r) {
  // Desenha na largura da caixa (de 320 a 640): no celular, o texto continua com 12 px de verdade,
  // em vez de um desenho de 640 encolhido (o texto ficava minúsculo).
  const largura = Math.max(320, Math.min(640, $('#grafico-burndown').clientWidth || 640));
  const altura = 280;
  const margem = { esquerda: 44, direita: 28, topo: 36, base: 32 };
  const areaX = largura - margem.esquerda - margem.direita;
  const areaY = altura - margem.topo - margem.base;
  const maximo = Math.max(r.total, 1); // evita dividir por zero se a Sprint tiver 0 pontos
  const n = r.dias.length;
  // Posição na tela: dia i no eixo x; v pontos no eixo y (0 embaixo, o total em cima).
  const x = (i) => margem.esquerda + (n === 1 ? areaX / 2 : (i * areaX) / (n - 1));
  const y = (v) => margem.topo + areaY - (v / maximo) * areaY;

  const svg = elementoSvg('svg', {
    viewBox: `0 0 ${largura} ${altura}`, class: 'grafico', role: 'img',
    'aria-label': `Burndown: ${r.total} pontos planejados. Os valores de cada dia estão na tabela abaixo.`,
  });

  // Grade e números do eixo y: zero, metade e o total.
  for (const v of [0, maximo / 2, maximo]) {
    svg.append(
      elementoSvg('line', { x1: margem.esquerda, x2: largura - margem.direita, y1: y(v), y2: y(v), class: 'grade' }),
      elementoSvg('text', { x: margem.esquerda - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'eixo' }, numero(v)),
    );
  }
  // Dias no eixo x (dd/mm). Sprint longa: um rótulo a cada "passo" dias, para não encavalar.
  const passo = Math.ceil(n / 8);
  r.dias.forEach((d, i) => {
    if (i % passo === 0 || i === n - 1) {
      svg.append(elementoSvg('text', { x: x(i), y: altura - 10, 'text-anchor': 'middle', class: 'eixo' },
        diaCurto(d.dia).slice(0, 5)));
    }
  });

  // Linhas: "x,y x,y ..." é o formato do polyline.
  const pontosDaLinha = (lista) => lista.map((p) => `${x(p.i)},${y(p.v)}`).join(' ');
  const ideal = r.dias.map((d, i) => ({ i, v: d.ideal }));
  const reais = r.dias.map((d, i) => ({ i, v: d.real, dia: d.dia })).filter((p) => p.v !== null);
  svg.append(elementoSvg('polyline', { points: pontosDaLinha(ideal), class: 'linha-ideal' }));
  svg.append(elementoSvg('polyline', { points: pontosDaLinha(reais), class: 'linha-real' }));
  for (const p of reais) {
    const grupo = elementoSvg('g', {});
    grupo.append(
      elementoSvg('title', {}, `${diaCurto(p.dia)}: faltam ${p.v} pontos (ideal: ${numero(r.dias[p.i].ideal)})`),
      elementoSvg('circle', { cx: x(p.i), cy: y(p.v), r: 10, class: 'alvo' }), // área do mouse
      elementoSvg('circle', { cx: x(p.i), cy: y(p.v), r: 4, class: 'ponto-real' }),
    );
    svg.append(grupo);
  }

  // Legenda em cima, à esquerda: amostra de cada linha + nome (a cor nunca fica sozinha).
  svg.append(
    elementoSvg('line', { x1: margem.esquerda, x2: margem.esquerda + 24, y1: 14, y2: 14, class: 'linha-real' }),
    elementoSvg('text', { x: margem.esquerda + 30, y: 18, class: 'legenda' }, 'Real'),
    elementoSvg('line', { x1: margem.esquerda + 80, x2: margem.esquerda + 104, y1: 14, y2: 14, class: 'linha-ideal' }),
    elementoSvg('text', { x: margem.esquerda + 110, y: 18, class: 'legenda' }, 'Ideal'),
  );
  return svg;
}

// ---------- Diagrama de fluxo cumulativo, CFD (história 7) ----------
// A conta está em cfd (regras.js), com a definição e o teste do exemplo feito à mão; o CSV, em cfdParaCsv.
// O período é o mesmo das métricas da história 5 (decisão do PO): mudar De/Até redesenha os dois.
// Movimentos e colunas vêm de dadosDoFluxo (o que o quadro acabou de buscar): sem busca nova.

// Paleta categórica conferida com o validador da skill dataviz (fundo branco): uma cor por coluna,
// na ordem do board. Da 9ª coluna em diante, cinza (decisão do PO); o nome fica na legenda e na tabela,
// por isso nenhuma coluna depende só da cor.
const CORES_CFD = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const CINZA_CFD = '#8c959f';
const corDaFaixa = (i) => CORES_CFD[i] ?? CINZA_CFD;

let cfdNaTela = null; // o último CFD desenhado: o "Baixar CSV" baixa exatamente o que está na tela

$('#metricas-de').addEventListener('change', desenharCfd);
$('#metricas-ate').addEventListener('change', desenharCfd);

/** Apaga o CFD (ao trocar de board ou com período inválido). */
function limparCfd(textoDoResumo = '') {
  cfdNaTela = null;
  $('#resumo-cfd').textContent = textoDoResumo;
  $('#legenda-cfd').replaceChildren();
  $('#grafico-cfd').replaceChildren();
  $('#tabela-cfd').replaceChildren();
  $('#baixar-cfd').disabled = true;
}

/** Desenha o resumo, a legenda, o gráfico e a tabela do CFD do período escolhido. */
function desenharCfd() {
  const de = $('#metricas-de').value;
  const ate = $('#metricas-ate').value;
  const erroNoPeriodo = validarPeriodo(de, ate); // a mesma conferência que a cfd faz
  if (erroNoPeriodo) {
    limparCfd(erroNoPeriodo);
    return;
  }
  if (dadosDoFluxo.colunas.length === 0) { // o board ainda está carregando
    limparCfd();
    return;
  }

  const r = cfd({
    movimentos: dadosDoFluxo.movimentos, colunas: dadosDoFluxo.colunas, de, ate,
    hoje: diaEmSaoPaulo(new Date().toISOString()), // dias depois de hoje ficam de fora (revisão do PR #22)
  });
  if (r.dias.length === 0) {
    limparCfd('O período escolhido ainda não começou: escolha um "De" até hoje.');
    return;
  }
  cfdNaTela = { r, de, ate };

  const ultimo = r.dias.at(-1);
  const noBoard = ultimo.quantidades.reduce((soma, q) => soma + q, 0);
  $('#resumo-cfd').textContent = `${r.dias.length} dia(s) · no fim de ${diaCurto(ultimo.dia)}, `
    + `${noBoard} cartão(ões) no board`;

  // Legenda: amostra da cor + nome da coluna (textContent: o nome é texto do usuário).
  $('#legenda-cfd').replaceChildren(...r.colunas.map((c, i) => {
    const item = document.createElement('li');
    const amostra = document.createElement('span');
    amostra.className = 'amostra';
    amostra.style.background = corDaFaixa(i);
    const nome = document.createElement('span');
    nome.textContent = c.nome;
    item.append(amostra, nome);
    return item;
  }));

  $('#grafico-cfd').replaceChildren(graficoCfd(r));
  // A tabela tem os mesmos números do gráfico (critério 1), para conferir e para leitor de tela.
  $('#tabela-cfd').replaceChildren(
    linhaDeTabela('th', ['Dia', ...r.colunas.map((c) => c.nome)]),
    ...r.dias.map((d) => linhaDeTabela('td', [diaCurto(d.dia), ...d.quantidades.map(String)])),
  );
  $('#baixar-cfd').disabled = false;
}

// Critério 4: baixar os dados do gráfico em CSV, gerado no navegador (sem servidor).
$('#baixar-cfd').addEventListener('click', () => {
  if (!cfdNaTela) return;
  // O "\uFEFF" no começo (BOM) avisa ao Excel que o texto é UTF-8; sem ele, "Concluído" vira "ConcluÃ­do".
  const arquivo = new Blob(['\uFEFF', cfdParaCsv(cfdNaTela.r)], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(arquivo);
  // Só datas (o nome do board fica de fora): o primeiro e o último dia que estão no arquivo,
  // porque o "Até" escolhido pode estar no futuro e os dias depois de hoje são cortados.
  const { dias } = cfdNaTela.r;
  link.download = `cfd-${dias[0].dia}-a-${dias.at(-1).dia}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); // libera a memória depois que o download começou
});

/**
 * Gráfico do CFD em SVG feito à mão (sem biblioteca): áreas empilhadas, uma por coluna. A última
 * coluna do board fica embaixo e a primeira em cima, como no CFD da Sprint 1 (scripts/metricas.mjs).
 * Passar o mouse num dia mostra quantos cartões havia em cada coluna (o <title> vira a dica).
 */
function graficoCfd(r) {
  // Mesma ideia do burndown: desenha na largura da caixa, para o texto não encolher no celular.
  const largura = Math.max(320, Math.min(640, $('#grafico-cfd').clientWidth || 640));
  const altura = 280;
  const margem = { esquerda: 44, direita: 28, topo: 16, base: 32 }; // 28: o último dd/mm não sai cortado
  const areaX = largura - margem.esquerda - margem.direita;
  const areaY = altura - margem.topo - margem.base;
  const n = r.dias.length;
  const totalDoDia = (d) => d.quantidades.reduce((soma, q) => soma + q, 0);
  const maximo = Math.max(1, ...r.dias.map(totalDoDia)); // board vazio: evita dividir por zero
  // Posição na tela: dia i no eixo x; v cartões no eixo y (0 embaixo, o máximo em cima).
  const x = (i) => margem.esquerda + (n === 1 ? areaX / 2 : (i * areaX) / (n - 1));
  const y = (v) => margem.topo + areaY - (v / maximo) * areaY;

  const svg = elementoSvg('svg', {
    viewBox: `0 0 ${largura} ${altura}`, class: 'grafico', role: 'img',
    'aria-label': `CFD de ${diaCurto(r.dias[0].dia)} a ${diaCurto(r.dias.at(-1).dia)}. `
      + 'Os números de cada dia estão na tabela abaixo.',
  });

  // Grade e números do eixo y (cartões são inteiros): zero, metade e o máximo, sem repetir.
  for (const v of new Set([0, Math.round(maximo / 2), maximo])) {
    svg.append(
      elementoSvg('line', { x1: margem.esquerda, x2: largura - margem.direita, y1: y(v), y2: y(v), class: 'grade' }),
      elementoSvg('text', { x: margem.esquerda - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'eixo' }, String(v)),
    );
  }
  // Dias no eixo x (dd/mm). Período longo: um rótulo a cada "passo" dias, para não encavalar.
  // O último dia sempre tem rótulo; por isso, o rótulo regular colado nele fica de fora
  // (de 02/11 a 24/11, o 23/11 encavalava com o 24/11).
  const passo = Math.ceil(n / 8);
  r.dias.forEach((d, i) => {
    if (i === n - 1 || (i % passo === 0 && n - 1 - i >= passo)) {
      svg.append(elementoSvg('text', { x: x(i), y: altura - 10, 'text-anchor': 'middle', class: 'eixo' },
        diaCurto(d.dia).slice(0, 5)));
    }
  });

  // Período de um dia só: a área vira uma faixa da largura toda (com um ponto só, não teria largura).
  const xs = n === 1 ? [margem.esquerda, largura - margem.direita] : r.dias.map((_, i) => x(i));
  const valoresNosXs = (valores) => (n === 1 ? [valores[0], valores[0]] : valores);

  // Empilha de baixo para cima: começa pela última coluna. "base" é onde a faixa de cada dia começa.
  let base = r.dias.map(() => 0);
  for (let c = r.colunas.length - 1; c >= 0; c -= 1) {
    const topo = r.dias.map((d, i) => base[i] + d.quantidades[c]);
    if (r.dias.some((d) => d.quantidades[c] > 0)) { // coluna vazia o período todo não tem área
      const ida = xs.map((px, i) => `${px},${y(valoresNosXs(topo)[i])}`);           // topo, da esquerda para a direita
      const volta = xs.map((px, i) => `${px},${y(valoresNosXs(base)[i])}`).reverse(); // base, de volta
      // Contorno branco de 2 px: separa uma faixa da outra.
      svg.append(elementoSvg('polygon', {
        points: [...ida, ...volta].join(' '), fill: corDaFaixa(c), stroke: '#fff', 'stroke-width': 2,
        'stroke-linejoin': 'round',
      }));
    }
    base = topo;
  }

  // Uma faixa invisível por dia, por cima de tudo: o hover mostra os números daquele dia.
  const larguraDoDia = n === 1 ? areaX : areaX / (n - 1);
  r.dias.forEach((d, i) => {
    const inicio = Math.max(margem.esquerda, (n === 1 ? margem.esquerda : x(i) - larguraDoDia / 2));
    const fim = Math.min(largura - margem.direita, (n === 1 ? largura - margem.direita : x(i) + larguraDoDia / 2));
    const faixa = elementoSvg('rect', { x: inicio, y: margem.topo, width: fim - inicio, height: areaY, class: 'dia-cfd' });
    faixa.append(elementoSvg('title', {}, `${diaCurto(d.dia)}: `
      + r.colunas.map((c, k) => `${c.nome} ${d.quantidades[k]}`).join(' · ')));
    svg.append(faixa);
  });
  return svg;
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
