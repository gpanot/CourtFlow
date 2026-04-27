# CourtFlow PWA deployments

The staff PWA is a **single** Next.js app on Vercel. One deployment serves every client skin (CourtFlow, CourtPay, etc.): which UI the staff member gets is chosen **at runtime** from their venue assignment `appAccess` in the database (and the optional “Which app?” picker when they have both), then stored in the browser as `courtflow-selected-client` (see `src/config/clients.ts`).

| Client config id | When it is used |
| --- | --- |
| `courtflow_default` | Venue `appAccess` includes `courtflow` (default for existing staff). |
| `courtpay_client2` | Venue `appAccess` includes `courtpay`. |

**Environment variable (local development only)**

- `NEXT_PUBLIC_CLIENT_ID` — optional override to force a client config when you are not using staff `appAccess` / storage (e.g. local UI testing). In production this is **not** required; runtime selection takes priority (`courtflow-selected-client` → then env → `courtflow_default`).

**Backend**

- Railway (shared) for API and services.

**React Native**

- Mobile apps are separate deployments and are not driven by this PWA client selection.
