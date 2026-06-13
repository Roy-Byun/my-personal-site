from datetime import date as date_type

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/utils", tags=["utils"])


@router.get("/solar-to-lunar")
def solar_to_lunar(date: str = Query(..., description="Solar date in YYYY-MM-DD format")):
    try:
        d = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    try:
        from lunardate import LunarDate
        lunar = LunarDate.fromSolarDate(d.year, d.month, d.day)
        return {
            "solar_date": date,
            "lunar_date": f"{lunar.year:04d}-{lunar.month:02d}-{lunar.day:02d}",
            "is_leap_month": lunar.isLeapMonth,
        }
    except Exception as e:
        raise HTTPException(400, f"Cannot convert date: {e}")
