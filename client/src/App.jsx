import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/useAuth.js'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

// The app's route table.
function App() {
  const { loading } = useAuth()

  // Hold rendering until the initial "who am I?" check resolves. Without this, a
  // logged-in user would see a flash of the logged-out UI on every page load while
  // getMe is still in flight - and ProtectedRoute would wrongly bounce them to
  // login. (We'll give this a proper splash screen later.)
  if (loading) {
    return <p style={{ padding: 24 }}>Checking your session…</p>
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Protected: only reachable when logged in; otherwise bounced to /login. */}
      <Route
        path="/library"
        element={
          <ProtectedRoute>
            <LibraryPage />
          </ProtectedRoute>
        }
      />
      {/* Catch-all for any unknown client route. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
