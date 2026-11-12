import { describe, it, expect } from 'vitest';
import {
  COLUNAS_PADRAO, situacaoWip, validarMovimento,
  validarCredenciais, validarCadastro, traduzirErroAuth, validarNome,
  moverColunaNaOrdem, podeArquivarColuna,
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

  it('erro desconhecido mostra uma mensagem genérica', () => {
    expect(traduzirErroAuth({ message: 'Something odd' }))
      .toBe('Não foi possível entrar agora. Tente de novo em instantes.');
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
});

describe('podeArquivarColuna', () => {
  it('coluna vazia pode ser excluída (arquivada)', () => {
    expect(podeArquivarColuna(0)).toEqual([]);
  });

  it('coluna com cartões não pode, com a mesma mensagem do banco (arquivar_coluna)', () => {
    expect(podeArquivarColuna(2))
      .toEqual(['A coluna tem 2 cartão(ões). Mova os cartões antes de excluir.']);
  });
});
