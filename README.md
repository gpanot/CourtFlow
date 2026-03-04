# CourtFlow

Pickleball court management system — queue, rotation, sessions, and real-time TV display.

## Stack

- **Next.js 16** (App Router), **Express** (custom server), **Socket.io** (real-time)
- **PostgreSQL** + **Prisma**
- **Tailwind CSS**, **Zustand**

## Getting started

1. **Clone and install**

   ```bash
   git clone https://github.com/gpanot/CourtFlow.git && cd CourtFlow
   npm install
   ```

2. **Database**

   ```bash
   cp .env.example .env
   # Edit .env: set DATABASE_URL to your Postgres connection string
   npx prisma generate
   npx prisma db push
   npx prisma db seed
   ```

3. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Use **Player**, **Staff**, **TV**, or **Super Admin** from the landing page.

## Deployment

This app uses a **custom Express server** and **Socket.io** for real-time updates. That implies:

- **Vercel** does **not** support custom Node servers or long-lived WebSockets. Deploying this repo to Vercel will not run the real-time features (and may fail or run in a limited way).
- For a **working production deploy** (HTTPS, WebSockets, DB), use a platform that runs a Node server, e.g. **Railway** or **Render**.

### Deploy on Railway (recommended for full app)

1. [railway.app](https://railway.app) → New project → **Deploy from GitHub** → select `CourtFlow`.
2. Add **PostgreSQL** (New → Database → PostgreSQL).
3. In the CourtFlow service: **Variables** → add `DATABASE_URL` from the Postgres service (e.g. `DATABASE_URL` → Connect → copy the variable).
4. Add `JWT_SECRET` (and any other vars from `.env.example`).
5. Railway will run `npm run build` and `npm start` (custom server + Socket.io). Open the generated URL (HTTPS). Run migrations/seed once if needed (e.g. via Railway shell: `npx prisma db push` and `npx prisma db seed`).

### Deploy on Vercel (frontend / preview only)

You can import the repo on [vercel.com](https://vercel.com) for previews or a static/SSR frontend, but:

- The **custom server and Socket.io will not run** on Vercel.
- Real-time (queue, courts, TV) and any API that depends on the shared Socket.io server will not work.

For a full working app with real-time and DB, use **Railway** (or Render / Fly.io / a VPS).

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | Dev server (Express+Next)   |
| `npm run build`| Build Next + server        |
| `npm run start`| Production server          |
| `npm run db:seed` | Seed database           |

## Repo

**GitHub:** [github.com/gpanot/CourtFlow](https://github.com/gpanot/CourtFlow)
