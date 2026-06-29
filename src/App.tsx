import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ConfigPage from './pages/ConfigPage'
import RulesPage from './pages/RulesPage'
import LessonsPage from './pages/LessonsPage'
import CompareProjectsPage from './pages/CompareProjectsPage'
import AdminPage from './pages/AdminPage'
import TenderBrowserPage from './pages/TenderBrowserPage'
import WorkspacePage from './pages/WorkspacePage'
import { isAdminPasswordConfigured } from './lib/adminAuth'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
        <Route path="/configuratie" element={<ConfigPage />} />
        <Route path="/schrijfregels" element={<RulesPage />} />
        <Route path="/schrijfstijl" element={<Navigate to="/schrijfregels" replace />} />
        <Route path="/leerpunten" element={<LessonsPage />} />
        <Route path="/vergelijken" element={<CompareProjectsPage />} />
        <Route path="/aanbestedingen" element={<TenderBrowserPage />} />
        <Route
          path="/admin"
          element={
            isAdminPasswordConfigured() ? (
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
