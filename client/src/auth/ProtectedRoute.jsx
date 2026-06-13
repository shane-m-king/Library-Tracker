import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';

// Gate for routes that require a logged-in user. Wrap a page with it in the route
// table:
//   <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
//
// By the time this renders, App has already withheld rendering until the initial
// session check (getMe) resolved - so `user` here is settled: either a real user or
// definitively null. That's why there's no "loading" branch to consider.
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Not logged in: send them to login, stashing where they were headed so the
    // login page can return them there afterward. `replace` keeps this bounce out
    // of history - pressing Back shouldn't land on a page they were blocked from.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
