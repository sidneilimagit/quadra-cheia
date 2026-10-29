# Quadra Cheia

Web app para encontrar grupos e partidas de vôlei, vôlei de areia, futsal, basquete, handebol e beach tennis perto de você.

Quem procura jogo pede para entrar num grupo. O organizador aceita ou recusa, e só depois do aceite o link da comunidade no WhatsApp é liberado. O app não coleta telefone.

**No ar:** https://sidneilimagit.github.io/quadra-cheia/

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (telas, estilos e código). Abre direto no navegador. |
| `supabase/schema.sql` | Banco completo: tabelas, regras de acesso (RLS), gatilhos. Para projeto novo. |
| `supabase/002_vagas_restantes.sql` | Atualização para quem já tinha rodado a primeira versão do `schema.sql`. |
| `supabase/demo.sql` | Dados de demonstração (perfis, 10 grupos, solicitações) para o avaliador e o vídeo. |
| `supabase/metricas.sql` | Consultas das métricas de validação da Fase 2 (só leitura). |
| `supabase/teste-volume.sql` | Cria e apaga 300 grupos fictícios para medir a busca. |
| `testes/` | Testes automáticos (ver abaixo). |
| `app.html` | Protótipo v1 publicado como Artifact no Claude, usado na rodada 1 de testes de usabilidade. |
| `gerar-app.py` | Gera o `app.html` a partir do `index.html`. |
| `PENDENCIAS.md` | Problemas resolvidos e pendências conscientes. |

## Versões

- **`v1-prototipo`** (tag): protótipo da rodada 1 de testes de usabilidade. Dados só na memória, sem backend.
- **Versão atual:** conectada ao Supabase. Cadastro com verificação de e-mail, perfil, publicação e busca de grupos com distância real, solicitações, painel do organizador, link do WhatsApp após o aceite, denúncia e bloqueio.

## Arquitetura

- **Front-end:** um único `index.html` (HTML, CSS e JavaScript sem framework), hospedado no GitHub Pages.
- **Back-end:** Supabase (Postgres + autenticação). Toda regra de segurança fica no banco, em políticas RLS e gatilhos.
- **E-mail:** SMTP do Brevo, configurado no Supabase, para enviar o código de verificação.
- **CEP:** AwesomeAPI (endereço + coordenadas), com ViaCEP de reserva.

## Testes automáticos

Instale as dependências uma vez: `npm i @electric-sql/pglite jsdom`

| Comando | O que testa |
|---|---|
| `node testes/regras-de-acesso.mjs supabase/schema.sql` | As regras do banco num Postgres local que simula o Supabase |
| `node testes/telas-autenticacao.mjs index.html` | Cadastro, verificação, login e sair |
| `node testes/telas-perfil.mjs index.html` | Montar, salvar, carregar e editar o perfil |
| `node testes/telas-grupos.mjs index.html` | Jornada completa com organizador e atletas: criar grupo, buscar, pedir entrada, aceitar, link do WhatsApp, lotação, denúncia, bloqueio |
