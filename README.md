git commit -m "Your update message"
git push origin main
Automatic Deployment:GitHub triggers the self-hosted runner on the Mini PC.The runner executes docker compose down and docker compose up --build -d.The site updates automatically within seconds.🐳 Container Management (Portainer)Accessible at: http://100.106.207.88:9000Monitoring: Check CPU/RAM usage of containers.Logs: Click the log icon for the backend or frontend containers to debug runtime errors.Quick Restart: Manual control over services if a container hangs.⚠️ Maintenance ChecklistPort ConflictsIf you encounter a 502 Bad Gateway, ensure the host OS is not running its own Nginx/Apache instance on Port 80:sudo systemctl stop nginx
sudo systemctl disable nginx
Tailscale Funnel StatusIf the site is unreachable from the public internet, verify the funnel is active:tailscale funnel status
If it shows tailnet only, re-run the tailscale funnel 443 on command.Storage PruningTo prevent the Mini PC from running out of disk space due to old Docker layers:docker system prune -f
🔗 Access LinksPublic URL: https://roika-server.hedgehog-heptatonic.ts.net/Private Tailnet IP: http://100.106.207.88Portainer: http://100.106.207.88:9000

# My Personal Website — Infrastructure & CI/CD Guide

This repository contains a full-stack application (React frontend + FastAPI backend) deployed to a private Mini PC using Docker Compose, a self-hosted GitHub Actions runner, and Tailscale Funnel for secure public access.

**Table of Contents**

- **Overview**: Short architecture summary and purpose.
- **Prerequisites**: Tools required locally and on the server.
  [![Deploy status](https://github.com/OWNER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/deploy.yml)

# My Personal Website — Infrastructure & CI/CD Guide

This repository contains a full-stack application (React frontend + FastAPI backend) deployed to a private Mini PC using Docker Compose, a self-hosted GitHub Actions runner, and Tailscale Funnel for secure public access.

> Replace `OWNER/REPO` in the badge above with your GitHub organization/user and repository name to enable the live status badge.

**Table of Contents**

- **Overview**: Short architecture summary and purpose.
- **Prerequisites**: Tools required locally and on the server.
- **Quick Start**: Development and deployment steps.
- **CI/CD**: How the self-hosted runner deploys the site.
- **Networking**: Tailscale Funnel & Nginx routing notes.
- **Troubleshooting**: Common issues and commands.

**Overview**

- **Frontend**: React (Vite) in the `frontend/` folder.
- **Backend**: FastAPI in the `backend/` folder.
- **Reverse proxy**: Nginx is configured to serve the frontend and proxy `/api` to the backend via [nginx.conf](nginx.conf).
- **Containers**: Docker + Docker Compose orchestrate services.
- **Remote access**: Tailscale Funnel exposes HTTPS to the internet.
- **CI/CD**: GitHub Actions triggers a self-hosted runner on the Mini PC to build and deploy.

**Prerequisites**

- **Local (development laptop)**: `git`, `docker` (for local testing), Node.js & npm/yarn (frontend).
- **Server (Mini PC)**: `docker`, `docker-compose`, `tailscale`, and a configured GitHub self-hosted runner.

**Quick Start — Local Development**

- **Frontend**:

  Install dependencies and run dev server:

  ```bash
  cd frontend
  npm install
  npm run dev
  ```

- **Backend**:

  Create a virtual environment, install dependencies and run the API:

  ```bash
  cd backend
  python -m venv .venv
  .venv\Scripts\activate   # Windows
  pip install -r requirements.txt
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```

**Quick Start — Server Deployment (Mini PC)**

- Pull the repo on the Mini PC, then use Docker Compose to run services:

  ```bash
  git clone <repo-url> repo
  cd repo
  docker compose up --build -d
  ```

- The project expects Nginx to listen on port 80 locally; Tailscale Funnel will forward public HTTPS traffic to that port.

**CI/CD (Self-Hosted Runner)**

- **Workflow**: Pushes to `main` trigger the workflow in `.github/workflows/deploy.yml` which targets the self-hosted runner on the Mini PC.
- **Runner operations**: The runner pulls changes and runs `docker compose down` and `docker compose up --build -d` to update services.
- **Runner install**: See the runner setup scripts (`./config.sh`, `./svc.sh`) used to register and install the runner as a service on the Mini PC.

**Networking & Tailscale Funnel**

- **Tailscale**: Provides secure private network access to the Mini PC; useful for tailnet-only access.
- **Funnel**: Configured to expose HTTPS publicly and forward to local port 80. Example commands used on the Mini PC:

  ```bash
  tailscale serve --bg 80
  tailscale funnel 443 on
  ```

**Port & Service Notes**

- **Port 80**: Ensure no host-level webserver (nginx/apache) is binding to port 80. If needed, stop and disable it:

  ```bash
  sudo systemctl stop nginx
  sudo systemctl disable nginx
  ```

- **Disk maintenance**: Clean up old Docker images and layers occasionally:

  ```bash
  docker system prune -f
  ```

**Troubleshooting**

- **502 Bad Gateway**: Verify Nginx is running and proxy targets are reachable. Check container logs via Docker or Portainer.
- **Funnel not public**: Run `tailscale funnel status` and re-run the funnel commands if the endpoint is not active.

**Useful Links**

- Nginx config: [nginx.conf](nginx.conf)
- Frontend: [frontend/](frontend)
- Backend: [backend/](backend)

**Access**

- **Public URL**: https://roika-server.hedgehog-heptatonic.ts.net/
- **Private Tailnet IP**: http://100.106.207.88
- **Portainer**: http://100.106.207.88:9000

If you'd like, I can also:

- Update the GitHub Actions workflow description further.
- Add more contributor guidance or templates in `CONTRIBUTING.md`.
- Replace the placeholder badge with the real repository path.
