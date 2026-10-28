# Quadra Cheia

Protótipo de um web app para encontrar grupos e partidas de vôlei, vôlei de areia, futsal, basquete, handebol e beach tennis perto de você.

Quem procura jogo pede para entrar num grupo. O organizador aceita ou recusa, e só depois do aceite o contato pelo WhatsApp é liberado. O telefone dos usuários nunca aparece.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Código-base do protótipo. Abre direto no navegador. |
| `app.html` | Versão publicada como Artifact no Claude. Gerada a partir do `index.html`; não edite à mão. |
| `gerar-app.py` | Gera o `app.html` a partir do `index.html`: `python3 gerar-app.py` |
| `PENDENCIAS.md` | Problemas conhecidos que ainda serão corrigidos. |

## Como testar

Abra o `index.html` no navegador. É um protótipo: os dados ficam só na memória e somem ao recarregar a página.

- Código de verificação: qualquer sequência de 6 dígitos.
- CEPs de exemplo: 04101-000, 04001-000 e 05422-000.
