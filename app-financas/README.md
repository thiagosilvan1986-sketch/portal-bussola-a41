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
