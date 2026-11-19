// Métricas do NOSSO projeto (para o relatório), a partir dos dados do board e das issues.
// Uso: node scripts/metricas.mjs docs/metricas/sprint-1.json
// Lê o JSON coletado do GitHub, imprime as métricas e gera dois gráficos em docs/metricas/:
// burndown-sprint-N.svg e cfd-sprint-N.svg. Node puro, sem dependências.
//
// Definições (as mesmas do relatório):
// - Lead Time   = dia em que a issue fechou − dia em que a issue foi criada (média das concluídas)
// - Cycle Time  = dia em que a issue fechou − campo "Início" do board (média das concluídas)
// - Throughput  = número de histórias concluídas na Sprint
// - Velocity    = soma dos pontos das histórias concluídas (história pela metade conta zero)
// - Burndown    = pontos que ainda faltam no fim de cada dia (planejado × real)
// - CFD         = quantos cartões estão em cada coluna no fim de cada dia
// "Dia" é sempre o dia do calendário de São Paulo, e as contas são em dias corridos.
import { readFileSync, writeFileSync } from 'node:fs';

const arquivo = process.argv[2] ?? 'docs/metricas/sprint-1.json';
const dados = JSON.parse(readFileSync(arquivo, 'utf8'));
const { sprint, inicio, fim, historias } = dados;

// ---------- Datas ----------

// Data e hora em UTC (como o GitHub guarda) → dia do calendário de São Paulo, "AAAA-MM-DD".
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const diaSP = (iso) => formatoDia.format(new Date(iso));

// Quantos dias corridos vão de um dia "AAAA-MM-DD" até outro.
const diasEntre = (de, ate) => (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;

// Todos os dias da Sprint, do primeiro ao último.
const diasDaSprint = [];
for (let d = inicio; d <= fim; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
  diasDaSprint.push(d);
}
const curto = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`; // "2026-11-17" → "17/11"

// ---------- Métricas ----------

const concluidas = historias.filter((h) => h.fechada_em && diaSP(h.fechada_em) >= inicio && diaSP(h.fechada_em) <= fim);
const media = (lista) => lista.reduce((soma, x) => soma + x, 0) / lista.length;

const linhas = concluidas.map((h) => ({
  historia: `#${h.numero}`,
  pontos: h.pontos,
  criada: curto(diaSP(h.criada_em)),
  inicio: h.inicio ? curto(h.inicio) : '—',
  fechada: curto(diaSP(h.fechada_em)),
  leadTime: diasEntre(diaSP(h.criada_em), diaSP(h.fechada_em)),
  cycleTime: h.inicio ? diasEntre(h.inicio, diaSP(h.fechada_em)) : null,
}));

const pontosPlanejados = historias.reduce((soma, h) => soma + (h.pontos ?? 0), 0);
const velocity = concluidas.reduce((soma, h) => soma + (h.pontos ?? 0), 0);
const comInicio = linhas.filter((l) => l.cycleTime !== null);

console.log(`\nSprint ${sprint} (${curto(inicio)} a ${curto(fim)})\n`);
console.table(linhas);
console.log(`Lead Time médio:  ${media(linhas.map((l) => l.leadTime)).toFixed(2)} dias`);
console.log(`Cycle Time médio: ${media(comInicio.map((l) => l.cycleTime)).toFixed(2)} dias`
  + (comInicio.length < linhas.length ? ` (${linhas.length - comInicio.length} história(s) sem Início)` : ''));
console.log(`Throughput:       ${concluidas.length} histórias (de ${historias.length} planejadas)`);
console.log(`Velocity:         ${velocity} pontos (de ${pontosPlanejados} planejados)`);

// Burndown: no fim de cada dia, pontos planejados − pontos das histórias que já fecharam.
// A linha "planejado" desce em linha reta do total (1º dia) até zero (último dia).
const burndown = diasDaSprint.map((dia, i) => ({
  dia: curto(dia),
  planejado: +(pontosPlanejados * (1 - i / (diasDaSprint.length - 1))).toFixed(1),
  real: pontosPlanejados - concluidas
    .filter((h) => diaSP(h.fechada_em) <= dia)
    .reduce((soma, h) => soma + (h.pontos ?? 0), 0),
}));
console.log('\nBurndown (pontos restantes no fim do dia):');
console.table(burndown);

// CFD: no fim de cada dia, cada cartão está na última coluna para onde foi movido até aquele dia.
// Cartão que ainda não existia no board naquele dia não conta.
const COLUNAS = ['Backlog', 'Sprint Backlog', 'Em andamento', 'Em revisão', 'Concluído'];
const cfd = diasDaSprint.map((dia) => {
  const linha = { dia: curto(dia) };
  for (const c of COLUNAS) linha[c] = 0;
  for (const h of historias) {
    // Ordena por data antes: se a API devolver em outra ordem, o "último" continua certo.
    const ate = [...h.status].sort((a, b) => a.em.localeCompare(b.em)).filter((s) => diaSP(s.em) <= dia);
    if (ate.length > 0) linha[ate.at(-1).coluna] += 1;
  }
  return linha;
});
console.log('CFD (cartões em cada coluna no fim do dia):');
console.table(cfd);

// ---------- Gráficos (SVG feito à mão) ----------
// Cores: paleta categórica validada (skill dataviz), sempre na mesma ordem das colunas.
const COR = {
  fundo: '#fcfcfb', texto: '#0b0b0b', texto2: '#52514e', apagado: '#898781', grade: '#e4e3dd', eixo: '#c3c2b7',
  serie: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
};
const L = 680; const A = 360;
const M = { esq: 48, dir: 110, topo: 84, baixo: 40 };
const largura = L - M.esq - M.dir; const altura = A - M.topo - M.baixo;
const xDe = (i) => M.esq + (i / (diasDaSprint.length - 1)) * largura;
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const texto = (x, y, t, extra = '') => `<text x="${x}" y="${y}" ${extra}>${escapar(t)}</text>`;

function moldura(titulo, subtitulo, maximo, passo, corpo, legenda) {
  const yDe = (v) => M.topo + altura - (v / maximo) * altura;
  const grade = [];
  for (let v = 0; v <= maximo; v += passo) {
    grade.push(`<line x1="${M.esq}" x2="${M.esq + largura}" y1="${yDe(v)}" y2="${yDe(v)}" stroke="${v === 0 ? COR.eixo : COR.grade}" stroke-width="1"/>`);
    grade.push(texto(M.esq - 8, yDe(v) + 4, v, `text-anchor="end" fill="${COR.apagado}" font-size="11"`));
  }
  const dias = diasDaSprint.map((d, i) => texto(xDe(i), M.topo + altura + 18, curto(d), `text-anchor="middle" fill="${COR.apagado}" font-size="11"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" width="${L}" height="${A}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
<rect width="${L}" height="${A}" fill="${COR.fundo}"/>
${texto(M.esq, 24, titulo, `fill="${COR.texto}" font-size="15" font-weight="600"`)}
${texto(M.esq, 42, subtitulo, `fill="${COR.texto2}" font-size="12"`)}
${legenda}
${grade.join('\n')}
${dias.join('\n')}
${corpo(yDe)}
</svg>
`;
}

function legendaEmLinha(itens, y = 62) {
  let x = M.esq;
  return itens.map(({ nome, cor, tracejado }) => {
    const marca = tracejado
      ? `<line x1="${x}" x2="${x + 14}" y1="${y - 4}" y2="${y - 4}" stroke="${cor}" stroke-width="2" stroke-dasharray="4 3"/>`
      : `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${cor}"/>`;
    const t = texto(x + 18, y, nome, `fill="${COR.texto2}" font-size="11"`);
    x += 26 + nome.length * 6.2;
    return marca + t;
  }).join('\n');
}

// Burndown: real (linha cheia com pontos) × planejado (tracejado, cor apagada).
const maxBurn = Math.ceil(pontosPlanejados / 4) * 4;
const svgBurndown = moldura(
  `Burndown da Sprint ${sprint}`,
  'Pontos que faltam no fim de cada dia (dias do calendário de São Paulo)',
  maxBurn, 4,
  (yDe) => {
    const linha = (campo) => burndown.map((b, i) => `${i === 0 ? 'M' : 'L'}${xDe(i).toFixed(1)},${yDe(b[campo]).toFixed(1)}`).join(' ');
    const pontos = burndown.map((b, i) => `<circle cx="${xDe(i).toFixed(1)}" cy="${yDe(b.real).toFixed(1)}" r="4" fill="${COR.serie[0]}" stroke="${COR.fundo}" stroke-width="2"/>`);
    // Valor só onde a linha real muda (não em todo ponto), acima e à direita do ponto.
    const rotulos = burndown.map((b, i) => (i > 0 && b.real !== burndown[i - 1].real)
      ? texto(xDe(i) + 6, yDe(b.real) - 9, b.real, `fill="${COR.texto}" font-size="11"`) : '');
    // Nome de cada linha no meio dela (no fim, as duas chegam a zero e os nomes se encostariam).
    const meio = Math.floor((burndown.length - 1) / 2);
    return [
      `<path d="${linha('planejado')}" fill="none" stroke="${COR.apagado}" stroke-width="2" stroke-dasharray="6 4"/>`,
      `<path d="${linha('real')}" fill="none" stroke="${COR.serie[0]}" stroke-width="2"/>`,
      ...pontos, ...rotulos,
      texto(xDe(1), yDe(burndown[1].real) - 10, 'Real', `fill="${COR.texto2}" font-size="12" text-anchor="middle"`),
      texto(xDe(meio) - 8, yDe(burndown[meio].planejado) + 18, 'Planejado', `fill="${COR.texto2}" font-size="12" text-anchor="end"`),
    ].join('\n');
  },
  legendaEmLinha([{ nome: 'Real', cor: COR.serie[0] }, { nome: 'Planejado', cor: COR.apagado, tracejado: true }]),
);

// CFD: áreas empilhadas; "Concluído" fica embaixo e "Backlog" em cima (ordem do fluxo, de baixo para cima).
const empilhadas = [...COLUNAS].reverse();
const maxCfd = Math.max(...cfd.map((linha) => COLUNAS.reduce((s, c) => s + linha[c], 0)));
const svgCfd = moldura(
  `Fluxo cumulativo (CFD) da Sprint ${sprint}`,
  'Cartões em cada coluna no fim de cada dia',
  maxCfd, 1,
  (yDe) => {
    const base = cfd.map(() => 0);
    const camadas = [];
    const ultimo = cfd.length - 1;
    for (const coluna of empilhadas) {
      const cor = COR.serie[COLUNAS.indexOf(coluna)];
      const topo = cfd.map((linha, i) => base[i] + linha[coluna]);
      if (topo.every((v, i) => v === base[i])) continue; // coluna sempre vazia: não desenha
      const ida = topo.map((v, i) => `${i === 0 ? 'M' : 'L'}${xDe(i).toFixed(1)},${yDe(v).toFixed(1)}`).join(' ');
      const volta = [...base].map((v, i) => [i, v]).reverse().map(([i, v]) => `L${xDe(i).toFixed(1)},${yDe(v).toFixed(1)}`).join(' ');
      // contorno da cor do fundo = 2px de folga entre as camadas
      camadas.push(`<path d="${ida} ${volta} Z" fill="${cor}" stroke="${COR.fundo}" stroke-width="2" stroke-linejoin="round"/>`);
      // Rótulo direto no dia em que a camada é mais grossa; se vários dias empatam, o do meio
      // (o primeiro dia empatado fica na borda da área e o texto sai cortado).
      const espessura = topo.map((v, i) => v - base[i]);
      const maior = Math.max(...espessura);
      const empatados = espessura.map((e, i) => (e === maior ? i : -1)).filter((i) => i >= 0);
      const melhor = empatados[Math.floor((empatados.length - 1) / 2)];
      const meio = (topo[melhor] + base[melhor]) / 2;
      // No último dia, o texto vai para a direita da área (começa logo depois dela);
      // nos outros dias, fica centralizado em cima do dia escolhido.
      const noUltimoDia = melhor === ultimo;
      const xRotulo = noUltimoDia ? xDe(ultimo) + 6 : xDe(melhor);
      const ancora = noUltimoDia ? 'start' : 'middle';
      camadas.push(texto(xRotulo, yDe(meio) + 4, coluna,
        `fill="${COR.texto}" font-size="11" text-anchor="${ancora}" paint-order="stroke" stroke="${COR.fundo}" stroke-width="3"`));
      topo.forEach((v, i) => { base[i] = v; });
    }
    return camadas.join('\n');
  },
  legendaEmLinha(COLUNAS.map((c, i) => ({ nome: c, cor: COR.serie[i] }))),
);

writeFileSync(`docs/metricas/burndown-sprint-${sprint}.svg`, svgBurndown);
writeFileSync(`docs/metricas/cfd-sprint-${sprint}.svg`, svgCfd);
console.log(`Gráficos: docs/metricas/burndown-sprint-${sprint}.svg e docs/metricas/cfd-sprint-${sprint}.svg`);
