# BUSINESSLIFE

A Lagos-inspired Nigerian business simulation built with React, Three.js, Express, and SQLite. Players develop a business in a 3D city, administrators manage the simulation, and lecturers organise classroom activities and assess students.

> **Deployment model:** Vercel serves the frontend and a same-origin API proxy. The Express backend, SQLite database, and continuous simulation clock run on a separate persistent host. This repository includes a Docker image definition and a Render Blueprint for that backend.
>
> **Email status:** Resend is not integrated yet. Seeded demo accounts are already verified and can sign in without email delivery. New production users cannot complete email verification or password recovery until an email provider is implemented.

## Contents

- [Overview](#overview)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Demo accounts](#demo-accounts)
- [Environment variables](#environment-variables)
- [Available commands](#available-commands)
- [Project structure](#project-structure)
- [Application routes and API](#application-routes-and-api)
- [Database and simulation](#database-and-simulation)
- [Deploying to production](#deploying-to-production)
- [Testing and validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)
- [Security and operational limitations](#security-and-operational-limitations)
- [Contributing](#contributing)
- [License](#license)

## Overview

BUSINESSLIFE brings together three role-based experiences:

| Role | Experience |
| --- | --- |
| **Player** | Create a business profile, explore a 3D city, interact with NPCs and buildings, complete missions, progress through levels, and manage company finances. |
| **Administrator** | Manage players and staff access, tune content and world settings, control the simulation clock and economy, and inspect analytics and audit logs. |
| **Lecturer** | Manage classes, students, assignments, scenarios, grading, performance views, and reports. |

The backend enforces authentication and role access. Client-side route guards provide navigation, but are not the security boundary. Financial activity and progression are validated server-side rather than accepted as arbitrary browser state.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Zustand |
| 3D world | Three.js, React Three Fiber, Drei |
| API | Express 5, Zod |
| Authentication | JWT sessions, scrypt password hashing |
| Persistence | SQLite through Node's built-in `node:sqlite` driver |
| Tests | Node test runner with `tsx` |
| Deployment | Vercel frontend/proxy; Docker backend with persistent storage |

## Requirements

- **Node.js 22.x** and its bundled npm. Use a current Node 22 release; the project uses the built-in SQLite driver.
- Git to clone the repository.
- A modern browser with WebGL support for the 3D player experience.
- Docker only if you want to run the container deployment locally.
- For production: a Vercel project and a persistent backend host. The supplied Render configuration uses a paid service and disk; review current pricing before provisioning.

## Local setup

### 1. Clone and install

```sh
git clone https://github.com/Akon-007/thebusinesslife.git
cd thebusinesslife
npm ci
```

If you already have a checkout, run `npm ci` from its root. To use the deployment files, select the branch containing them when configuring your hosting providers.

### 2. Configure the API environment (optional for local defaults)

Local development works with the built-in defaults. For custom configuration, copy the example file:

```sh
cp .env.example .env
```

Edit `.env` before using it. The API scripts do **not** automatically load `.env`; either export variables in your shell or explicitly use Node's environment-file support:

```sh
node --env-file=.env --import tsx server/seed.ts
node --env-file=.env --import tsx --watch server/index.ts
```

The second command starts the API in watch mode. If you use these commands, do not also start another API instance below. The production hosting platform injects variables directly and does not need a committed environment file.

### 3. Seed the local database and start the API

Using the default configuration:

```sh
npm run seed
npm run dev:api
```

The API listens on port **4000**. Check it with:

```sh
curl http://localhost:4000/api/health
```

Expected response:

```json
{"ok":true,"mode":"development"}
```

### 4. Start the frontend

In a second terminal, from the repository root:

```sh
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Vite forwards `/api/...` requests to the local API on port 4000. If the frontend port is occupied, Vite may select another port.

Sign in at `/login`. The demo player first completes business onboarding; staff accounts open their respective portals.

## Demo accounts

Run `npm run seed` to register these accounts in the **local** database:

| Role | Email | Development password |
| --- | --- | --- |
| Player | `demo@businesslife.test` | `DemoBusiness!2026` |
| Administrator | `admin@businesslife.test` | `AdminPass123` |
| Lecturer | `lecturer@businesslife.test` | `LecturerPass123` |

All three are created with `email_verified=1`, so they do not require Resend or an email verification code. These `.test` addresses are demo identifiers, not working delivery addresses.

### Seeding behaviour

- Passwords are stored as salted scrypt hashes, not plaintext.
- Seeding is transactional and safe to repeat for matching existing accounts.
- Existing passwords are never reset, and existing roles or verification flags are never changed.
- If an existing account has the wrong role or is unverified, seeding fails and rolls back; resolve the conflict manually rather than using seeding to elevate an account.
- The player account starts with ordinary business onboarding. Seeding does not create a company, classroom, or artificial game progress.
- Passwords are not printed in seed logs.
- Running a seed locally does **not** populate a remote production database.

### Production seeding

Production requires explicit opt-in through `SEED_DEMO_ACCOUNTS=true` and password values in `DEMO_PASSWORD`, `ADMIN_PASSWORD`, and `LECTURER_PASSWORD`. There are no production password defaults.

With that flag enabled, backend startup seeds the database selected by `DB_PATH` before accepting requests. You can also run `npm run seed` on the backend host with the same production environment. After confirming access, disable the flag and remove the password variables; the database accounts remain.

> These credentials are publicly known demo credentials. Use them only for a controlled demonstration. Replace them with private credentials, or remove the accounts, before a public launch. Disabling the seed flag alone does not disable existing accounts.

## Environment variables

See [`.env.example`](.env.example) for a starting template. Environment files and local SQLite data are ignored by Git. Never put secrets in a `VITE_` variable: those variables can be bundled into browser code.

| Variable | Where | Default / purpose |
| --- | --- | --- |
| `NODE_ENV` | Backend | Defaults to `development`. Set to `production` on the deployed API. |
| `PORT` | Backend | Defaults to `4000`. The API binds to `0.0.0.0`. Hosts may supply their own port. |
| `DB_PATH` | Backend | Defaults to `server/data/businesslife.db`, resolved from the working directory. Production must point to persistent storage, e.g. `/var/data/businesslife.db`. |
| `JWT_SECRET` | Backend | Development has a fallback. Production requires a non-empty secret of at least 32 characters. Keep it stable across restarts. |
| `CORS_ORIGINS` | Backend | Comma-separated permitted browser origins, including scheme and port where applicable. Unset reflects any origin; explicitly configure production origins. |
| `REQUIRE_EMAIL_VERIFICATION` | Backend | Defaults to `false` outside production and `true` in production. Set explicitly to `true` to require verification. Do not disable globally just to access demo accounts. |
| `SEED_DEMO_ACCOUNTS` | Backend | Exact value `true` enables startup seeding and permits known demo accounts in production. Disable after initial provisioning. |
| `DEMO_PASSWORD` | Backend seed | Player seed password. Required for a new production player seed account; local default shown above. |
| `ADMIN_PASSWORD` | Backend seed | Admin seed password. Required for a new production admin seed account; local default shown above. |
| `LECTURER_PASSWORD` | Backend seed | Lecturer seed password. Required for a new production lecturer seed account; local default shown above. |
| `API_ORIGIN` | Vercel function only | HTTPS origin of the persistent backend, e.g. `https://your-api.onrender.com`. No path, query, credentials, or fragment. Must not point to the frontend itself. |

Generate a suitable JWT secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Store the result in your backend host's secret/environment settings, not in source control.

## Available commands

Run commands from the repository root after `npm ci`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend development server. |
| `npm run dev:api` | Start the API in watch mode. |
| `npm run api` | Start the API without watch mode. |
| `npm start` | Start the API and simulation clock; equivalent API entry point for hosting. |
| `npm run seed` | Register verified demo accounts in the configured database. |
| `npm run build` | Build the frontend into `dist/`. Does not start or build a standalone backend bundle. |
| `npm run preview` | Preview the frontend build locally. Does not start the API or emulate Vercel functions; provide API routing separately for end-to-end use. |
| `npm run typecheck` | Type-check frontend, backend, and Vercel API code. |
| `npm test` | Run server tests serially using `.env.test`. |

The API runs TypeScript through `tsx` at runtime. A custom backend installation must retain that tool; do not omit all development dependencies without providing an alternative runtime/build pipeline. The supplied Dockerfile installs the required packages.

## Project structure

```text
.
├── api/
│   └── proxy.ts              # Vercel same-origin API proxy
├── server/
│   ├── app.ts               # Express app and route mounting
│   ├── index.ts             # API listener, startup seed, clock lifecycle
│   ├── bootstrap.ts         # Verified demo-account provisioning
│   ├── seed.ts              # Manual seed entry point
│   ├── config.ts            # Environment-based server configuration
│   ├── db.ts                # SQLite schema, migrations, query helpers
│   ├── clock.ts             # Continuous simulation clock
│   ├── finance.ts           # Financial domain logic
│   ├── progression.ts       # Server-side progression logic
│   ├── routes/              # Auth, player, admin, lecturer, world endpoints
│   └── tests/               # API/domain tests and isolated DB harness
├── src/
│   ├── Root.tsx             # Public and role-protected browser routes
│   ├── api/                 # Browser API clients
│   ├── data/                # World, NPC, mission, and progression catalogues
│   ├── game/                # 3D scene, movement, camera, and collision
│   ├── state/               # Zustand stores and server synchronisation
│   ├── systems/             # Business, NPC, mission, progression systems
│   ├── ui/                  # Player UI and front/admin/lecturer screens
│   └── styles/              # Shared and portal styles
├── .env.example             # Configuration template; not loaded automatically
├── .env.test                # Non-production test configuration
├── Dockerfile               # Persistent API container definition
├── render.yaml              # Render API service and disk configuration
├── vercel.json              # Frontend build, SPA routing, function settings
└── vite.config.ts           # Frontend configuration and local API proxy
```

## Application routes and API

### Browser routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/register` | Player registration |
| `/verify` | Email verification |
| `/login` | Sign-in for all roles |
| `/forgot-password` | Password recovery screens |
| `/onboarding/business` | Player business profile creation |
| `/play` | Player experience; requires a business profile |
| `/admin` | Administrator portal |
| `/lecturer` | Lecturer portal |

### API surfaces

| Prefix | Access / purpose |
| --- | --- |
| `/api/health` | Public liveness and runtime mode |
| `/api/auth` | Registration, login, verification, session/account flows, recovery |
| `/api/world` | Public read-only world configuration |
| `/api/player` | Authenticated player features |
| `/api/player/company` | Player company and financial operations |
| `/api/admin` | Administrator features |
| `/api/lecturer` | Lecturer features, with class ownership checks |

Authenticated calls use `Authorization: Bearer <token>`. The browser client stores the session token in local storage. See [`server/routes/`](server/routes/) for endpoint definitions and request validation; this table is a surface map, not a complete API specification.

## Database and simulation

- SQLite opens on API startup. `server/db.ts` applies the schema and compatibility column additions idempotently.
- Default application data lives at `server/data/businesslife.db`. Database files and SQLite journals are not committed to Git.
- SQLite uses write-ahead logging and foreign-key enforcement. Transactions protect related changes, and the audit trail has append-only database triggers.
- The API entry point starts a continuous simulation tick loop and stops it during graceful shutdown.
- Run **one backend process/replica per database**. The clock and in-memory rate limiter are not designed for multiple independent replicas.
- Schema initialisation is not a backup strategy. Back up production data before changes and test restoration.

### Backups

Use a SQLite-consistent backup method or a disk snapshot while the service is stopped. Do not copy only the main `.db` file from a live WAL database: recent writes can reside in the `-wal` file. Keep backups outside the application repository and validate recovery into a separate environment.

## Deploying to production

### Architecture

```text
Browser
  │
  ▼
Vercel
  ├── React/Vite static frontend
  └── /api/* → server-side proxy (API_ORIGIN)
                         │ HTTPS
                         ▼
                 Persistent Node backend
                   ├── Express API
                   ├── Simulation clock
                   └── SQLite on mounted disk
```

Vercel function filesystems are not a durable shared database. Putting SQLite in a function directory or `/tmp` would lose or split accounts and game state between invocations. A continuous clock also cannot rely on a request-scoped function staying alive. **This setup is not an all-in-one Vercel backend deployment.**

### Step 1: Deploy the backend on Render

1. Create a Render Blueprint from this repository and choose the branch containing these files.
2. Use [`render.yaml`](render.yaml). It defines a Docker web service, `/api/health` health check, and a 1 GB persistent disk mounted at `/var/data`. It uses a paid plan; confirm costs before creating resources.
3. Supply the prompted environment values:
   - `CORS_ORIGINS`: your frontend origin, such as `https://your-project.vercel.app`.
   - `DEMO_PASSWORD`: the requested player password.
   - `ADMIN_PASSWORD`: the requested administrator password.
   - `LECTURER_PASSWORD`: the requested lecturer password.
4. The Blueprint sets `NODE_ENV=production`, `DB_PATH=/var/data/businesslife.db`, and `SEED_DEMO_ACCOUNTS=true`, and generates `JWT_SECRET`.
5. Deploy. Startup provisions the three verified accounts in the mounted production database. Matching existing accounts are preserved.
6. Check the service:

   ```sh
   curl https://your-api.onrender.com/api/health
   ```

   Expect `{"ok":true,"mode":"production"}`. Health confirms the API responds; it does not validate every user flow or email delivery.

7. Keep the backend URL for the Vercel setup. If your frontend URL changes, update `CORS_ORIGINS` accordingly.

Keep `JWT_SECRET` and the disk stable across deployments. Do not enable multiple replicas or start a second clock process against the same data.

### Step 2: Deploy the frontend on Vercel

1. Import the Git repository and select the branch containing these changes.
2. Confirm these project settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | Repository root |
   | Framework | Vite |
   | Node.js | 22.x |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |

3. Add **server-side** environment variable `API_ORIGIN=https://your-api.onrender.com` in each relevant Vercel environment. Do not use a `VITE_` prefix. Do not append `/api` or point it at the frontend URL.
4. Deploy. `vercel.json` configures SPA routing and the API function. The browser continues calling relative `/api/...` URLs, and the function forwards them over HTTPS to the persistent API.
5. Open `https://your-project.vercel.app/api/health`, then verify the login and role flows below.
6. Redeploy Vercel after changing its environment variables.

The proxy forwards authentication headers, limits request bodies to 100 KiB, uses a 25-second upstream timeout, and marks API responses as non-cacheable.

### Step 3: Verify and secure the deployment

- [ ] Backend and Vercel `/api/health` URLs return production mode.
- [ ] Player login works and opens onboarding for a fresh profile.
- [ ] Admin login opens `/admin`.
- [ ] Lecturer login opens `/lecturer`.
- [ ] A player cannot access staff-only API routes.
- [ ] Refreshing a nested frontend route works instead of returning a hosting 404.
- [ ] Accounts and created data survive a backend restart/redeploy.
- [ ] `DB_PATH` points to the mounted disk, not an ephemeral application folder.
- [ ] After confirming the accounts, set `SEED_DEMO_ACCOUNTS=false` and remove the three seed password variables.
- [ ] Rotate or remove known demo credentials before public access; disabling seeding is not password rotation.
- [ ] Configure backups and test a restore.
- [ ] Implement and test email delivery before opening verified signup or recovery to real users.

### Alternative: run the backend with Docker

Build the image and create a named persistent volume:

```sh
docker build -t businesslife-api .
docker volume create businesslife-data
```

Create a private `.env.production.local` containing at least:

```dotenv
NODE_ENV=production
JWT_SECRET=replace-with-a-private-random-secret-at-least-32-characters-long
CORS_ORIGINS=https://your-project.vercel.app
SEED_DEMO_ACCOUNTS=true
DEMO_PASSWORD=replace-with-the-desired-player-password
ADMIN_PASSWORD=replace-with-the-desired-admin-password
LECTURER_PASSWORD=replace-with-the-desired-lecturer-password
```

Run one container:

```sh
docker run --name businesslife-api \
  --restart unless-stopped \
  --env-file .env.production.local \
  -p 4000:4000 \
  -v businesslife-data:/var/data \
  businesslife-api
```

The image defaults `DB_PATH` to `/var/data/businesslife.db`. On a public host, place the API behind HTTPS and configure Vercel's `API_ORIGIN` to that HTTPS origin. Port publishing alone does not configure TLS. Remove bootstrap secrets and disable seeding after provisioning, then recreate the container with the updated environment while retaining the volume. Never remove the data volume as part of a normal redeploy.

### Preview environments

Vercel previews use whatever `API_ORIGIN` is configured for the Preview environment. If it points to production, preview activity changes production data. Use a separate persistent backend/database for isolated previews. Add any required trusted browser origins to `CORS_ORIGINS`; do not rely on previews being automatically trusted.

## Testing and validation

```sh
npm run typecheck
npm run build
npm test
```

The suite covers demo-account seeding/login, financial operations and idempotency, progression evidence, and simulation clock behaviour.

`npm test` loads `.env.test` and runs test files serially. The test harness deletes and recreates its configured SQLite file for isolation. **Never point the test configuration at a database you want to retain.** The checked-in test configuration uses `server/data/test-businesslife.db`, not the application database.

Review dependency advisories separately:

```sh
npm audit
npm audit --omit=dev
```

Do not apply `npm audit fix --force` blindly: it may introduce breaking framework upgrades. A successful build does not mean there are no dependency advisories or that deployed integration flows have been verified.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node:sqlite` cannot be imported | Check `node --version`; use a current Node 22.x release. |
| Node prints an experimental SQLite warning | The built-in driver can emit this warning on Node 22; inspect actual errors separately. |
| Production refuses to start with a JWT error | Set a private `JWT_SECRET` of at least 32 characters on the backend. |
| Editing `.env` has no effect | API scripts do not load it automatically. Export variables or use `node --env-file=.env --import tsx ...`; restart the API. |
| Local frontend cannot reach the API | Start the API on port 4000. If changing ports, also update Vite's proxy target in `vite.config.ts`. |
| Vercel returns `API_ORIGIN is not configured` | Set it in the correct Vercel environment and redeploy. |
| Vercel returns 502 for API requests | Check backend health/logs and the HTTPS `API_ORIGIN`; it must have no path and must not point back to Vercel. |
| Demo login fails after deployment | Local seeding does not seed production. Check backend bootstrap flags/password variables and the persistent database path. Existing passwords are not overwritten on rerun. |
| Seed fails on an existing account | Resolve the role/verification conflict explicitly; the seed intentionally refuses to elevate or verify an existing conflicting record. |
| Data disappears after redeploy | Verify that `DB_PATH` is on the mounted persistent disk and that the same disk is attached. |
| New users never receive verification/reset mail | Delivery is not integrated. Seeded accounts can log in; real email flows require provider implementation. |
| Several users encounter HTTP 429 together | The in-memory limiter may group requests behind the Vercel proxy. See the operational limitations below. |
| A nested browser route returns a hosting 404 | Confirm `vercel.json` is included and the project root/output settings are correct. |
| The 3D view does not render | Check WebGL support, browser console errors, and hardware acceleration. |
| Frontend production preview loads but API calls fail | `npm run preview` does not run Vercel functions or the backend. Use the documented development pair or configure a local reverse proxy. |

## Security and operational limitations

- **Demo access is not production access control.** Known staff passwords must be replaced or the accounts removed before public launch.
- **Email delivery is unfinished.** Development prints issued codes to server logs; production does not deliver them. Adding a Resend API key alone will not implement the missing delivery logic.
- **Keep secrets server-side.** Do not commit production environment files, JWT secrets, database files, or backups. Do not store secrets in client-exposed Vite variables.
- **JWT secret changes invalidate existing sessions.** Preserve the secret across ordinary deployments; rotate deliberately if compromised.
- **The session token is in browser local storage.** Protect against XSS and review content/security policy requirements before launch.
- **CORS is not authentication.** Configure explicit production origins, but continue enforcing authentication, roles, and ownership on the backend.
- **Rate limiting is process-local.** Proxy trust is not enabled; requests through Vercel may share a limiter key based on the proxy connection. Establish trusted proxy boundaries and a suitable shared/client-aware limiter before high-traffic use. Do not blindly trust user-supplied forwarded headers.
- **Single-backend deployment only.** Multi-replica scheduling, distributed clock ownership, and shared rate-limit state are not implemented.
- **Production still needs an operational review.** Monitor API errors, disk usage, dependency advisories, backups, and recovery. Hosting configuration is not a substitute for load testing or an end-to-end security review.

## Contributing

1. Install dependencies with `npm ci` and use Node 22.x.
2. Make focused changes consistent with the existing TypeScript structure.
3. Keep authoritative account, financial, and progression validation on the server.
4. For schema changes, account for existing databases as well as fresh ones.
5. Add or update tests for changed backend behaviour.
6. Run type checking, the frontend build, and the test suite before submitting changes.
7. Update this README or `.env.example` when configuration or deployment behaviour changes.

Never include personal data, production secrets, generated build output, or database snapshots in a contribution.

## License

No license file is currently included in this repository. Do not assume permission to redistribute or reuse the project under an open-source license; contact the repository owner for licensing terms.

### Diagnosing deployed API routing

`vercel.json` explicitly rewrites `/api/:path*` to `api/proxy.ts` before the SPA fallback. A generic non-JSON 404 on login means the request may not have reached Express. After deploying routing changes, check `/api/health` on the Vercel domain: responses handled by the proxy include `X-Businesslife-Proxy: 1`. If that header is missing, verify the deployment branch, repository root, and inclusion of `vercel.json` and `api/proxy.ts`. If the proxy returns 503, configure `API_ORIGIN` and redeploy. A 502 with an unexpected backend response means the configured host is not serving the expected JSON API. Proxy failures log the method, API path, and upstream status without credentials or request bodies.
