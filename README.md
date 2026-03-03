# Event Planner Web

A minimal event planner MVP built with Next.js App Router, TypeScript, Tailwind CSS, Leaflet, and Prisma + PostgreSQL.

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- React
- Leaflet + react-leaflet
- Prisma ORM
- PostgreSQL

## Routes

- `/` map with existing events
- `/create` create a new event
- `/api/events` `GET`, `POST`
- `/api/events/:id` `DELETE`
- `/api/geocode` `GET`

## Prisma Setup

1. Install dependencies:

```bash
npm install
```

2. Set `DATABASE_URL` locally:

Create `.env` (or copy from `.env.example`) and set:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require"
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run local migrations:

```bash
npx prisma migrate dev
```

5. Start the app:

```bash
npm run dev
```

Optional: open Prisma Studio

```bash
npm run prisma:studio
```

## Notes

- `DATABASE_URL` is required for both local and production.
- In Vercel: Project Settings -> Environment Variables -> add `DATABASE_URL`.
- Production migration command:

```bash
npx prisma migrate deploy
```

- Prisma client generation is handled automatically during install/build via:

```bash
npm run postinstall
```
