# Contas em Dia

App pessoal para controlar as contas a pagar todo mês (React + TypeScript, PWA). Dados no Firebase (Auth com Google + Firestore), site publicado no Netlify, código no GitHub.

**Esta versão:** cadastro de contas recorrentes, lançamento automático de cada mês, painel com o que falta pagar, marcar como paga, alertas de atrasada e vence hoje, uso offline. Qualquer pessoa pode entrar com a própria conta Google; os dados de cada uma ficam separados.

A leitura de e-mail (Gmail) foi feita e depois removida por decisão do projeto. O código ficou no histórico do Git (commit `3b9d023`) caso um dia volte.

## Configurar (uma vez)

### 1. Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Authentication > Sign-in method:** ative o provedor **Google**.
3. **Firestore Database > Criar banco de dados:** modo de produção, região `southamerica-east1` (São Paulo).
4. **Regras do Firestore:** cole o conteúdo de `firestore.rules` e publique (ou rode `firebase deploy --only firestore:rules`).
5. **Configurações do projeto > Seus apps > Web (`</>`):** registre o app e copie a configuração do SDK.
6. Depois de publicar no Netlify, volte em **Authentication > Configurações > Domínios autorizados** e adicione o domínio do site (`algo.netlify.app`).

O plano gratuito (Spark) basta.

### 2. Netlify

1. **Add new site > Import an existing project > GitHub** e escolha este repositório. O `netlify.toml` já define build (`npm run build`) e pasta (`dist`).
2. Em **Site configuration > Environment variables**, crie as 6 variáveis `VITE_FIREBASE_*` com os valores do passo 1.5 (modelo em `.env.example`).
3. Faça um novo deploy. Cada `git push` na `main` publica sozinho.

### 3. Rodar no computador

```bash
cp .env.example .env     # preencha com os valores do Firebase
npm install
npm run dev              # http://localhost:5173
npm test                 # testes da lógica e das telas
```

## Como os dados ficam no Firestore

Tudo fica em `users/{uid}/...`, e as regras só deixam cada pessoa acessar o próprio `uid`.

| Coleção | Conteúdo |
| --- | --- |
| `users/{uid}/bills/{id}` | Conta recorrente (o molde): nome, valor esperado, dia, periodicidade, categoria. |
| `users/{uid}/entries/{billId_AAAA-MM}` | Lançamento do mês. O id é `contaId_competência`, então nunca duplica, mesmo em dois aparelhos. |

Valores monetários são guardados em **centavos (inteiro)**. Datas em `AAAA-MM-DD`, sempre no fuso de São Paulo.

## Estrutura

- `src/domain`: regras puras e testadas (dinheiro, datas, recorrência, status, resumo). Não dependem do Firebase.
- `src/data`: acesso ao Firestore e hooks; `push.ts` cuida da permissão e da inscrição do aparelho.
- `netlify/functions` e `netlify/lib`: o servidor dos avisos (usa as regras de `src/domain/alerts.ts`).
- `public/push-handler.js`: mostra a notificação no aparelho (carregado pelo service worker).
- `src/pages`, `src/components`: telas.

## Avisos de vencimento (notificação no celular e no navegador)

Em **Cadastros > Alertas de vencimento** a pessoa escolhe quantos dias antes avisar (no dia, 1, 2, 3, 5, 7, 10 ou 15; pode marcar vários), a que horas, **como** ser avisada (caixinhas **Avisar por notificação**, ligada por padrão, e **Avisar por e-mail**, desligada; dá para usar só uma, as duas, ou nenhuma e ficar só com a faixa do app) e ativa cada aparelho. Dentro do app, a faixa “Vence amanhã” no Início segue as mesmas escolhas e não depende do servidor.

Para a notificação chegar **com o app fechado**, o servidor precisa estar ligado. Ele roda no Netlify, sem o plano Blaze do Firebase:

- `netlify/functions/send-alerts.mts` roda no começo de cada hora (UTC). Para quem já passou do horário escolhido e ainda não recebeu hoje, olha as contas que vencem nos prazos marcados e manda **uma** notificação com todas (só nomes e prazos, nunca valores, porque a tela bloqueada pode estar à vista).
- `push-config.mts` entrega ao app a chave pública; `send-test.mts` atende o botão “Enviar aviso de teste”.
- As chaves de assinatura (VAPID) nascem sozinhas na primeira chamada e ficam em `appConfig/vapid` no Firestore, que as regras fecham para o app (só o servidor lê).
- Cada aparelho ativado vira um documento em `users/{uid}/pushSubscriptions/{id}`; as escolhas ficam em `users/{uid}/settings/alerts`; o último dia avisado, em `users/{uid}/settings/alertState`.

**Única configuração manual:** no Netlify (Project configuration > Environment variables), criar `FIREBASE_SERVICE_ACCOUNT` com o conteúdo do JSON da conta de serviço (Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada), marcada como **secret** e nunca colada no repositório nem em conversas. Depois, um novo deploy. Sem essa variável, a tela de Alertas avisa que o servidor ainda não foi ligado e o resto do app segue normal.

### Também por e-mail (opcional)

Na mesma tela há a caixinha **Avisar por e-mail** (independente da notificação): mesmos prazos e horário, e-mail só com nomes e prazos (sem valores). Sai de **um endereço remetente do app** (nunca do e-mail de quem usa) para o **e-mail do login** de cada pessoa, lido pelo servidor no Firebase Authentication, nunca de um endereço digitado no app. Só vale para e-mail **confirmado**: quem entra com o Google já tem; quem criou conta com e-mail e senha confirma pelo botão “Enviar e-mail de confirmação” na própria tela.

- O envio usa a API do **Brevo** (plano gratuito: 300 e-mails por dia). `send-alerts.mts` manda o e-mail na mesma passada horária da notificação; cada canal guarda o seu “já avisei hoje” (`lastSent` e `lastSentEmail` em `settings/alertState`), então a falha de um não repete nem cancela o outro. `send-test-email.mts` atende o botão “Enviar e-mail de teste” (no máximo um por minuto por pessoa).
- **Configuração manual, só no painel do Netlify** (Environment variables; a chave marcada como **secret**, nunca no repositório nem em conversas):
  - `BREVO_API_KEY`: chave de API criada no Brevo (SMTP e API > Chaves de API).
  - `MAIL_FROM`: o endereço remetente, **já confirmado no Brevo** (Remetentes, domínios e IPs > Remetentes). Sem isso o Brevo recusa o envio.
  - `MAIL_FROM_NAME` (opcional): nome que aparece como remetente. Padrão: Contas em Dia.
  - `APP_URL` (opcional): endereço usado no botão do e-mail. Padrão: o do site no Netlify.
- Sem `BREVO_API_KEY` e `MAIL_FROM`, a caixinha aparece travada, com a explicação, e o resto dos avisos segue normal.
- **Sem domínio próprio**, o remetente pode ser um e-mail pessoal confirmado no Brevo, mas e-mails enviados “em nome” de um Gmail por um serviço de terceiros tendem a cair no spam. Com um domínio, basta autenticá-lo no Brevo e trocar `MAIL_FROM`; o app não muda.

## Limitações conhecidas

- No iPhone, o login com Google por pop-up pode falhar quando o app está instalado na tela inicial. Entrando pelo Safari funciona.
- Anexos (boleto em PDF, comprovante) ainda não existem: o Cloud Storage do Firebase também pede o plano Blaze. Por enquanto, guarde a linha digitável no campo de texto.
- Avisos de vencimento com o app fechado: no iPhone exigem iOS 16.4 ou mais novo e o app instalado na Tela de Início. A faixa “Vence amanhã” dentro do app funciona em qualquer aparelho.
- Aviso por e-mail: o plano gratuito do Brevo manda até 300 por dia (um por pessoa por dia, então cabe em centenas de pessoas). Sem domínio próprio, parte dos e-mails pode cair no spam.

## Publicação

- Site: https://appfinancasbr.netlify.app (Netlify, com Base directory `app-financas`; cada push na `main` publica sozinho).
- Firebase: projeto `financas-e0917`. As variáveis `VITE_FIREBASE_*` ficam no Netlify (Project configuration > Environment variables).
- A chave `apiKey` do app Web não é segredo (só identifica o projeto; a proteção está nas regras do Firestore). Por isso o Netlify é avisado para não tratá-la como segredo na leitura do build (`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`).
