# Library App

A personal library tracker. Catalog the books you own, keep a wishlist, record
where and when you acquired each book (plus ratings and notes), and track books
you've lent to friends or borrowed from others.

Book metadata is sourced from the Google Books API and cached locally.

## Stack

- **Frontend:** React (Vite)
- **Backend:** Express
- **Database:** PostgreSQL (accessed with raw SQL via `pg`)
- **Auth:** JWT

## Structure

```
Library_App/
├── client/   # React + Vite frontend
└── server/   # Express backend + PostgreSQL
```

## Development

From the project root, install the root tooling once:

```
npm install
```

Then run **both** the backend and frontend together:

```
npm run dev
```

- Backend (Express): http://localhost:4000
- Frontend (Vite):   http://localhost:5173

You can also run either side on its own with `npm run dev:server` or
`npm run dev:client`. Each side keeps its own dependencies in `server/` and
`client/`; install those with `npm install` inside each folder.
