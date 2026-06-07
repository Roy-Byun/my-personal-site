from datetime import datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")

    # Name
    full_name = Column(String, nullable=True)          # legacy – kept for seed compat
    first_name = Column(String, nullable=True)         # 이름
    last_name = Column(String, nullable=True)          # 성
    western_name = Column(String, nullable=True)       # 영어이름

    # Birthday
    birthday = Column(Date, nullable=True)             # 양력 (solar / Gregorian)
    birthday_lunar = Column(Date, nullable=True)       # 음력 (lunar)
    is_lunar = Column(Boolean, nullable=True, default=False)

    # Contact
    country_code = Column(String(10), nullable=True)   # e.g. "+82"
    phone_number = Column(String(20), nullable=True)

    # Profile
    profile_picture_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
