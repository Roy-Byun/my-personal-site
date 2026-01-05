import psutil
import os
import time
from fastapi import APIRouter
from datetime import datetime
from sqlalchemy import create_engine, text

router = APIRouter()

# Initialize DB Engine
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def get_formatted_uptime(seconds):
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    
    parts = []
    if days > 0: parts.append(f"{int(days)}d")
    if hours > 0: parts.append(f"{int(hours)}h")
    parts.append(f"{int(minutes)}m")
    return ", ".join(parts)

def get_db_status():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return "Connected"
    except Exception:
        return "Disconnected"

@router.get("/system-stats")
def get_system_stats():
    boot_timestamp = psutil.boot_time()
    uptime_seconds = time.time() - boot_timestamp
    
    return {
        "cpu_usage": psutil.cpu_percent(interval=0.1),
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
        "uptime_formatted": get_formatted_uptime(uptime_seconds),
        "boot_time": datetime.fromtimestamp(boot_timestamp).strftime('%Y-%m-%d %H:%M:%S'),
        "raw_uptime": uptime_seconds, # Used for alert logic
        "db_status": "Connected" # Placeholder for your existing DB check logic
    }