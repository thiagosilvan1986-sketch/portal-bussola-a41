# Contas em Dia

App pessoal para controlar as contas a pagar todo mês (React + TypeScript, PWA). Dados no Firebase (Auth com Google + Firestore), site publicado no Netlify, código no GitHub.

**Fase 1 (esta versão):** cadastro de contas recorrentes, lançamento automático de cada mês, painel com o que falta pagar, marcar como paga, alertas de atrasada e vence hoje, uso offline.
**Próximas fases:** leitura do Gmail com sugestões de cadastro e de valor, conciliação automática de pagamentos, lembretes por notificação (exigem Cloud Functions).

## Configurar (uma vez)

### 1. Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Authentication > Sign-in method:** ative o provedor **Google**.
3. **Firestore Database > Criar banco de dados:** modo de produção, região `southamerica-east1` (São Paulo).
4. **Regras do Firestore:** cole o conteúdo de `firestore.rules` e publique (ou rode `firebase deploy --only firestore:rules`).
5. **Configurações do projeto > Seus apps > Web (`</>`):** registre o app e copie a configuração do SDK.
6. Depois de publicar no Netlify, volte em **Authentication > Configurações > Domínios autorizados** e adicione o domínio do site (`algo.netlify.app`).

O plano gratuito (Spark) basta para a Fase 1. A Fase 2 usa Cloud Functions, que exigem o plano Blaze (pague conforme o uso, com cota gratuita mensal).

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
- `src/data`: acesso ao Firestore e hooks.
- `src/pages`, `src/components`: telas.

## Limitações conhecidas

- No iPhone, o login com Google por pop-up pode falhar quando o app está instalado na tela inicial. Entrando pelo Safari funciona.
- Anexos (boleto em PDF, comprovante) ainda não existem: o Cloud Storage do Firebase também pede o plano Blaze. Por enquanto, guarde a linha digitável no campo de texto.
- Lembretes por notificação e e-mail diário dependem de Cloud Functions (Fase 2).

## Publicação

- Site: https://appfinancasbr.netlify.app (Netlify, com Base directory `app-financas`; cada push na `main` publica sozinho).
- Firebase: projeto `financas-e0917`. As variáveis `VITE_FIREBASE_*` ficam no Netlify (Project configuration > Environment variables).
- A chave `apiKey` do app Web não é segredo (só identifica o projeto; a proteção está nas regras do Firestore). Por isso o Netlify é avisado para não tratá-la como segredo na leitura do build (`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`).

## Fase 2: leitura do Gmail e sugestões

O app lê só as cobranças e os comprovantes que chegam no seu Gmail (permissão **somente leitura**) e sugere cadastrar a conta ou atualizar o valor. Ele nunca envia, apaga ou altera e-mails e nunca paga nada.

**Como funciona**

1. Em *Ajustes > Conectar o Gmail* a pessoa autoriza a leitura no Google. O acesso fica guardado só no servidor (coleção `integrations`, fechada para o navegador pelas regras do Firestore).
2. Uma função agendada do Netlify roda a cada 10 minutos (e o botão *Verificar agora* roda na hora). Ela busca e-mails com cara de cobrança (boleto, fatura, vencimento…), nos últimos 90 dias na primeira vez.
3. Cada e-mail novo passa pelo Claude (modelo `claude-haiku-5-5`), que só **extrai** dados (tipo, fornecedor, CNPJ, valor, vencimento, linha digitável, sinais de golpe). O texto do e-mail é tratado como não confiável e a resposta do modelo é validada em código antes de qualquer uso.
4. **Quem decide é o código**, não o modelo (`src/domain/suggestions.ts`), por pontuação: CNPJ 35, remetente 25, nome 15, valor 10, competência 10, documento 5. Limiar automático: 85.

| Cenário | O que acontece |
| --- | --- |
| A. Cobrança igual ao esperado, conta já conhecida (pontuação 85 ou mais) | Aplicada sozinha (guarda o valor cobrado e o código de pagamento). Fica no histórico. |
| B. Valor ou vencimento diferente | Vira sugestão: "de R$ X para R$ Y". |
| C. Fornecedor novo | Sugestão de cadastro (um toque cria a conta e o lançamento do mês). |
| H. Mesma cobrança de novo | Ignorada (impressão digital da cobrança). |
| I. Sinal de golpe, remetente ou CNPJ diferente do cadastrado | Bloqueada, nada é alterado; aparece um alerta. |
| Pagamento (comprovante) | Só registrado no histórico; a conciliação automática é a Fase 3. |

Com *Só sugerir* ligado, o cenário A também vira sugestão. Conta parecida mas sem CNPJ nem remetente aprendido pede confirmação; ao confirmar, o app aprende o remetente e as próximas cobranças daquela conta passam a ser aplicadas sozinhas.

**Privacidade (LGPD)**: o app guarda só remetente, assunto, data e o que foi extraído. O corpo do e-mail não é guardado. O texto (e o PDF, se houver) é enviado à API da Anthropic para a leitura. *Desconectar* revoga o acesso no Google e apaga o token.

### Passo a passo para ligar

**1. Google Cloud (mesmo projeto do Firebase, `financas-e0917`)**

1. Em console.cloud.google.com, escolha o projeto e abra *APIs e serviços > Biblioteca*. Ative a **Gmail API**.
2. *Tela de permissão OAuth*: tipo **Externo**; nome do app "Contas em Dia"; e-mail de suporte e de contato o seu. Em *Escopos*, adicione `.../auth/gmail.readonly`.
3. Na mesma tela, em *Status de publicação*, clique em **Publicar app** (Em produção). Se ficar em "Teste", o Google derruba o acesso a cada 7 dias. Em produção sem verificação, aparece o aviso "app não verificado" ao conectar: toque em *Avançado > Acessar Contas em Dia*. Isso vale para até 100 pessoas.
4. *Credenciais > Criar credenciais > ID do cliente OAuth*, tipo **Aplicativo da Web**. Em *URIs de redirecionamento autorizados*, coloque exatamente: `https://appfinancasbr.netlify.app/.netlify/functions/gmail-callback`
5. Copie o **ID do cliente** e a **chave secreta do cliente**.

**2. Conta de serviço do Firebase**: no console do Firebase, *Configurações do projeto > Contas de serviço > Gerar nova chave privada*. O arquivo JSON baixado é o valor de `FIREBASE_SERVICE_ACCOUNT`. Não coloque no GitHub nem mande em conversa.

**3. Anthropic**: em console.anthropic.com, crie uma chave de API e adicione um pouco de crédito. O modelo Haiku é o mais barato; para uso pessoal o gasto costuma ser baixo.

**4. Variáveis no Netlify** (*Project configuration > Environment variables*): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET` (texto aleatório longo), `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`. Depois faça um novo deploy (*Deploys > Trigger deploy*).

**5. Regras do Firestore**: publique de novo o arquivo `firestore.rules` (ele agora fecha a coleção `integrations`).

**6.** No app: *Ajustes > Conectar o Gmail > Verificar agora*.

### Limites e cuidados

- A leitura roda a cada 10 minutos (limite de 30 s por rodada do Netlify) e a primeira carga de 90 dias vai em lotes: cada rodada lê alguns e-mails e continua na seguinte.
- Até 300 e-mails por busca. E-mails sem texto nem PDF são ignorados. PDFs acima de 4 MB são ignorados.
- Os e-mails de pagamento ainda não fecham a conta sozinhos (Fase 3).
- O vencimento sugerido só vale dentro do mesmo mês da competência.
