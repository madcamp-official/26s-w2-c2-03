from pydantic import BaseModel
from typing import List

class TodoItem(BaseModel):
    task: str          # 할 일 내용 (예: "알고리즘 공부")
    estimated_hours: float  # 예상 소요 시간 (예: 2.5)

class ScheduleRequest(BaseModel):
    todos: List[TodoItem]
    deadline: str      # 최종 데드라인 (예: "22:00")