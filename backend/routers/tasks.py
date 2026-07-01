from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import Project, ProjectTask, User

router = APIRouter(prefix="/tasks", tags=["tasks"])

TASK_STATUSES = ("todo", "in_progress", "done")
TASK_PRIORITIES = ("low", "normal", "high")


class TaskOut(BaseModel):
    id: int
    project_id: int
    project_title: Optional[str] = None
    title: str
    description: Optional[str]
    status: str
    priority: str
    due_date: Optional[date]
    position: int
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "normal"
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None


class TaskMove(BaseModel):
    new_status: str
    new_position: int


def _apply_status_change(task: ProjectTask, new_status: str) -> None:
    if new_status == "done" and task.status != "done":
        task.completed_at = datetime.utcnow()
    elif new_status != "done":
        task.completed_at = None
    task.status = new_status


@router.get("", response_model=List[TaskOut])
def list_tasks(
    project_id: Optional[int] = None,
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(ProjectTask)
    if project_id is not None:
        query = query.filter(ProjectTask.project_id == project_id)
    if status:
        query = query.filter(ProjectTask.status == status)
    if priority:
        query = query.filter(ProjectTask.priority == priority)
    if due_before:
        query = query.filter(ProjectTask.due_date <= due_before)
    if due_after:
        query = query.filter(ProjectTask.due_date >= due_after)
    tasks = query.order_by(ProjectTask.status.asc(), ProjectTask.position.asc()).all()

    titles = {p.id: p.title for p in db.query(Project.id, Project.title).all()}
    out = []
    for t in tasks:
        item = TaskOut.model_validate(t)
        item.project_title = titles.get(t.project_id)
        out.append(item)
    return out


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.status not in TASK_STATUSES:
        raise HTTPException(400, f"status must be one of {TASK_STATUSES}")
    if body.priority not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {TASK_PRIORITIES}")
    if not db.query(Project.id).filter(Project.id == body.project_id).first():
        raise HTTPException(404, "Project not found")

    max_pos = (
        db.query(ProjectTask.position)
        .filter(ProjectTask.project_id == body.project_id, ProjectTask.status == body.status)
        .order_by(ProjectTask.position.desc())
        .first()
    )
    next_pos = (max_pos[0] + 1) if max_pos else 0

    task = ProjectTask(**body.model_dump(), position=next_pos, created_by_id=current_user.id)
    if task.status == "done":
        task.completed_at = datetime.utcnow()
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    data = body.model_dump(exclude_none=True)
    if "status" in data and data["status"] not in TASK_STATUSES:
        raise HTTPException(400, f"status must be one of {TASK_STATUSES}")
    if "priority" in data and data["priority"] not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {TASK_PRIORITIES}")
    new_status = data.pop("status", None)
    for field, val in data.items():
        setattr(task, field, val)
    if new_status is not None:
        _apply_status_change(task, new_status)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}/move", response_model=TaskOut)
def move_task(
    task_id: int,
    body: TaskMove,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.new_status not in TASK_STATUSES:
        raise HTTPException(400, f"new_status must be one of {TASK_STATUSES}")

    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    old_status, old_position, project_id = task.status, task.position, task.project_id

    def shift(status_col: str, gt=None, gte=None, lt=None, lte=None, delta: int = 0):
        q = db.query(ProjectTask).filter(
            ProjectTask.project_id == project_id, ProjectTask.status == status_col
        )
        if gt is not None:
            q = q.filter(ProjectTask.position > gt)
        if gte is not None:
            q = q.filter(ProjectTask.position >= gte)
        if lt is not None:
            q = q.filter(ProjectTask.position < lt)
        if lte is not None:
            q = q.filter(ProjectTask.position <= lte)
        q.update({ProjectTask.position: ProjectTask.position + delta}, synchronize_session=False)

    if old_status == body.new_status:
        if body.new_position > old_position:
            shift(body.new_status, gt=old_position, lte=body.new_position, delta=-1)
        elif body.new_position < old_position:
            shift(body.new_status, gte=body.new_position, lt=old_position, delta=1)
    else:
        shift(old_status, gt=old_position, delta=-1)
        shift(body.new_status, gte=body.new_position, delta=1)

    task.position = body.new_position
    _apply_status_change(task, body.new_status)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
