import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.jsx'
import './index.css'
import App from './App.jsx'

// Provider order, outermost first:
//   BrowserRouter - routing for the whole tree
//   AuthProvider  - current user + auth actions, available to every route
//   App           - the route table
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
