import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COLUNAS_PADRAO, situacaoWip, validarMovimento,
  lerLimiteWip, lerPolitica, passagensDeWip,
  validarCredenciais, validarCadastro, traduzirErroAuth, validarNome,
  moverColunaNaOrdem, podeArquivarColuna, proximaPosicao, colunasQueMudaram,
  normalizarCodigo, validarCodigoConvite, nomesDosMembros,
  validarCartao, colunaVizinha, formatarDataHora, montarHistorico, movimentoParaDesfazer,
  diaEmSaoPaulo, segundaDaSemana, diasEntre, datasDoFluxo, metricasDoFluxo, formatarDias, periodoPadrao,
  validarPeriodo,
  validarSprint, diasDaSprint, burndown,
} from '../js/regras.js';

// Dados fictícios: nada de nome, e-mail ou dado real nos testes.
const emAndamento = { id: 'col-andamento', limiteWip: 2 };
const backlog = { id: 'col-backlog', limiteWip: null };

describe('COLUNAS_PADRAO', () => {
  it('tem as 5 colunas do fluxo na ordem certa, com WIP 2 em andamento e revisão', () => {
    expect(COLUNAS_PADRAO.map((c) => c.nome)).toEqual(
      ['Backlog', 'Sprint Backlog', 'Em andamento', 'Em revisão', 'Concluído']
    );
    expect(COLUNAS_PADRAO.filter((c) => c.limiteWip === 2).map((c) => c.nome))
      .toEqual(['Em andamento', 'Em revisão']);
  });

  it('marca o papel das colunas usadas nas métricas: início = Em andamento, fim = Concluído', () => {
    expect(COLUNAS_PADRAO.filter((c) => c.papel).map((c) => `${c.papel}:${c.nome}`))
      .toEqual(['inicio:Em andamento', 'fim:Concluído']);
  });

  // Regra 2 do CLAUDE.md: o que está em regras.js precisa bater com o schema.sql.
  it('é igual às colunas que o preparar_board do schema.sql cria (nome, posição, WIP e papel)', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    // Cada linha do insert é assim: (new.id, 'Em andamento',   3, 2,    'inicio'),
    const linhas = [...sql.matchAll(/\(new\.id,\s*'([^']+)',\s*(\d+),\s*(null|\d+),\s*(null|'\w+')\)/g)];
    const doBanco = linhas.map(([, nome, posicao, wip, papel]) => ({
      nome,
      posicao: Number(posicao),
      limiteWip: wip === 'null' ? null : Number(wip),
      papel: papel === 'null' ? null : papel.replaceAll("'", ''),
    }));
    const doApp = COLUNAS_PADRAO.map((c, i) => ({
      nome: c.nome, posicao: i + 1, limiteWip: c.limiteWip, papel: c.papel ?? null,
    }));
    expect(doBanco).toEqual(doApp);
  });
});

describe('situacaoWip', () => {
  it('mostra "1/2" e ainda cabe', () => {
    expect(situacaoWip(emAndamento, 1)).toEqual({ texto: '1/2', cheia: false, acima: false });
  });

  it('fica cheia ao atingir o limite e acima ao passar dele', () => {
    expect(situacaoWip(emAndamento, 2)).toMatchObject({ texto: '2/2', cheia: true, acima: false });
    expect(situacaoWip(emAndamento, 3)).toMatchObject({ texto: '3/2', cheia: true, acima: true });
  });

  it('coluna sem limite nunca fica cheia', () => {
    expect(situacaoWip(backlog, 50)).toEqual({ texto: '50', cheia: false, acima: false });
  });
});

describe('validarMovimento', () => {
  it('aceita mover para coluna com espaço', () => {
    expect(validarMovimento({ deColunaId: 'col-backlog', paraColuna: emAndamento, quantidadeNoDestino: 1 }))
      .toEqual([]);
  });

  it('bloqueia passar do WIP sem justificativa', () => {
    const erros = validarMovimento({ deColunaId: 'col-backlog', paraColuna: emAndamento, quantidadeNoDestino: 2 });
    expect(erros[0]).toContain('limite de WIP (2/2)');
    const comEspacos = validarMovimento({
      deColunaId: 'col-backlog', paraColuna: emAndamento, quantidadeNoDestino: 2, justificativa: '   ',
    });
    expect(comEspacos).toHaveLength(1);
  });

  it('permite passar do WIP com justificativa', () => {
    expect(validarMovimento({
      deColunaId: 'col-backlog', paraColuna: emAndamento, quantidadeNoDestino: 2,
      justificativa: 'Correção urgente pedida pelo PO',
    })).toEqual([]);
  });

  it('recusa mover para a mesma coluna ou para coluna inexistente', () => {
    expect(validarMovimento({ deColunaId: 'col-andamento', paraColuna: emAndamento, quantidadeNoDestino: 1 }))
      .toEqual(['O cartão já está nesta coluna.']);
    expect(validarMovimento({ deColunaId: 'col-backlog', paraColuna: undefined, quantidadeNoDestino: 0 }))
      .toEqual(['A coluna de destino não existe neste board.']);
  });
});

// ---------- História 4: limite de WIP com justificativa ----------

describe('lerLimiteWip', () => {
  it('vazio (ou só espaços) = coluna sem limite', () => {
    expect(lerLimiteWip('')).toEqual({ limite: null, erros: [] });
    expect(lerLimiteWip('   ')).toEqual({ limite: null, erros: [] });
  });

  it('aceita inteiro maior que zero, mesmo com espaços nas pontas', () => {
    expect(lerLimiteWip('3')).toEqual({ limite: 3, erros: [] });
    expect(lerLimiteWip(' 1 ')).toEqual({ limite: 1, erros: [] });
  });

  it('recusa zero, negativo, decimal e texto', () => {
    for (const errado of ['0', '-1', '2.5', '2,5', 'dois', '3a']) {
      const { limite, erros } = lerLimiteWip(errado);
      expect(limite).toBeNull();
      expect(erros).toEqual(['O limite de WIP precisa ser um número inteiro maior que zero (ou vazio para não ter limite).']);
    }
  });

  // Regra 2 do CLAUDE.md: a mesma regra do check da tabela colunas no schema.sql.
  it('bate com o check do banco: limite_wip is null or limite_wip > 0', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/limite_wip integer check \(limite_wip is null or limite_wip > 0\)/);
  });
});

describe('lerPolitica', () => {
  it('tira os espaços das pontas; vazio vira null (coluna sem política)', () => {
    expect(lerPolitica('  Só entra com critério de aceite claro  ')).toBe('Só entra com critério de aceite claro');
    expect(lerPolitica('   ')).toBeNull();
    expect(lerPolitica('')).toBeNull();
  });
});

describe('formatarDataHora (exemplos da H4)', () => {
  // Guardado em UTC; São Paulo é UTC-3 (sem horário de verão desde 2019). Conta feita à mão:
  it('converte de UTC para o horário de São Paulo', () => {
    expect(formatarDataHora('2026-11-15T17:30:00Z')).toBe('15/11/2026 14:30');
  });

  it('volta um dia quando em UTC já passou da meia-noite', () => {
    expect(formatarDataHora('2026-11-16T02:05:00Z')).toBe('15/11/2026 23:05');
  });
});

describe('passagensDeWip', () => {
  // Dados fictícios no formato que a tela busca: movimentos com o título do cartão junto.
  const colunas = [
    { id: 'col-backlog', nome: 'Backlog' },
    { id: 'col-andamento', nome: 'Em andamento' },
    { id: 'col-velha', nome: 'Coluna arquivada' },
  ];
  const perfis = [{ id: 'u-ana', nome: 'Ana Teste' }, { id: 'u-bia', nome: 'Bia Teste' }];
  const movimentos = [
    { id: 1, de_coluna_id: null, para_coluna_id: 'col-backlog', movido_por: 'u-ana',
      movido_em: '2026-11-10T12:00:00Z', justificativa: null, cartoes: { titulo: 'Cartão A' } },
    { id: 2, de_coluna_id: 'col-backlog', para_coluna_id: 'col-andamento', movido_por: 'u-bia',
      movido_em: '2026-11-11T13:00:00Z', justificativa: 'Correção urgente', cartoes: { titulo: 'Cartão A' } },
    { id: 3, de_coluna_id: 'col-velha', para_coluna_id: 'col-andamento', movido_por: 'u-ana',
      movido_em: '2026-11-12T14:00:00Z', justificativa: 'Pedido do PO', cartoes: { titulo: 'Cartão B' } },
  ];

  it('lista só os movimentos com justificativa, do mais recente para o mais antigo, com os nomes', () => {
    expect(passagensDeWip(movimentos, colunas, perfis)).toEqual([
      { id: 3, quando: '12/11/2026 11:00', cartao: 'Cartão B', de: 'Coluna arquivada', para: 'Em andamento',
        quem: 'Ana Teste', justificativa: 'Pedido do PO' },
      { id: 2, quando: '11/11/2026 10:00', cartao: 'Cartão A', de: 'Backlog', para: 'Em andamento',
        quem: 'Bia Teste', justificativa: 'Correção urgente' },
    ]);
  });

  it('não muda a lista original e devolve vazio quando ninguém passou do limite', () => {
    const copia = structuredClone(movimentos);
    passagensDeWip(movimentos, colunas, perfis);
    expect(movimentos).toEqual(copia);
    expect(passagensDeWip([movimentos[0]], colunas, perfis)).toEqual([]);
  });

  it('usa um texto padrão quando falta o nome da coluna ou da pessoa', () => {
    const [passagem] = passagensDeWip([{ ...movimentos[1], movido_por: 'u-sumiu', para_coluna_id: 'col-x' }], colunas, perfis);
    expect(passagem).toMatchObject({ para: 'Coluna desconhecida', quem: 'Membro sem nome' });
  });
});

// ---------- História 1: conta ----------

describe('validarCredenciais (login)', () => {
  it('aceita e-mail e senha válidos', () => {
    expect(validarCredenciais({ email: 'ana@teste.com', senha: 'segredo1' })).toEqual([]);
  });

  it('recusa e-mail vazio ou sem formato de e-mail', () => {
    expect(validarCredenciais({ email: '', senha: 'segredo1' })).toEqual(['Informe um e-mail válido.']);
    expect(validarCredenciais({ email: 'ana.teste.com', senha: 'segredo1' })).toEqual(['Informe um e-mail válido.']);
  });

  it('recusa senha com menos de 6 caracteres', () => {
    expect(validarCredenciais({ email: 'ana@teste.com', senha: '12345' }))
      .toEqual(['A senha precisa ter pelo menos 6 caracteres.']);
  });

  it('aceita senha com exatamente 6 caracteres (o limite)', () => {
    expect(validarCredenciais({ email: 'ana@teste.com', senha: '123456' })).toEqual([]);
  });

  it('aceita e-mail com espaços nas pontas (são ignorados)', () => {
    expect(validarCredenciais({ email: '  ana@teste.com  ', senha: 'segredo1' })).toEqual([]);
  });
});

describe('validarCadastro', () => {
  it('exige também o nome', () => {
    expect(validarCadastro({ nome: '  ', email: 'ana@teste.com', senha: 'segredo1' }))
      .toEqual(['Informe o seu nome.']);
  });

  it('junta todos os erros de uma vez', () => {
    expect(validarCadastro({ nome: '', email: 'x', senha: '1' })).toHaveLength(3);
  });
});

describe('traduzirErroAuth', () => {
  it('senha errada vira mensagem em português', () => {
    expect(traduzirErroAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('E-mail ou senha incorretos.');
  });

  it('reconhece pela mensagem quando não vem o código', () => {
    expect(traduzirErroAuth({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.');
    expect(traduzirErroAuth({ message: 'User already registered' })).toBe('Já existe uma conta com este e-mail.');
  });

  it('traduz os erros do cadastro e de limite de tentativas', () => {
    expect(traduzirErroAuth({ code: 'weak_password' }))
      .toBe('A senha é fraca demais. Escolha uma senha mais forte.');
    expect(traduzirErroAuth({ code: 'email_not_confirmed' }))
      .toBe('Confirme o seu e-mail pelo link enviado antes de entrar.');
    expect(traduzirErroAuth({ code: 'over_email_send_rate_limit' }))
      .toBe('Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
    expect(traduzirErroAuth({ code: 'over_request_rate_limit' }))
      .toBe('Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
  });

  it('erro desconhecido (ou sem erro) mostra uma mensagem genérica, que serve para login e cadastro', () => {
    const generica = 'Não foi possível concluir agora. Tente de novo em instantes.';
    expect(traduzirErroAuth({ message: 'Something odd' })).toBe(generica);
    expect(traduzirErroAuth(null)).toBe(generica);
  });
});

// ---------- História 1: board e colunas ----------

describe('validarNome (board e coluna)', () => {
  it('aceita um nome com texto', () => {
    expect(validarNome('Time Fictício', 'do board')).toEqual([]);
  });

  it('recusa vazio ou só espaços, como o check do banco (length(trim(nome)) > 0)', () => {
    expect(validarNome('', 'do board')).toEqual(['Informe o nome do board.']);
    expect(validarNome('   ', 'da coluna')).toEqual(['Informe o nome da coluna.']);
    expect(validarNome(undefined, 'do board')).toEqual(['Informe o nome do board.']);
  });
});

describe('moverColunaNaOrdem', () => {
  // Fora de ordem de propósito: a função ordena pela posição antes de mexer.
  const colunas = [
    { id: 'c', nome: 'C', posicao: 3 },
    { id: 'a', nome: 'A', posicao: 1 },
    { id: 'b', nome: 'B', posicao: 2 },
  ];
  const ordem = (lista) => lista.map((c) => `${c.id}${c.posicao}`).join(' ');

  it('sobe a coluna uma posição e renumera 1..n', () => {
    expect(ordem(moverColunaNaOrdem(colunas, 'b', -1))).toBe('b1 a2 c3');
  });

  it('desce a coluna uma posição', () => {
    expect(ordem(moverColunaNaOrdem(colunas, 'a', +1))).toBe('b1 a2 c3');
  });

  it('não sai da ponta: a primeira não sobe e a última não desce', () => {
    expect(ordem(moverColunaNaOrdem(colunas, 'a', -1))).toBe('a1 b2 c3');
    expect(ordem(moverColunaNaOrdem(colunas, 'c', +1))).toBe('a1 b2 c3');
  });

  it('não altera a lista original', () => {
    moverColunaNaOrdem(colunas, 'b', -1);
    expect(colunas.find((c) => c.id === 'b').posicao).toBe(2);
  });

  it('id que não existe: só renumera 1..n', () => {
    const comBuraco = [{ id: 'a', posicao: 1 }, { id: 'b', posicao: 4 }];
    expect(ordem(moverColunaNaOrdem(comBuraco, 'x', +1))).toBe('a1 b2');
  });

  it('lista com uma coluna só não muda', () => {
    expect(ordem(moverColunaNaOrdem([{ id: 'a', posicao: 1 }], 'a', +1))).toBe('a1');
  });
});

describe('proximaPosicao', () => {
  it('board sem colunas: a primeira é a posição 1', () => {
    expect(proximaPosicao([])).toBe(1);
  });

  it('coluna nova entra depois da maior posição (mesmo com buracos de colunas arquivadas)', () => {
    expect(proximaPosicao([{ posicao: 1 }, { posicao: 2 }, { posicao: 5 }])).toBe(6);
  });
});

describe('colunasQueMudaram', () => {
  it('devolve só as colunas cuja posição mudou (as que precisam ser gravadas)', () => {
    const antes = [{ id: 'a', posicao: 1 }, { id: 'b', posicao: 2 }, { id: 'c', posicao: 3 }];
    const depois = [{ id: 'b', posicao: 1 }, { id: 'a', posicao: 2 }, { id: 'c', posicao: 3 }];
    expect(colunasQueMudaram(antes, depois)).toEqual([{ id: 'b', posicao: 1 }, { id: 'a', posicao: 2 }]);
  });

  it('sem mudança, não devolve nada', () => {
    const lista = [{ id: 'a', posicao: 1 }];
    expect(colunasQueMudaram(lista, lista)).toEqual([]);
  });
});

describe('podeArquivarColuna', () => {
  it('coluna vazia e sem papel pode ser excluída (arquivada)', () => {
    expect(podeArquivarColuna({ quantidadeCartoes: 0, papel: null })).toEqual([]);
  });

  it('coluna com cartões não pode, com a mesma mensagem do banco (arquivar_coluna)', () => {
    expect(podeArquivarColuna({ quantidadeCartoes: 2, papel: null }))
      .toEqual(['A coluna tem 2 cartão(ões). Mova os cartões antes de excluir.']);
  });

  it('coluna usada nas métricas (com papel) não pode, mesmo vazia; renomear continua livre', () => {
    const mensagem = 'Esta coluna marca o início ou o fim do fluxo nas métricas e não pode ser excluída. Você pode renomeá-la.';
    expect(podeArquivarColuna({ quantidadeCartoes: 0, papel: 'inicio' })).toEqual([mensagem]);
    expect(podeArquivarColuna({ quantidadeCartoes: 0, papel: 'fim' })).toEqual([mensagem]);
  });

  it('papel vem antes dos cartões, na mesma ordem do banco (uma mensagem só)', () => {
    expect(podeArquivarColuna({ quantidadeCartoes: 3, papel: 'fim' })).toHaveLength(1);
    expect(podeArquivarColuna({ quantidadeCartoes: 3, papel: 'fim' })[0]).toContain('métricas');
  });

  // Regra 2: as mensagens estão escritas nos dois lados (JS e arquivar_coluna no schema.sql).
  it('usa as mesmas mensagens que a função arquivar_coluna do schema.sql', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    expect(sql).toContain(podeArquivarColuna({ quantidadeCartoes: 0, papel: 'fim' })[0]);
    // No banco, o número vem por %: 'A coluna tem % cartão(ões). Mova os cartões antes de excluir.'
    const comCartoes = podeArquivarColuna({ quantidadeCartoes: 7, papel: null })[0];
    expect(sql).toContain(comCartoes.replace('7', '%'));
  });
});

// ---------- História 2: convite por código ----------

describe('normalizarCodigo', () => {
  // Mesmo tratamento do entrar_no_board no banco: upper(trim(p_codigo)).
  it('tira os espaços das pontas e põe em maiúsculas', () => {
    expect(normalizarCodigo('  ab12cd ')).toBe('AB12CD');
  });

  it('trata campo vazio ou ausente como texto vazio', () => {
    expect(normalizarCodigo('   ')).toBe('');
    expect(normalizarCodigo(undefined)).toBe('');
  });
});

describe('validarCodigoConvite', () => {
  it('aceita 6 letras ou números, mesmo digitados com espaço e minúsculas', () => {
    expect(validarCodigoConvite('AB12CD')).toEqual([]);
    expect(validarCodigoConvite(' ab12cd ')).toEqual([]);
  });

  it('pede o código quando o campo está vazio', () => {
    expect(validarCodigoConvite('  ')).toEqual(['Digite o código de convite.']);
  });

  it('recusa código com tamanho errado ou com símbolo, sem precisar ir ao banco', () => {
    expect(validarCodigoConvite('AB12C')).toEqual(['Código de convite inválido.']);
    expect(validarCodigoConvite('AB12CDE')).toEqual(['Código de convite inválido.']);
    expect(validarCodigoConvite('AB-12C')).toEqual(['Código de convite inválido.']);
  });

  // Regra 2: o banco (entrar_no_board) dá a mesma mensagem para código que não existe.
  it('usa a mesma mensagem de código inválido que o entrar_no_board do schema.sql', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`'${validarCodigoConvite('X')[0]}'`);
  });
});

describe('nomesDosMembros', () => {
  // Pessoas fictícias. As datas estão em UTC, como o banco guarda (entrou_em é timestamptz).
  const perfis = [
    { id: 'u-bia', nome: 'Bia Teste' },
    { id: 'u-ana', nome: 'Ana Teste' },
    { id: 'u-caio', nome: 'Caio Teste' },
  ];

  it('devolve os nomes na ordem em que cada um entrou no board', () => {
    const membros = [
      { usuario_id: 'u-bia', entrou_em: '2026-11-14T15:00:00+00:00' },
      { usuario_id: 'u-ana', entrou_em: '2026-11-10T09:30:00+00:00' },
      { usuario_id: 'u-caio', entrou_em: '2026-11-14T15:05:00+00:00' },
    ];
    expect(nomesDosMembros(membros, perfis)).toEqual(['Ana Teste', 'Bia Teste', 'Caio Teste']);
  });

  it('mostra "Membro sem nome" quando não acha o perfil, em vez de sumir com a pessoa', () => {
    const membros = [{ usuario_id: 'u-sem-perfil', entrou_em: '2026-11-14T15:00:00+00:00' }];
    expect(nomesDosMembros(membros, perfis)).toEqual(['Membro sem nome']);
  });
});

// ---------- História 3: cartões com histórico de movimentos ----------

describe('validarCartao', () => {
  // Mesmas regras dos checks da tabela cartoes: título com texto; pontos vazio ou inteiro >= 0.
  it('aceita só o título (responsável e pontos são opcionais)', () => {
    expect(validarCartao({ titulo: 'Tela de login', pontos: '' })).toEqual([]);
  });

  it('aceita pontos inteiros a partir de zero, digitados com espaço', () => {
    expect(validarCartao({ titulo: 'Tela de login', pontos: ' 3 ' })).toEqual([]);
    expect(validarCartao({ titulo: 'Tela de login', pontos: '0' })).toEqual([]);
  });

  it('pede o título quando ele está vazio ou só com espaços', () => {
    expect(validarCartao({ titulo: '   ', pontos: '' })).toEqual(['O título do cartão é obrigatório.']);
  });

  it('recusa pontos negativos, com vírgula ou com letras', () => {
    const erro = ['Os pontos precisam ser um número inteiro, de 0 para cima.'];
    expect(validarCartao({ titulo: 'Tela de login', pontos: '-1' })).toEqual(erro);
    expect(validarCartao({ titulo: 'Tela de login', pontos: '2,5' })).toEqual(erro);
    expect(validarCartao({ titulo: 'Tela de login', pontos: 'três' })).toEqual(erro);
  });

  it('junta os dois erros quando título e pontos estão errados', () => {
    expect(validarCartao({ titulo: '', pontos: 'x' })).toHaveLength(2);
  });
});

describe('colunaVizinha', () => {
  // Fora de ordem de propósito, e com uma coluna arquivada no meio (posição 3).
  const colunas = [
    { id: 'c-feito', posicao: 5, arquivada: false },
    { id: 'c-a', posicao: 1, arquivada: false },
    { id: 'c-velha', posicao: 3, arquivada: true },
    { id: 'c-b', posicao: 2, arquivada: false },
    { id: 'c-c', posicao: 4, arquivada: false },
  ];

  it('acha a coluna da direita (+1) e da esquerda (-1) pela posição', () => {
    expect(colunaVizinha(colunas, 'c-a', 1)).toBe('c-b');
    expect(colunaVizinha(colunas, 'c-feito', -1)).toBe('c-c');
  });

  it('pula a coluna arquivada', () => {
    expect(colunaVizinha(colunas, 'c-b', 1)).toBe('c-c');
    expect(colunaVizinha(colunas, 'c-c', -1)).toBe('c-b');
  });

  it('devolve null nas pontas do board', () => {
    expect(colunaVizinha(colunas, 'c-a', -1)).toBeNull();
    expect(colunaVizinha(colunas, 'c-feito', 1)).toBeNull();
  });
});

describe('formatarDataHora', () => {
  // Conta feita à mão: São Paulo está em UTC-3 (sem horário de verão desde 2019).
  it('converte de UTC para o horário de São Paulo (3 horas a menos)', () => {
    expect(formatarDataHora('2026-11-16T15:03:00Z')).toBe('16/11/2026 12:03');
  });

  it('volta para o dia anterior quando, em UTC, já passou da meia-noite', () => {
    // 01:30 de 17/11 em UTC = 22:30 de 16/11 em São Paulo
    expect(formatarDataHora('2026-11-17T01:30:00+00:00')).toBe('16/11/2026 22:30');
  });

  it('entende o formato que o Supabase devolve (com fração de segundo)', () => {
    expect(formatarDataHora('2026-11-16T09:05:41.123456+00:00')).toBe('16/11/2026 06:05');
  });
});

// Um cartão fictício que foi criado no Backlog, foi para Em andamento e voltou (desfazer).
// Os movimentos vêm fora de ordem de propósito; as datas estão em UTC, como no banco.
const colunasDoBoard = [
  { id: 'c-backlog', nome: 'Backlog' },
  { id: 'c-andamento', nome: 'Em andamento' },
  { id: 'c-velha', nome: 'Coluna arquivada', arquivada: true },
];
const pessoas = [{ id: 'u-ana', nome: 'Ana Teste' }, { id: 'u-bia', nome: 'Bia Teste' }];
const movimentosDoCartao = [
  { id: 12, de_coluna_id: 'c-andamento', para_coluna_id: 'c-backlog', movido_por: 'u-bia',
    movido_em: '2026-11-16T18:00:00+00:00', justificativa: null },
  { id: 10, de_coluna_id: null, para_coluna_id: 'c-backlog', movido_por: 'u-ana',
    movido_em: '2026-11-16T12:00:00+00:00', justificativa: null },
  { id: 11, de_coluna_id: 'c-backlog', para_coluna_id: 'c-andamento', movido_por: 'u-ana',
    movido_em: '2026-11-16T15:30:00+00:00', justificativa: null },
];

describe('montarHistorico', () => {
  it('lista do mais antigo para o mais novo, com hora de São Paulo, quem moveu e de onde para onde', () => {
    expect(montarHistorico(movimentosDoCartao, colunasDoBoard, pessoas)).toEqual([
      { quando: '16/11/2026 09:00', quem: 'Ana Teste', texto: 'Criado em Backlog' },
      { quando: '16/11/2026 12:30', quem: 'Ana Teste', texto: 'Backlog → Em andamento' },
      { quando: '16/11/2026 15:00', quem: 'Bia Teste', texto: 'Em andamento → Backlog' },
    ]);
  });

  it('desempata pelo número do movimento quando a hora é a mesma', () => {
    const mesmaHora = movimentosDoCartao.map((m) => ({ ...m, movido_em: '2026-11-16T12:00:00Z' }));
    expect(montarHistorico(mesmaHora, colunasDoBoard, pessoas).map((h) => h.texto))
      .toEqual(['Criado em Backlog', 'Backlog → Em andamento', 'Em andamento → Backlog']);
  });

  it('mostra coluna arquivada pelo nome e não esconde quem não tem perfil', () => {
    const mov = [{ id: 1, de_coluna_id: 'c-velha', para_coluna_id: 'c-backlog', movido_por: 'u-x',
      movido_em: '2026-11-16T12:00:00Z', justificativa: null }];
    expect(montarHistorico(mov, colunasDoBoard, pessoas)).toEqual([
      { quando: '16/11/2026 09:00', quem: 'Membro sem nome', texto: 'Coluna arquivada → Backlog' },
    ]);
  });

  it('não muda a lista que recebeu', () => {
    const copia = structuredClone(movimentosDoCartao);
    montarHistorico(movimentosDoCartao, colunasDoBoard, pessoas);
    expect(movimentosDoCartao).toEqual(copia);
  });
});

describe('movimentoParaDesfazer', () => {
  // Desfazer não apaga nada: é um movimento NOVO de volta para a coluna de onde o cartão veio.
  it('devolve a coluna de origem do último movimento', () => {
    const ateIda = movimentosDoCartao.filter((m) => m.id <= 11);
    expect(movimentoParaDesfazer(ateIda)).toBe('c-backlog');
    expect(movimentoParaDesfazer(movimentosDoCartao)).toBe('c-andamento'); // desfazer o desfazer
  });

  it('não tem o que desfazer quando o cartão acabou de ser criado', () => {
    expect(movimentoParaDesfazer(movimentosDoCartao.filter((m) => m.id === 10))).toBeNull();
    expect(movimentoParaDesfazer([])).toBeNull();
  });
});

// Regra 2: validarCartao espelha os checks da tabela cartoes. Se um lado mudar, este teste avisa.
describe('validarCartao × schema.sql', () => {
  it('o banco tem os mesmos checks de título e pontos', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    expect(sql).toContain('titulo         text not null check (length(trim(titulo)) > 0)');
    expect(sql).toContain('pontos         integer check (pontos is null or pontos >= 0)');
  });
});

// ---------- História 5: Lead Time, Cycle Time e Throughput ----------

describe('diaEmSaoPaulo', () => {
  // O dia do calendário de São Paulo (UTC-3), para saber em que dia e semana um cartão foi concluído.
  it('devolve o dia de São Paulo, que pode ser o anterior ao dia em UTC', () => {
    expect(diaEmSaoPaulo('2026-11-19T15:00:00Z')).toBe('2026-11-19');
    expect(diaEmSaoPaulo('2026-11-19T02:30:00Z')).toBe('2026-11-18'); // 23:30 do dia 18 em SP
  });
});

describe('segundaDaSemana', () => {
  // Semana de segunda a domingo. 16/11/2026 é uma segunda-feira.
  it('devolve a segunda-feira da semana do dia', () => {
    expect(segundaDaSemana('2026-11-16')).toBe('2026-11-16'); // segunda
    expect(segundaDaSemana('2026-11-19')).toBe('2026-11-16'); // quinta
    expect(segundaDaSemana('2026-11-22')).toBe('2026-11-16'); // domingo ainda é a mesma semana
    expect(segundaDaSemana('2026-11-23')).toBe('2026-11-23'); // segunda seguinte
  });
});

describe('diasEntre', () => {
  // Dias com fração, contados da hora exata: 12 horas = 0,5 dia.
  it('conta dias e frações de dia entre dois instantes', () => {
    expect(diasEntre('2026-11-16T12:00:00Z', '2026-11-19T00:00:00Z')).toBe(2.5);
    expect(diasEntre('2026-11-18T00:00:00Z', '2026-11-18T12:00:00Z')).toBe(0.5);
  });
});

// Colunas com nomes diferentes dos padrões de propósito: as métricas acham as colunas pelo PAPEL.
const colunasDoFluxo = [
  { id: 'c-entrada', nome: 'Ideias', papel: null },
  { id: 'c-fazendo', nome: 'Fazendo', papel: 'inicio' },
  { id: 'c-conferir', nome: 'Conferir', papel: null },
  { id: 'c-pronto', nome: 'Pronto!', papel: 'fim' },
];
// m(cartão, de, para, quando): um movimento fictício (de = null é a criação do cartão).
let idMov = 0;
const m = (cartao_id, de_coluna_id, para_coluna_id, movido_em) =>
  ({ id: ++idMov, cartao_id, de_coluna_id, para_coluna_id, movido_em });

describe('datasDoFluxo', () => {
  it('acha a criação, a 1ª entrada na coluna de início e a entrada na coluna de fim', () => {
    const movs = [
      m('A', 'c-conferir', 'c-pronto', '2026-11-19T00:00:00Z'),
      m('A', null, 'c-entrada', '2026-11-16T12:00:00Z'),
      m('A', 'c-entrada', 'c-fazendo', '2026-11-17T12:00:00Z'),
      m('A', 'c-fazendo', 'c-conferir', '2026-11-18T00:00:00Z'),
    ];
    expect(datasDoFluxo(movs, colunasDoFluxo)).toEqual({
      criadoEm: '2026-11-16T12:00:00Z',
      inicioEm: '2026-11-17T12:00:00Z',
      fimEm: '2026-11-19T00:00:00Z',
    });
  });

  it('cartão que voltou e foi concluído de novo: 1ª entrada no início e ÚLTIMA entrada no fim', () => {
    const movs = [
      m('B', null, 'c-entrada', '2026-11-10T09:00:00Z'),
      m('B', 'c-entrada', 'c-fazendo', '2026-11-11T09:00:00Z'),
      m('B', 'c-fazendo', 'c-pronto', '2026-11-12T09:00:00Z'),
      m('B', 'c-pronto', 'c-fazendo', '2026-11-12T15:00:00Z'),
      m('B', 'c-fazendo', 'c-pronto', '2026-11-13T09:00:00Z'),
    ];
    expect(datasDoFluxo(movs, colunasDoFluxo)).toMatchObject({
      inicioEm: '2026-11-11T09:00:00Z', fimEm: '2026-11-13T09:00:00Z',
    });
  });

  it('cartão que saiu da coluna de fim não está concluído (fimEm = null)', () => {
    const movs = [
      m('C', null, 'c-entrada', '2026-11-10T09:00:00Z'),
      m('C', 'c-entrada', 'c-pronto', '2026-11-11T09:00:00Z'),
      m('C', 'c-pronto', 'c-conferir', '2026-11-12T09:00:00Z'),
    ];
    expect(datasDoFluxo(movs, colunasDoFluxo).fimEm).toBeNull();
  });

  it('cartão que nunca passou pela coluna de início: inicioEm = null', () => {
    const movs = [
      m('D', null, 'c-entrada', '2026-11-18T00:00:00Z'),
      m('D', 'c-entrada', 'c-pronto', '2026-11-18T12:00:00Z'),
    ];
    expect(datasDoFluxo(movs, colunasDoFluxo)).toEqual({
      criadoEm: '2026-11-18T00:00:00Z', inicioEm: null, fimEm: '2026-11-18T12:00:00Z',
    });
  });
});

describe('metricasDoFluxo', () => {
  // Board fictício. Período: 09/11 a 22/11/2026 (2 semanas: seg 09/11 e seg 16/11).
  // Conta à mão (dias com fração; SP = UTC-3):
  //   A: criado 16/11 12h → início 17/11 12h → fim 19/11 00h UTC (18/11 21h em SP)
  //      Lead = 2,5 dias · Cycle = 1,5 dia · semana de 16/11
  //   B: criado 10/11 09h → 1º início 11/11 09h → fim (última entrada) 13/11 09h
  //      Lead = 3,0 dias · Cycle = 2,0 dias · semana de 09/11
  //   C: criado 18/11 00h → direto para o fim 18/11 12h (nunca passou pelo início)
  //      Lead = 0,5 dia · Cycle = — (fora da média) · semana de 16/11
  //   D: em andamento, não concluído → fora
  //   E: concluído em 02/11 → fora do período
  // Médias: Lead = (2,5 + 3,0 + 0,5) / 3 = 2,0 · Cycle = (1,5 + 2,0) / 2 = 1,75
  // Throughput: semana 09/11 = 1, semana 16/11 = 2 → média 3 / 2 = 1,5 por semana
  const cartoes = [
    { id: 'A', titulo: 'Cartão A' }, { id: 'B', titulo: 'Cartão B' }, { id: 'C', titulo: 'Cartão C' },
    { id: 'D', titulo: 'Cartão D' }, { id: 'E', titulo: 'Cartão E' },
  ];
  const movimentos = [
    m('A', null, 'c-entrada', '2026-11-16T12:00:00Z'),
    m('A', 'c-entrada', 'c-fazendo', '2026-11-17T12:00:00Z'),
    m('A', 'c-fazendo', 'c-pronto', '2026-11-19T00:00:00Z'),
    m('B', null, 'c-entrada', '2026-11-10T09:00:00Z'),
    m('B', 'c-entrada', 'c-fazendo', '2026-11-11T09:00:00Z'),
    m('B', 'c-fazendo', 'c-pronto', '2026-11-12T09:00:00Z'),
    m('B', 'c-pronto', 'c-fazendo', '2026-11-12T15:00:00Z'),
    m('B', 'c-fazendo', 'c-pronto', '2026-11-13T09:00:00Z'),
    m('C', null, 'c-entrada', '2026-11-18T00:00:00Z'),
    m('C', 'c-entrada', 'c-pronto', '2026-11-18T12:00:00Z'),
    m('D', null, 'c-entrada', '2026-11-12T00:00:00Z'),
    m('D', 'c-entrada', 'c-fazendo', '2026-11-13T00:00:00Z'),
    m('E', null, 'c-entrada', '2026-10-30T00:00:00Z'),
    m('E', 'c-entrada', 'c-pronto', '2026-11-02T00:00:00Z'),
  ];
  const periodo = { de: '2026-11-09', ate: '2026-11-22' };
  const r = metricasDoFluxo({ cartoes, movimentos, colunas: colunasDoFluxo, ...periodo });

  it('mostra o valor de cada cartão concluído no período, do mais recente para o mais antigo', () => {
    expect(r.cartoes.map((c) => [c.titulo, c.leadTime, c.cycleTime])).toEqual([
      ['Cartão A', 2.5, 1.5],
      ['Cartão C', 0.5, null],
      ['Cartão B', 3, 2],
    ]);
  });

  it('calcula as médias do período (o Cycle Time sem o cartão que não passou pelo início)', () => {
    expect(r.leadTimeMedio).toBe(2);
    expect(r.cycleTimeMedio).toBe(1.75);
  });

  it('conta o throughput por semana, de segunda a domingo, e a média por semana', () => {
    expect(r.throughput).toEqual([
      { semana: '2026-11-09', concluidos: 1 },
      { semana: '2026-11-16', concluidos: 2 },
    ]);
    expect(r.throughputMedio).toBe(1.5);
  });

  it('usa o dia de São Paulo nas pontas do período', () => {
    // 23/11 02:30 UTC = 22/11 23:30 em SP: ainda está dentro do período que termina em 22/11.
    const movs = [m('F', null, 'c-entrada', '2026-11-20T00:00:00Z'), m('F', 'c-entrada', 'c-pronto', '2026-11-23T02:30:00Z')];
    const so = metricasDoFluxo({ cartoes: [{ id: 'F', titulo: 'F' }], movimentos: movs, colunas: colunasDoFluxo, ...periodo });
    expect(so.cartoes).toHaveLength(1);
    expect(so.throughput.at(-1)).toEqual({ semana: '2026-11-16', concluidos: 1 });
  });

  it('período sem nenhum cartão concluído: médias nulas e semanas com zero', () => {
    const vazio = metricasDoFluxo({ cartoes, movimentos, colunas: colunasDoFluxo, de: '2026-11-23', ate: '2026-11-29' });
    expect(vazio).toMatchObject({ cartoes: [], leadTimeMedio: null, cycleTimeMedio: null, throughputMedio: 0 });
    expect(vazio.throughput).toEqual([{ semana: '2026-11-23', concluidos: 0 }]);
  });

  it('dá o mesmo resultado se o time renomear as colunas (as métricas usam o papel)', () => {
    const renomeadas = colunasDoFluxo.map((c) => ({ ...c, nome: `Outro nome ${c.id}` }));
    expect(metricasDoFluxo({ cartoes, movimentos, colunas: renomeadas, ...periodo })).toEqual(r);
  });

  it('recusa período com "de" depois de "ate" (antes dava throughput médio NaN, 0 ÷ 0 semanas)', () => {
    expect(() => metricasDoFluxo({ cartoes, movimentos, colunas: colunasDoFluxo, de: '2026-11-30', ate: '2026-11-09' }))
      .toThrow('Escolha um período válido: a data inicial não pode ser depois da final.');
    // Mesma semana, mas invertido: também é recusado (antes mostrava uma semana com zero).
    expect(() => metricasDoFluxo({ cartoes, movimentos, colunas: colunasDoFluxo, de: '2026-11-19', ate: '2026-11-17' }))
      .toThrow('período válido');
  });
});

describe('validarPeriodo', () => {
  const mensagem = 'Escolha um período válido: a data inicial não pode ser depois da final.';
  it('aceita "de" antes de "ate" ou no mesmo dia', () => {
    expect(validarPeriodo('2026-11-09', '2026-11-22')).toBeNull();
    expect(validarPeriodo('2026-11-19', '2026-11-19')).toBeNull();
  });
  it('recusa data vazia e "de" depois de "ate"', () => {
    expect(validarPeriodo('', '2026-11-22')).toBe(mensagem);
    expect(validarPeriodo('2026-11-09', '')).toBe(mensagem);
    expect(validarPeriodo('2026-11-23', '2026-11-22')).toBe(mensagem);
  });
});

describe('formatarDias', () => {
  it('mostra os dias com uma casa decimal e vírgula; sem valor vira "—"', () => {
    expect(formatarDias(2.5)).toBe('2,5');
    expect(formatarDias(2)).toBe('2,0');
    expect(formatarDias(1.75)).toBe('1,8'); // arredonda a 2ª casa
    expect(formatarDias(null)).toBe('—');
  });
});

describe('periodoPadrao', () => {
  // Últimas 4 semanas: da segunda-feira de 3 semanas atrás até hoje (dia de São Paulo).
  it('vai da segunda de 3 semanas atrás até hoje', () => {
    // 19/11/2026 (quinta) 15h UTC → semana de 16/11; 3 semanas antes: 26/10
    expect(periodoPadrao('2026-11-19T15:00:00Z')).toEqual({ de: '2026-10-26', ate: '2026-11-19' });
  });

  it('usa o dia de São Paulo: segunda 01h UTC ainda é domingo em SP', () => {
    // 23/11 01:00 UTC = 22/11 22:00 em SP (domingo) → semana de 16/11
    expect(periodoPadrao('2026-11-23T01:00:00Z')).toEqual({ de: '2026-10-26', ate: '2026-11-22' });
  });
});

// ---------- História 6: Burndown da Sprint ----------

describe('validarSprint', () => {
  const certa = { nome: 'Sprint 2', inicio: '2026-11-17', fim: '2026-11-24', cartoes: ['A'] };

  it('aceita nome, início, fim (no mesmo dia ou depois) e pelo menos um cartão', () => {
    expect(validarSprint(certa)).toEqual([]);
    expect(validarSprint({ ...certa, fim: '2026-11-17' })).toEqual([]); // Sprint de um dia
  });

  it('recusa nome vazio, data faltando, fim antes do início e Sprint sem cartões', () => {
    expect(validarSprint({ ...certa, nome: '   ' })).toEqual(['O nome da Sprint é obrigatório.']);
    expect(validarSprint({ ...certa, inicio: '' })).toEqual(['Escolha a data de início e a de fim da Sprint.']);
    expect(validarSprint({ ...certa, fim: '2026-11-16' }))
      .toEqual(['A data de fim não pode ser antes da data de início.']);
    expect(validarSprint({ ...certa, cartoes: [] })).toEqual(['Escolha pelo menos um cartão para a Sprint.']);
  });

  // Regra 2 do CLAUDE.md: o banco tem o mesmo check de nome e de datas.
  it('o schema.sql tem os mesmos checks na tabela sprints', () => {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    expect(sql).toContain('nome       text not null check (length(trim(nome)) > 0)');
    expect(sql).toContain('check (fim >= inicio)');
    // A criar_sprint recusa a Sprint sem cartões com a mesma mensagem.
    expect(sql).toContain("raise exception 'Escolha pelo menos um cartão para a Sprint.'");
  });
});

describe('diasDaSprint', () => {
  it('lista todos os dias, do início ao fim, inclusive os dois', () => {
    expect(diasDaSprint('2026-11-16', '2026-11-20'))
      .toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(diasDaSprint('2026-11-30', '2026-12-01')).toEqual(['2026-11-30', '2026-12-01']); // virada do mês
    expect(diasDaSprint('2026-11-17', '2026-11-17')).toEqual(['2026-11-17']);
  });
});

describe('burndown', () => {
  // Exemplo feito à mão. Sprint de 16/11 (segunda) a 20/11 (sexta); hoje = 19/11.
  // Horários em UTC no banco; São Paulo = UTC-3.
  //   X (5 pontos): concluído 17/11 15h UTC (12h em SP)
  //   Y (3 pontos): concluído 18/11 13h UTC; VOLTOU para "Fazendo" 19/11 13h UTC (critério 3)
  //   Z (2 pontos): concluído 19/11 02h30 UTC = 18/11 23h30 em SP → conta no dia 18
  //   W (sem pontos): concluído 16/11; conta 0 e aparece no aviso (critério 4)
  // Total = 5 + 3 + 2 = 10.
  //   Real (no fim de cada dia): 16 → 10 · 17 → 10−5 = 5 · 18 → 5−3−2 = 0 · 19 → 0+3 = 3 · 20 → ainda não chegou
  //   Ideal = 10 × (1 − i/4), i = 0..4: 10 · 7,5 · 5 · 2,5 · 0
  const cartoesDaSprint = [
    { id: 'X', titulo: 'Cartão X', pontos: 5 },
    { id: 'Y', titulo: 'Cartão Y', pontos: 3 },
    { id: 'Z', titulo: 'Cartão Z', pontos: 2 },
    { id: 'W', titulo: 'Cartão W', pontos: null },
  ];
  const movs = [
    m('X', null, 'c-entrada', '2026-11-10T12:00:00Z'),
    m('Y', null, 'c-entrada', '2026-11-10T12:00:00Z'),
    m('Z', null, 'c-entrada', '2026-11-10T12:00:00Z'),
    m('W', null, 'c-entrada', '2026-11-10T12:00:00Z'),
    m('W', 'c-entrada', 'c-pronto', '2026-11-16T15:00:00Z'),
    m('X', 'c-entrada', 'c-pronto', '2026-11-17T15:00:00Z'),
    m('Y', 'c-entrada', 'c-pronto', '2026-11-18T13:00:00Z'),
    m('Z', 'c-entrada', 'c-pronto', '2026-11-19T02:30:00Z'),
    m('Y', 'c-pronto', 'c-fazendo', '2026-11-19T13:00:00Z'),
  ];
  const sprint = { inicio: '2026-11-16', fim: '2026-11-20' };
  const r = burndown({ cartoes: cartoesDaSprint, movimentos: movs, colunas: colunasDoFluxo, ...sprint, hoje: '2026-11-19' });

  it('bate com o exemplo feito à mão: real e ideal de cada dia', () => {
    expect(r.total).toBe(10);
    expect(r.dias).toEqual([
      { dia: '2026-11-16', ideal: 10, real: 10 },
      { dia: '2026-11-17', ideal: 7.5, real: 5 },
      { dia: '2026-11-18', ideal: 5, real: 0 },
      { dia: '2026-11-19', ideal: 2.5, real: 3 }, // Y saiu de Concluído: volta a contar
      { dia: '2026-11-20', ideal: 0, real: null }, // dia que ainda não chegou: sem valor real
    ]);
  });

  it('avisa os cartões sem pontos, para o time estimar', () => {
    expect(r.semPontos).toEqual([{ id: 'W', titulo: 'Cartão W' }]);
  });

  it('dá o mesmo resultado se o time renomear as colunas (usa o papel)', () => {
    const renomeadas = colunasDoFluxo.map((c) => ({ ...c, nome: `Outro nome ${c.id}` }));
    expect(burndown({ cartoes: cartoesDaSprint, movimentos: movs, colunas: renomeadas, ...sprint, hoje: '2026-11-19' }))
      .toEqual(r);
  });

  it('ignora movimentos de cartões que não estão na Sprint', () => {
    const comOutro = [...movs, m('FORA', null, 'c-entrada', '2026-11-16T12:00:00Z')];
    expect(burndown({ cartoes: cartoesDaSprint, movimentos: comOutro, colunas: colunasDoFluxo, ...sprint, hoje: '2026-11-19' }))
      .toEqual(r);
  });

  it('Sprint de um dia: a linha ideal já termina em zero (sem dividir por zero)', () => {
    const umDia = burndown({ cartoes: cartoesDaSprint, movimentos: movs, colunas: colunasDoFluxo,
      inicio: '2026-11-17', fim: '2026-11-17', hoje: '2026-11-19' });
    expect(umDia.dias).toEqual([{ dia: '2026-11-17', ideal: 0, real: 5 }]);
  });
});
