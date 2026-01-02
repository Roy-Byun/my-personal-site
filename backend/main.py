from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psutil
import os

# 1. Set environment variable BEFORE other logic if the host path exists
if os.path.exists('/host/proc'):
    os.environ['PROCFS_PATH'] = '/host/proc'

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello from HeptaHog Backend"}

# 2. Path Fix: Nginx rewrites /api/health to /health
@app.get("/health")
def health_check():
    return {"status": "healthy", "node": "Roika-Mini-PC"}

# 3. Path Fix: Nginx rewrites /api/system-stats to /system-stats
@app.get("/system-stats")
def get_system_stats():
    return {
        "cpu_usage": psutil.cpu_percent(interval=0.1), # Small interval for accuracy
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
        "uptime": psutil.boot_time()
    }