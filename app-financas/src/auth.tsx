import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth } from './firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /** Aviso de sucesso (ex.: e-mail de redefinição enviado). */
  info: string | null
  /** Entrar com Google. */
  signIn: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearMessages: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function authErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null
    case 'auth/unauthorized-domain':
      return 'Este endereço não está autorizado no Firebase. Adicione o domínio do site em Authentication > Configurações > Domínios autorizados.'
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela de login. Permita pop-ups e tente de novo.'
    case 'auth/operation-not-allowed':
      return 'O login por e-mail e senha ainda não foi ativado no Firebase (Authentication > Método de login > E-mail/senha).'
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail. Entre com a senha, use "Esqueci minha senha" ou entre com o Google.'
    case 'auth/invalid-email':
      return 'Digite um e-mail válido.'
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos. Se você criou a conta com o Google, use o botão "Entrar com Google".'
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet. Verifique e tente de novo.'
    default:
      return 'Não foi possível entrar. Tente novamente.'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthState>(() => {
    // Roda uma ação de autenticação limpando os avisos antes e traduzindo o erro depois.
    const run = async (action: (a: NonNullable<typeof auth>) => Promise<void>) => {
      if (!auth) return
      setError(null)
      setInfo(null)
      try {
        await action(auth)
      } catch (e) {
        setError(authErrorMessage(e))
      }
    }
    return {
      user,
      loading,
      error,
      info,
      signIn: () => run(async (a) => void (await signInWithPopup(a, new GoogleAuthProvider()))),
      signInWithEmail: (email, password) =>
        run(async (a) => void (await signInWithEmailAndPassword(a, email.trim(), password))),
      signUpWithEmail: (email, password) =>
        run(async (a) => void (await createUserWithEmailAndPassword(a, email.trim(), password))),
      resetPassword: (email) =>
        run(async (a) => {
          await sendPasswordResetEmail(a, email.trim())
          setInfo('Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Veja também a caixa de spam.')
        }),
      clearMessages: () => {
        setError(null)
        setInfo(null)
      },
      signOut: async () => {
        if (auth) await firebaseSignOut(auth)
      },
    }
  }, [user, loading, error, info])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
