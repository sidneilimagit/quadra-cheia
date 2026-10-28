# Pendências do Quadra Cheia

## Resolvidas

- [x] **Problema 5: distância falsa.** Resolvido em 28/10/2026. A distância agora é calculada (em linha reta, fórmula de Haversine) entre as coordenadas do CEP do usuário e as do CEP da quadra.

## Conscientes (fora do MVP, para depois)

- [ ] **Verificação de telefone.** O MVP verifica só o e-mail; o telefone nem é coletado (minimização de dados).
- [ ] **Foto de perfil.** Exige armazenamento de arquivos; não está entre as 8 funcionalidades do MVP.
- [ ] **Domínio próprio para os e-mails.** Hoje o remetente é um Gmail via Brevo; sem domínio com DKIM/DMARC, parte dos e-mails pode cair no spam.
- [ ] **Distância por rota.** A distância é em linha reta; a distância real de deslocamento pode ser maior.
- [ ] **Notificações em tempo real.** O app confere novidades a cada 30 segundos enquanto está aberto; não há notificação push.
