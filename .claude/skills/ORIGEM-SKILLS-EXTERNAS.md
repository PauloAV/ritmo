# Skills de terceiros

Três skills desta pasta não foram escritas pelo time. Elas foram copiadas sem mudança a partir da lista
"Top Claude Skills for UI/UX Engineers" (Snyk, 02/03/2026), em 24/11/2026. Antes de entrarem aqui,
o conteúdo foi lido: são só texto (Markdown), sem scripts e sem comandos de rede.

| Skill | Origem (commit) | Licença | Para que usamos |
|---|---|---|---|
| `web-design-guidelines` | github.com/vercel-labs/agent-skills (`5a37a63`) | MIT | Revisar HTML/CSS/JS e listar problemas de acessibilidade e UX como `arquivo:linha` |
| `bencium-controlled-ux-designer` | github.com/bencium/bencium-claude-code-design-skill (`5de46a3`) | MIT (`LICENSE` na pasta) | Guia de UX, acessibilidade e responsividade; pergunta antes de decidir cor, fonte ou layout |
| `frontend-design` | github.com/anthropics/skills (`e4bb5d9`) | Apache 2.0 (`LICENSE.txt` na pasta) | Direção visual (paleta, tipografia), se o time decidir mudar o visual |

Ficaram de fora:
- as skills de React e React Native, porque o Ritmo não usa React;
- a AccessLint, porque roda `npx @accesslint/mcp@latest`, um pacote npm sem versão fixa (dependência nova);
- a UI/UX Pro Max, porque traz scripts Python e é voltada a Tailwind e React.

Para atualizar uma delas: baixar a versão nova, **ler a diferença** antes de copiar (uma skill pode
trazer instruções maliciosas) e trocar o commit nesta tabela.
