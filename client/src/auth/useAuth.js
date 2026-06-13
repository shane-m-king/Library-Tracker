import { useContext } from 'react';
import { AuthContext } from './AuthContext.js';

// The hook every component uses to read auth state and call the auth actions:
//   const { user, loading, login, logout } = useAuth();
// Throwing when there's no provider turns a silent bug (an undefined user crashing
// somewhere downstream) into an obvious error pointing right at the cause.
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
