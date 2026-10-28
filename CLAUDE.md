# Quadra Cheia: combinados do projeto

Protótipo de web app para encontrar grupos e partidas esportivas. Tudo em português do Brasil.

## Produto
- Esportes: vôlei, vôlei de areia, futsal, basquete, handebol e beach tennis.
- Modelo de entrada: a pessoa **pede para entrar** e o organizador aceita ou recusa. O contato pelo WhatsApp só é liberado após o aceite; o telefone nunca aparece.
- Rodapé: Buscar, Atividade, Criar grupo.
- Limite de 1 a 20 vagas por grupo.
- Todo texto digitado pelo usuário passa por `esc()` antes de ir para o HTML.

## Arquivos
- `index.html` é o código-base. Edite só ele.
- `app.html` é gerado com `python3 gerar-app.py` e publicado como Artifact em https://claude.ai/artifact/4ytZnF9rNq3XjJXBvN4sRg (republicar no mesmo link a cada mudança).
- `PENDENCIAS.md` lista problemas conhecidos.

## Pendência que só se corrige quando for pedido
- **Problema 5:** a distância de grupos criados é fixa em 1,0 km (`PENDENTE (problema 5)` no `index.html`). Não corrigir até o dono do projeto pedir; lembrar dela quando fizer sentido.

## Regra de commits (janela de 5 horas)
- A `main` recebe no máximo um commit por janela de 5 horas.
- **Janela aberta** = a branch `rascunho` no GitHub tem commits que a `main` não tem.
- Primeira mudança com a janela fechada: criar `rascunho` a partir da `main` atual, commitar, dar push em `rascunho` e agendar um lembrete para daqui a 5 horas (em sessões na nuvem, com `send_later`).
- Mudanças seguintes dentro da janela: commit e push em `rascunho` a cada mudança (cópia de segurança). Não mexer na `main`.
- Ao fim das 5 horas: `git merge --squash rascunho` na `main`, um commit com o resumo de tudo o que mudou na janela, push da `main`, depois alinhar `rascunho` com a `main` (`git branch -f rascunho main` e `git push --force-with-lease origin rascunho`). A janela fecha.
- Sessões locais sem agendamento: avisar o dono do projeto quando a janela vencer, em vez de fechar sozinho.
