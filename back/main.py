import os
from fastapi import FastAPI, HTTPException
from .models import TodoItem, ScheduleRequest
from dotenv import load_dotenv
import google.generativeai as genai

# 1. 환경 변수 로드 및 Gemini API 설정
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.")

genai.configure(api_key=api_key)

# 2. FastAPI 앱 초기화
app = FastAPI(title="AI Daily Scheduler")

# 4. 일정 생성 API 엔드포인트
@app.post("/generate-schedule")
async def generate_schedule(request: ScheduleRequest):
    try:
        # Gemini에게 보낼 모델 설정 (빠르고 효율적인 flash 모델 사용)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # AI가 규칙적인 JSON 배열로만 응답하도록 가이드하는 시스템 프롬프트
        prompt = f"""
        당신은 전문 일정 관리 비서입니다. 사용자가 제공한 할 일 목록과 최종 데드라인 시간을 바탕으로 하루 일정을 분 단위로 촘촘하게 짜주세요.
        
        [입력 데이터]
        - 할 일 목록: {request.todos}
        - 최종 마감 시간: {request.deadline}
        
        [요구사항]
        1. 각 일정은 시작 시간과 종료 시간을 명확히 해야 합니다.
        2. 작업 사이에 적절한 휴식 시간이나 이동 시간을 고려하세요.
        3. 마감 시간({request.deadline})을 절대 넘기지 마세요.
        4. 출력은 반드시 다음 구조의 JSON 배열 형식이어야 하며, 다른 부연 설명은 절대 하지 마세요:
        [
          {{"time_slot": "14:00 - 15:30", "activity": "알고리즘 공부", "reason": "집중력이 가장 높은 시간대 배치"}},
          ...
        ]
        """
        
        # JSON 형태로 출력을 강제하는 설정 적용
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        return {"success": True, "schedule": response.text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 서버 실행 테스트용 기본 루트 엔드포인트
@app.get("/")
def read_root():
    return {"message": "일정 주입 백엔드가 정상 작동 중입니다!"}