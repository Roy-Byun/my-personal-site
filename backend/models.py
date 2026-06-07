from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "admin" | "user"
    full_name = Column(String, nullable=True)
    birthday = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
