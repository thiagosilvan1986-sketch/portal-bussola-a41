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
- `src/data`: acesso ao Firestore e hooks.
- `src/pages`, `src/components`: telas.

## Limitações conhecidas

- No iPhone, o login com Google por pop-up pode falhar quando o app está instalado na tela inicial. Entrando pelo Safari funciona.
- Anexos (boleto em PDF, comprovante) ainda não existem: o Cloud Storage do Firebase também pede o plano Blaze. Por enquanto, guarde a linha digitável no campo de texto.
- Lembretes por notificação dependem de Cloud Functions (plano Blaze do Firebase).

## Publicação

- Site: https://appfinancasbr.netlify.app (Netlify, com Base directory `app-financas`; cada push na `main` publica sozinho).
- Firebase: projeto `financas-e0917`. As variáveis `VITE_FIREBASE_*` ficam no Netlify (Project configuration > Environment variables).
- A chave `apiKey` do app Web não é segredo (só identifica o projeto; a proteção está nas regras do Firestore). Por isso o Netlify é avisado para não tratá-la como segredo na leitura do build (`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`).
