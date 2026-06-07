import os
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import User

if os.path.exists("/host/proc"):
    os.environ["PROCFS_PATH"] = "/host/proc"

router = APIRouter()


def _format_uptime(seconds: float) -> str:
    days, rem = divmod(int(seconds), 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return ", ".join(parts)


def _db_status(db: Session) -> str:
    try:
        db.execute(text("SELECT 1"))
        return "Connected"
    except Exception:
        return "Disconnected"


@router.get("/system-stats")
def get_system_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    boot_ts = psutil.boot_time()
    uptime_seconds = time.time() - boot_ts
    return {
        "cpu_usage": psutil.cpu_percent(interval=0.1),
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage("/").percent,
        "uptime_formatted": _format_uptime(uptime_seconds),
        "boot_time": datetime.fromtimestamp(boot_ts).strftime("%Y-%m-%d %H:%M:%S"),
        "raw_uptime": uptime_seconds,
        "db_status": _db_status(db),
    }
