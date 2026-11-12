# Registro de Uso da IA – Ritmo

Regra: por Sprint, pelo menos 3 registros, os dois integrantes aparecendo e pelo menos 1 erro da IA
encontrado e corrigido. Este arquivo alimenta a Parte 8 do relatório.

## Sprint 1

| Data | Quem usou | Ferramenta | O que pediu | O que aceitou | O que corrigiu e por quê |
|---|---|---|---|---|---|
| 12/11/2026 | Paulo | Claude Code | Leitura do repositório; implementar a H1 (#1) com TDD; configurar o Supabase e testar a H1 no navegador. | Regras puras com 16 testes novos (`validarCredenciais`, `validarCadastro`, `traduzirErroAuth`, `validarNome`, `moverColunaNaOrdem`, `podeArquivarColuna`); `schema.sql` com coluna arquivada, função `arquivar_coluna` e board só com o nome editável; telas de entrar, meus boards e board. | Decisão do PO: "excluir coluna" vira **arquivar**, porque apagar estragaria o histórico de movimentos. O PO também aceitou fechar uma brecha que a IA apontou: membro podia trocar `criado_por` e apagar o board. **Erros da IA:** no teste no navegador, (1) depois de sair, o formulário ficava em "Criar conta" e pedia nome para entrar; (2) a lista antiga de boards aparecia por um instante; (3) o botão Sair ficava branco sobre branco. Os três foram corrigidos e testados de novo. Foram achados pelo teste automatizado pedido à IA, não na revisão do time. Revisão do Kauan pendente no PR. |
