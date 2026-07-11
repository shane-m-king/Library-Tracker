import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/useAuth.js'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import AppLayout from './components/AppLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import FriendsPage from './pages/FriendsPage.jsx'
import UserLibraryPage from './pages/UserLibraryPage.jsx'
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
      {/* Pathless layout route: every page renders inside AppLayout (the
          persistent top bar + an <Outlet /> for the matched page). */}
      <Route element={<AppLayout />}>
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
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <FriendsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:id/library"
          element={
            <ProtectedRoute>
              <UserLibraryPage />
            </ProtectedRoute>
          }
        />
        {/* Catch-all for any unknown client route. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
