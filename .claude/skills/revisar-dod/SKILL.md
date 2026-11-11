---
name: revisar-dod
description: Confere se as mudanças atuais cumprem a Definition of Done do Ritmo (testes, métricas conferíveis, histórico imutável, RLS, segredos). Use antes de commit, antes de abrir PR ou ao revisar o PR do colega.
---

# Revisão pela Definition of Done

Analise as mudanças da branch atual (`git diff main...HEAD` e `git status`). Para um PR: `gh pr diff <número>`.

## Checklist (marque ✅, ❌ ou ⚠️ com uma linha de explicação)
1. **Critérios de aceite:** cada critério da issue (`gh issue view <n>`) está atendido? Diga onde.
2. **Testes:** rode `npm test`. As regras novas têm teste? Os testes usam só dados fictícios?
3. **Métricas e simulação:** cada cálculo novo tem teste com exemplo feito à mão? A definição
   está escrita no código? A simulação recebe a semente por parâmetro (sem `Math.random()` direto)?
   Datas tratadas em UTC?
4. **Histórico imutável:** alguma mudança permite editar ou apagar `movimentos`, ou mudar a coluna de
   um cartão sem passar por `mover_cartao`? Regras iguais em `js/regras.js` e `schema.sql`?
5. **Banco:** toda tabela nova tem `enable row level security` e políticas? Escritas sensíveis passam
   por função que confere as regras?
6. **Segredos:** procure chaves e senhas no diff (`eyJ`, `service_role`, `SUPABASE_ANON_KEY=`,
   `password`). Confirme que `js/config.js` não está sendo versionado (`git ls-files js/config.js`).
7. **Explicável:** há algum trecho complexo demais para o time explicar sem consulta? Sugira simplificar.
8. **Deploy:** o workflow continua igual ou a mudança foi intencional?

## Saída
Uma tabela curta com o resultado de cada item e, no fim, a lista do que precisa mudar antes do merge.
Não corrija nada sozinho: proponha as correções e espere o OK.
