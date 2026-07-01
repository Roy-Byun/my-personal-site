from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_optional_user, require_admin
from database import get_db
from github_client import fetch_repo_metadata, list_user_repos
import os
from models import Project, ProjectTask, User

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_TYPES = ("github", "study", "planning", "other")
PROJECT_STATUSES = ("active", "paused", "completed", "archived")


class ProjectOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    project_type: str
    status: str
    github_repo: Optional[str]
    github_description: Optional[str]
    github_language: Optional[str]
    github_stars: Optional[int]
    github_last_commit_at: Optional[datetime]
    github_url: Optional[str]
    github_synced_at: Optional[datetime]
    github_sync_error: Optional[str]
    external_url: Optional[str]
    tags: Optional[str]
    is_public: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_type: str = "other"
    status: str = "active"
    github_repo: Optional[str] = None
    external_url: Optional[str] = None
    tags: Optional[str] = None
    is_public: bool = True
    sort_order: int = 0


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    github_repo: Optional[str] = None
    external_url: Optional[str] = None
    tags: Optional[str] = None
    is_public: Optional[bool] = None
    sort_order: Optional[int] = None


def _redact_for_public(project: Project) -> Project:
    # Sync errors are diagnostic detail for the admin only.
    project.github_sync_error = None
    return project


@router.get("", response_model=List[ProjectOut])
def list_projects(
    type: Optional[str] = None,
    status: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    is_admin = bool(current_user and current_user.role == "admin")
    query = db.query(Project)
    if not is_admin:
        query = query.filter(Project.is_public == True)
    if type:
        query = query.filter(Project.project_type == type)
    if status:
        query = query.filter(Project.status == status)
    projects = query.order_by(Project.sort_order.asc(), Project.created_at.desc()).all()
    if not is_admin:
        projects = [_redact_for_public(p) for p in projects]
    return projects


@router.get("/github-suggestions")
def github_suggestions(_: User = Depends(require_admin)):
    username = os.getenv("GITHUB_USERNAME")
    if not username:
        raise HTTPException(400, "GITHUB_USERNAME is not configured")
    repos = list_user_repos(username)
    if repos is None:
        raise HTTPException(502, "Failed to fetch repositories from GitHub")
    return repos


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    is_admin = bool(current_user and current_user.role == "admin")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (not project.is_public and not is_admin):
        raise HTTPException(404, "Project not found")
    if not is_admin:
        project = _redact_for_public(project)
    return project


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.project_type not in PROJECT_TYPES:
        raise HTTPException(400, f"project_type must be one of {PROJECT_TYPES}")
    if body.status not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of {PROJECT_STATUSES}")
    project = Project(**body.model_dump(), created_by_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    data = body.model_dump(exclude_none=True)
    if "project_type" in data and data["project_type"] not in PROJECT_TYPES:
        raise HTTPException(400, f"project_type must be one of {PROJECT_TYPES}")
    if "status" in data and data["status"] not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of {PROJECT_STATUSES}")
    for field, val in data.items():
        setattr(project, field, val)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    db.query(ProjectTask).filter(ProjectTask.project_id == project_id).delete()
    db.delete(project)
    db.commit()


@router.post("/{project_id}/sync-github", response_model=ProjectOut)
def sync_github(
    project_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.project_type != "github" or not project.github_repo:
        raise HTTPException(400, "Project is not a github-type project with a repo configured")

    result = fetch_repo_metadata(project.github_repo)
    if result.get("_error"):
        project.github_sync_error = result["_error"]
    else:
        project.github_description = result["description"]
        project.github_language = result["language"]
        project.github_stars = result["stars"]
        project.github_url = result["html_url"]
        project.github_last_commit_at = result["last_commit_at"]
        project.github_synced_at = datetime.utcnow()
        project.github_sync_error = None
    db.commit()
    db.refresh(project)
    return project
