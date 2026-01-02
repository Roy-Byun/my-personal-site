import psutil
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure psutil reads from the host volumes mounted in docker-compose
if os.path.exists('/host/proc'):
    os.environ['PROCFS_PATH'] = '/host/proc'

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Nginx rewrites /api/health -> /health
@app.get("/health")
def health_check():
    return {"status": "healthy"}

# Nginx rewrites /api/system-stats -> /system-stats
@app.get("/system-stats")
def get_stats():
    return {
        "cpu_usage": psutil.cpu_percent(interval=0.1),
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent
    }