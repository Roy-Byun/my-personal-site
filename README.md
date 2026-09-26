# My Personal Website

**A concise guide for local development, Docker Compose deployment, and troubleshooting.**

**Overview**

- **What**: React + Vite frontend (`frontend/`) and FastAPI backend (`backend/`), served behind Nginx (`nginx.conf`).
- **Orchestration**: `docker-compose.yml` builds and runs `frontend`, `backend`, `nginx`, and `db` services.

**Quick Links**

- **Nginx**: [nginx.conf](nginx.conf)
- **Compose**: [docker-compose.yml](docker-compose.yml)
- **Frontend**: [frontend/](frontend)
- **Backend**: [backend/](backend)

**Prerequisites**

- Local development: `git`, Node.js (16+), `npm` or `yarn`, Python 3.11+ (or use Docker)
- For container runs: `docker` and `docker-compose`

**Quick Start — Docker (recommended)**

1. Build and run the full stack:

```bash
git clone <repo-url>
cd my-personal-site
docker compose up --build -d
```

2. Verify services:

```bash
docker compose ps
docker compose logs -f backend
```

Notes: Nginx listens on host port `80` by default. Make sure no host webserver occupies that port.

**Local Development (separate frontend/backend)**

- Frontend:

```bash
cd frontend
npm install
npm run dev
```

- Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend exposes health endpoints (see `backend/routers/health.py`).

- Backend tests (finance ledger + statement import):

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

**Finance Tracker**

Admin-only personal finance at `/finance`: a signed ledger with two-leg transfers, budgets, recurring costs, Emergency Fund, investments and AI statement import with a review queue. See [docs/finance/](docs/finance) for the design decisions, the import JSON contract (v1.1) and the schema.

**Common Environment Variables**

- `DATABASE_URL` — connection string for Postgres (used by the backend). If not set, a local SQLite fallback is used.
- `PROCFS_PATH` — set in `docker-compose.yml` to mount `/proc` for host metrics collection.

**Project Structure (high level)**

- `frontend/` — React + Vite app; scripts in `frontend/package.json` (`dev`, `build`, `preview`).
- `backend/` — FastAPI app; `requirements.txt` lists dependencies (e.g., `fastapi`, `uvicorn`, `psutil`, `psycopg2-binary`).
- `nginx.conf` — serves static frontend and proxies `/api/` to `backend:8000`.
- `docker-compose.yml` — service definitions, healthchecks, and volumes.

**Docker-compose notes**

- Frontend build artifacts are placed in a shared volume (`frontend_assets`) and served by Nginx.
- Backend mounts `/proc` and `/sys` for system metrics; healthchecks are configured in the compose file.

**Troubleshooting**

- 502 Bad Gateway: ensure backend is healthy. Check `docker compose logs nginx` and `docker compose logs backend`.
- Port conflicts on `80`: stop host webservers (`sudo systemctl stop nginx`) or change compose ports.
- Out of disk space: `docker system prune -f` (careful: removes unused images/containers).

**CI / Deployment**

- This repo can deploy via a self-hosted GitHub Actions runner (see `.github/workflows`). Typical runner steps:

```bash
docker compose down
docker compose up --build -d
```

If you use Tailscale Funnel, it forwards public HTTPS to the Mini PC's port `80`.

**Contribution**

- See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. Typical flow:

```bash
git checkout -b feature/my-change
make changes
git commit -am "Short summary"
git push origin feature/my-change
```

**Next tasks**

- Consider adding an `.env.example` with `DATABASE_URL` and Postgres settings.
- Replace the placeholder GitHub Actions badge with the real `OWNER/REPO` path.

---

If you'd like, I can also add an `.env.example`, tidy `CONTRIBUTING.md`, or open a PR for the README change.
