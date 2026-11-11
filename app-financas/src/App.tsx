import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { PrivacyProvider } from './data/privacy'
import { AppHeader } from './components/AppHeader'
import { isFirebaseConfigured } from './firebase'
import About from './pages/About'
import BillForm from './pages/BillForm'
import Bills from './pages/Bills'
import Cadastros from './pages/Cadastros'
import Categories from './pages/Categories'
import DataTransfer from './pages/DataTransfer'
import Home from './pages/Home'
import Login from './pages/Login'
import Payments from './pages/Payments'
import PersonPage from './pages/PersonPage'
import ReceivableForm from './pages/ReceivableForm'
import Receivables from './pages/Receivables'
import Reports from './pages/Reports'
import SetupNeeded from './pages/SetupNeeded'
import ShortcutForm from './pages/ShortcutForm'
import Shortcuts from './pages/Shortcuts'
import Suppliers from './pages/Suppliers'

/** As telas do app, depois do login. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/contas" element={<Bills />} />
      <Route path="/contas/nova" element={<BillForm />} />
      <Route path="/contas/:id" element={<BillForm />} />
      <Route path="/receber" element={<Receivables />} />
      <Route path="/receber/nova" element={<ReceivableForm />} />
      <Route path="/receber/compra/:id/editar" element={<ReceivableForm />} />
      <Route path="/receber/pessoa/:id" element={<PersonPage />} />
      <Route path="/relatorios" element={<Reports />} />
      <Route path="/cadastros" element={<Cadastros />} />
      <Route path="/cadastros/categorias" element={<Categories />} />
      <Route path="/cadastros/pagamentos" element={<Payments />} />
      <Route path="/cadastros/atalhos" element={<Shortcuts />} />
      <Route path="/cadastros/atalhos/novo" element={<ShortcutForm />} />
      <Route path="/cadastros/atalhos/:id" element={<ShortcutForm />} />
      <Route path="/cadastros/fornecedores" element={<Suppliers />} />
      <Route path="/cadastros/planilhas" element={<DataTransfer />} />
      <Route path="/sobre" element={<About />} />
      {/* Endereços da época em que o menu se chamava Ajustes. */}
      <Route path="/ajustes" element={<Navigate to="/cadastros" replace />} />
      <Route path="/ajustes/planilhas" element={<Navigate to="/cadastros/planilhas" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <main className="center"><p className="muted">Carregando…</p></main>
  if (!user) return <Login />
  return (
    <>
      <AppHeader />
      <AppRoutes />
    </>
  )
}

export default function App() {
  if (!isFirebaseConfigured) return <SetupNeeded />
  return (
    <BrowserRouter>
      <AuthProvider>
        <PrivacyProvider>
          <Gate />
        </PrivacyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
