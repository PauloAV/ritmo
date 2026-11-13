import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COLUNAS_PADRAO, situacaoWip, validarMovimento,
  validarCredenciais, validarCadastro, traduzirErroAuth, validarNome,
  moverColunaNaOrdem, podeArquivarColuna, proximaPosicao, colunasQueMudaram,
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
});
