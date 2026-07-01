import logging
import os
from datetime import datetime
from typing import Optional

import requests
from sqlalchemy.orm import Session

from models import Project

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


def _headers() -> dict:
    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        import dateutil.parser
        return dateutil.parser.parse(value).replace(tzinfo=None)
    except Exception:
        return None


def fetch_repo_metadata(repo_full_name: str) -> dict:
    """repo_full_name = 'owner/repo'. Always returns a dict; check '_error' for failure."""
    try:
        resp = requests.get(f"{GITHUB_API}/repos/{repo_full_name}", headers=_headers(), timeout=10)
        if resp.status_code == 404:
            return {"_error": "Repository not found (may be private, renamed, or deleted)"}
        if resp.status_code == 403:
            return {"_error": "GitHub API rate limit exceeded"}
        resp.raise_for_status()
        data = resp.json()

        last_commit_at = None
        commit_resp = requests.get(
            f"{GITHUB_API}/repos/{repo_full_name}/commits",
            headers=_headers(), params={"per_page": 1}, timeout=10,
        )
        if commit_resp.ok and commit_resp.json():
            last_commit_at = _parse_dt(commit_resp.json()[0]["commit"]["committer"]["date"])

        return {
            "description": data.get("description"),
            "language": data.get("language"),
            "stars": data.get("stargazers_count", 0),
            "html_url": data.get("html_url"),
            "last_commit_at": last_commit_at,
            "_error": None,
        }
    except requests.RequestException as exc:
        logger.warning("GitHub fetch failed for %s: %s", repo_full_name, exc)
        return {"_error": str(exc)}


def list_user_repos(username: str) -> Optional[list[dict]]:
    try:
        resp = requests.get(
            f"{GITHUB_API}/users/{username}/repos",
            headers=_headers(), params={"per_page": 100, "sort": "updated"}, timeout=10,
        )
        resp.raise_for_status()
        return [
            {
                "full_name": r["full_name"],
                "description": r.get("description"),
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
                "html_url": r.get("html_url"),
            }
            for r in resp.json()
        ]
    except requests.RequestException as exc:
        logger.warning("GitHub repo list failed for %s: %s", username, exc)
        return None


def sync_all_github_projects(db: Session) -> None:
    projects = (
        db.query(Project)
        .filter(Project.project_type == "github", Project.github_repo.isnot(None))
        .all()
    )
    for project in projects:
        try:
            result = fetch_repo_metadata(project.github_repo)
            if result.get("_error"):
                project.github_sync_error = result["_error"]
                logger.warning("GitHub sync failed for %s: %s", project.github_repo, result["_error"])
            else:
                project.github_description = result["description"]
                project.github_language = result["language"]
                project.github_stars = result["stars"]
                project.github_url = result["html_url"]
                project.github_last_commit_at = result["last_commit_at"]
                project.github_synced_at = datetime.utcnow()
                project.github_sync_error = None
            db.commit()
        except Exception as exc:
            logger.warning("Unexpected error syncing project %s: %s", project.id, exc)
            db.rollback()
