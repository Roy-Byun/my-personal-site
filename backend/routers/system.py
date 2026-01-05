import psutil
import os
import time
from fastapi import APIRouter
from sqlalchemy import create_engine, text

router = APIRouter()

# Initialize DB Engine
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def get_db_status():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return "Connected"
    except Exception:
        return "Disconnected"

@router.get("/system-stats")
def get_system_stats():
    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time
    
    return {
        "cpu_usage": psutil.cpu_percent(interval=0.1),
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
        "uptime": round(uptime_seconds / 3600, 1),
        "db_status": get_db_status()
    }