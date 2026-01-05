import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import health, system  # Import your modules

# Set psutil path before any logic
if os.path.exists('/host/proc'):
    os.environ['PROCFS_PATH'] = '/host/proc'

app = FastAPI(title="Roika Mini PC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the routers
app.include_router(health.router)
app.include_router(system.router)