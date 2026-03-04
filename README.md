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

## Deployment (Railway)

Deploy with **Railway** (custom server + Socket.io + Postgres supported).

1. [railway.app](https://railway.app) → New project → **Deploy from GitHub** → select `CourtFlow`.
2. Add **PostgreSQL** (New → Database → PostgreSQL).
3. In the CourtFlow service: **Variables** → add `DATABASE_URL` from the Postgres service (Connect → copy variable). Add `JWT_SECRET`.
4. Deploy. Open the generated URL (HTTPS). Run migrations once (Railway shell or one-off): `npx prisma db push` and `npx prisma db seed`.

The repo includes `railway.toml` with `npm run build` and `npm run start`.

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | Dev server (Express+Next)   |
| `npm run build`| Build Next + server        |
| `npm run start`| Production server          |
| `npm run db:seed` | Seed database           |

## Repo

**GitHub:** [github.com/gpanot/CourtFlow](https://github.com/gpanot/CourtFlow)
