import { describe, it, expect } from 'vitest';
import { COLUNAS_PADRAO, situacaoWip, validarMovimento } from '../js/regras.js';

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
