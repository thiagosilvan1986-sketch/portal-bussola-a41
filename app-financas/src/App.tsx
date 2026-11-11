import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { AppHeader } from './components/AppHeader'
import { BottomNav } from './components/BottomNav'
import { isFirebaseConfigured } from './firebase'
import BillForm from './pages/BillForm'
import Bills from './pages/Bills'
import Home from './pages/Home'
import Login from './pages/Login'
import PersonPage from './pages/PersonPage'
import ReceivableForm from './pages/ReceivableForm'
import Receivables from './pages/Receivables'
import SetupNeeded from './pages/SetupNeeded'
import Settings from './pages/Settings'

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <main className="center"><p className="muted">Carregando…</p></main>
  if (!user) return <Login />
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/contas" element={<Bills />} />
        <Route path="/contas/nova" element={<BillForm />} />
        <Route path="/contas/:id" element={<BillForm />} />
        <Route path="/receber" element={<Receivables />} />
        <Route path="/receber/nova" element={<ReceivableForm />} />
        <Route path="/receber/pessoa/:id" element={<PersonPage />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}

export default function App() {
  if (!isFirebaseConfigured) return <SetupNeeded />
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
