import { createContext } from 'react';

// The context object lives in its own module so the provider (which fills it in)
// and the useAuth hook (which reads it) can each import it independently. Keeping
// this file to a single, non-component export also keeps Vite's Fast Refresh happy:
// its rule wants a module to export *either* React components *or* other things,
// not a mix. So context / hook / provider are split across three small files.
//
// The default value is null so useAuth can detect "used with no provider above it"
// and throw, instead of silently handing back undefined.
export const AuthContext = createContext(null);
