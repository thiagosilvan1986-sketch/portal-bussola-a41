const VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

export default function SetupNeeded() {
  return (
    <main className="center">
      <h1>Falta configurar o Firebase</h1>
      <p className="muted">
        Defina estas variáveis de ambiente (no arquivo .env ao rodar localmente, ou em Site configuration &gt; Environment variables no
        Netlify) e publique de novo:
      </p>
      <ul className="code-list">
        {VARS.map((v) => (
          <li key={v}>
            <code>{v}</code>
          </li>
        ))}
      </ul>
      <p className="muted">Os valores estão no console do Firebase, em Configurações do projeto &gt; Seus apps &gt; App da Web.</p>
    </main>
  )
}
