// Telas do Ritmo. História 1: entrar/cadastrar, meus boards e o board com as colunas.
// História 4: limite de WIP e política por coluna, justificativa ao passar do limite e lista para o SM.
// Segurança: texto digitado pelo usuário entra na página só por textContent (nunca innerHTML),
// para ninguém conseguir injetar HTML ou script pelo nome de um board ou coluna.
import { supabase } from './supabase.js';
import {
  situacaoWip, validarMovimento, lerLimiteWip, lerPolitica, passagensDeWip,
  validarCredenciais, validarCadastro, traduzirErroAuth,
  validarNome, moverColunaNaOrdem, podeArquivarColuna, proximaPosicao, colunasQueMudaram,
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
    .from('boards').insert({ nome: nome.trim() }).select('id, nome').single();
  if (error) {
    mostrarMensagem('Não foi possível criar o board.');
    return;
  }
  $('#form-board').reset();
  await abrirBoard(board);
}

// ---------- Tela 3: o board com as colunas ----------

let boardAtual = null;
let colunasAtuais = [];

async function abrirBoard(board) {
  boardAtual = board;
  mostrarTela('tela-board');
  $('#nome-board').textContent = board.nome;
  $('#lista-passagens').replaceChildren(); // apaga as passagens do board anterior
  await Promise.all([desenharColunas(), desenharPassagens()]);
}

$('#voltar').addEventListener('click', () => acao(abrirMeusBoards));

/** Busca as colunas (sem as arquivadas) e quantos cartões há em cada uma, e desenha o quadro. */
async function desenharColunas() {
  const [colunas, cartoes] = await Promise.all([
    supabase.from('colunas').select('id, nome, posicao, limite_wip, politica, papel')
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

/** Muda o limite de WIP e a política de entrada da coluna (história 4). */
async function editarWipEPolitica(coluna) {
  const digitado = prompt(
    `Limite de WIP da coluna "${coluna.nome}" (deixe vazio para não ter limite):`,
    coluna.limite_wip ?? '',
  );
  if (digitado === null) return; // clicou em Cancelar
  const { limite, erros } = lerLimiteWip(digitado);
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return;
  }
  const politica = prompt(
    `Política de entrada da coluna "${coluna.nome}" (ex.: "Só entra com critério de aceite claro"; vazio = sem política):`,
    coluna.politica ?? '',
  );
  if (politica === null) return;

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
 * pede a justificativa. Quem chama é o mover da história 3, que depois manda a justificativa para a
 * mover_cartao (p_justificativa). O banco confere de novo, porque pode ter entrado outro cartão.
 * Ainda não é usada: será ligada ao botão de mover quando a história 3 entrar na main.
 * @param {{id: string, nome: string, limite_wip: number|null, politica: string|null}} destino
 * @param {string} deColunaId coluna onde o cartão está agora
 * @param {number} quantidadeNoDestino cartões que já estão no destino
 * @returns {{pode: boolean, justificativa: string|null}} pode = false quando a pessoa desistiu
 */
function pedirJustificativaSePreciso(destino, deColunaId, quantidadeNoDestino) {
  const paraColuna = { id: destino.id, limiteWip: destino.limite_wip };
  const { cheia, texto } = situacaoWip(paraColuna, quantidadeNoDestino);
  if (!cheia) return { pode: true, justificativa: null }; // cabe (ou não tem limite): não pergunta nada

  const politica = destino.politica ? `\nPolítica da coluna: ${destino.politica}` : '';
  const justificativa = prompt(
    `A coluna "${destino.nome}" está no limite de WIP (${texto}).${politica}\n`
    + 'Para mover mesmo assim, escreva a justificativa (o Scrum Master vai ver):',
  );
  if (justificativa === null) return { pode: false, justificativa: null }; // Cancelar
  const erros = validarMovimento({ deColunaId, paraColuna, quantidadeNoDestino, justificativa });
  if (erros.length > 0) {
    mostrarMensagem(erros.join(' '));
    return { pode: false, justificativa: null };
  }
  return { pode: true, justificativa: justificativa.trim() };
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
