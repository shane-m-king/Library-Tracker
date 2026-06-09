import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

// --- Middleware ---
app.use(cors());            // allow the Vite dev server to call this API
app.use(express.json());    // parse JSON request bodies into req.body

// --- Routes ---
// A simple health check: proves the server is up and responding.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
