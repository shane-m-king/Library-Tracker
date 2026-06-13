import { Link } from 'react-router-dom'

// Catch-all for unknown client routes (the UI counterpart to the backend's JSON
// 404). We'll give it a proper design during the polish step.
export default function NotFoundPage() {
  return (
    <main>
      <h1>404</h1>
      <p>That page doesn&rsquo;t exist.</p>
      <Link to="/">Back home</Link>
    </main>
  )
}
