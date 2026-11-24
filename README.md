# Tracking website

```
Browser (web + mobile)
        |
   Nginx load balancer            nginx/nginx.conf
        |
  +-----+---------+---------+
  |               |         |
backend-1    backend-2   backend-3      backend/  (Node.js + Fastify)
  |               |         |
  +-- Redis cache (shared) -+
  |               |         |
  +-- connection pool per server --+    backend/src/db/mongo.ts
                  |
            MongoDB Atlas
```

| Folder      | What it is                                                  |
| ----------- | ----------------------------------------------------------- |
| `frontend/` | Next.js + React + Tailwind CSS, responsive for web and mobile |
| `backend/`  | Fastify API in TypeScript, stateless so it can run as many copies |
| `nginx/`    | Load balancer configuration                                 |

## Run locally (no Docker needed)

One backend server, no cache. Good for day-to-day development.

```powershell
# 1. Backend
cd backend
copy .env.example .env      # then put your Atlas connection string in MONGODB_URI
                            # and a random value of 32+ characters in JWT_SECRET
npm install
npm run create-admin -- you@example.com "a-strong-password"
npm run dev                 # http://localhost:4000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Customers track at `/`. Staff create shipments and post tracking updates at
`/admin`, signed in with the admin created above. An open tracking result
re-checks itself every 15 seconds, so updates appear without a page reload.

## Run the full architecture (needs Docker Desktop)

Load balancer, 3 backend servers, Redis and the frontend together:

```powershell
docker compose up --build   # http://localhost:8080
```

Call `http://localhost:8080/health` a few times: the `instance` field changes as
the load balancer rotates between `backend-1`, `backend-2` and `backend-3`.

## API

| Method | Path                            | Description                     |
| ------ | ------------------------------- | ------------------------------- |
| GET    | `/api/v1/track/:trackingNumber` | Look up a shipment              |
| POST   | `/api/v1/auth/login`            | Admin sign in, returns a token  |
| POST   | `/api/v1/shipments`             | Create a shipment (admin)       |
| POST   | `/api/v1/shipments/:trackingNumber/events` | Add a tracking update (admin) |
| GET    | `/health`                       | Server is running               |
| GET    | `/ready`                        | Server can reach the database   |

## Deploy: Vercel + Render + Atlas, all in one region

Pick one region and use it everywhere. The files here default to Frankfurt.
Render cannot change a service's region later, so choose before you create it.

0. **Commit** (first time only, from the project folder):
   ```powershell
   git config user.name "Your Name"
   git config user.email "the-email-on-your-github-account"
   git add -A
   git commit -m "Westbridge tracking website"
   ```
   `.env` files are excluded by `.gitignore`, so the database password and the
   Resend key never go to GitHub.
1. **Atlas**: under Network Access, add `0.0.0.0/0` (Render's free plan has no
   fixed IP address; the strong database password protects the cluster).
   If the cluster isn't in Frankfurt, change `region:` in `render.yaml` (both
   places) to the Render region closest to it before step 2.
2. **GitHub**: create an empty **private** repository (no README), then:
   ```powershell
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. **Render**: New -> Blueprint -> select the repository. `render.yaml` creates the
   backend and its Redis cache and asks for:
   - `MONGODB_URI`: the same value as in `backend/.env`
   - `RESEND_API_KEY`: from resend.com
   - `SITE_URL`: the website's address, e.g. `https://westbridgeinternationallogistics.com`
     (used for the link and logo in emails; set it again if the address changes)
4. **Vercel**: Add New -> Project -> import the repository, set Root Directory to
   `frontend`, and add the environment variable `API_PROXY_TARGET` = your Render
   URL (e.g. `https://tracking-backend.onrender.com`). Then in Settings -> Domains
   add `westbridgeinternationallogistics.com` and follow the DNS instructions.
5. The admin account is already in the database (it's the same Atlas cluster), so
   the dashboard works at `https://<your site>/admin` straight away.
6. **Check it live**:
   - `https://<your-render-url>/health` shows `"status":"ok"`.
   - The home page loads at your domain, and `/admin` signs in.
   - Book a test shipment with **your own email** as the receiver: the email arrives
     with the logo and package photos (these only show once `SITE_URL` is the live
     address), and the tracking link opens the customer page.
   - Dashboard -> Settings: set the WhatsApp number. Dashboard -> Hubs: your real offices.

Everything above runs on free plans. Two things to know:

- **Keep the backend awake.** Render's free plan puts the server to sleep after
  15 minutes without traffic, and the next visitor waits for it to wake up.
  Create a free monitor at UptimeRobot (or cron-job.org) that requests
  `https://<your-render-url>/health` every 10 minutes. One always-on service
  fits inside Render's free monthly hours. This also keeps the automatic
  delivery simulation moving on time: while the server sleeps, its steps (and
  their emails) wait until the next visit wakes it.
- **Emails go to the receiver only** (booking email with photos, and status
  updates). Resend's free plan allows 100 emails a day, 3,000 a month.
- **One backend server online.** Render's free plan runs a single server, and
  Render load balances in front of it itself. The 3-server setup with Nginx
  still runs for free on your own machine with Docker Compose (see above).

## Adding a backend server

1. Add a `backend-4` service in `docker-compose.yml`.
2. Add `server backend-4:4000 ...` to the `backend_pool` in `nginx/nginx.conf`.
3. Check the connection budget: `MONGO_MAX_POOL_SIZE` x number of servers must
   stay well under your Atlas tier's connection limit.
