# API 키 설정 가이드

## 🔑 Gemini API 키 발급 및 설정

### 1단계: API 키 발급
1. [Google AI Studio](https://makersuite.google.com/app/apikey) 접속
2. Google 계정으로 로그인
3. **Get API Key** 또는 **Create API Key** 버튼 클릭
4. 생성된 API 키 복사

### 2단계: 환경 변수 설정
프로젝트 루트 디렉토리의 `.env` 파일을 열고 다음과 같이 설정:

```
VITE_GEMINI_API_KEY=여기에_복사한_API_키_붙여넣기
```

**예시:**
```
VITE_GEMINI_API_KEY=AIzaSyABC123def456GHI789jkl012MNO345pqr
```

### 3단계: 개발 서버 재시작
터미널에서 `Ctrl + C`로 현재 실행 중인 서버를 종료한 후:
```bash
npm run dev
```

### 4단계: 테스트
1. 브라우저에서 `localhost:5173` 접속
2. 학생 인증 후 AI 추천 트랙 생성 버튼 클릭
3. 정상적으로 추천 결과가 표시되는지 확인

---

## 🚨 주의사항
- API 키는 **절대 Git에 커밋하지 마세요**
- `.env` 파일은 `.gitignore`에 포함되어 있어 자동으로 제외됩니다
- API 키가 노출되면 즉시 Google AI Studio에서 해당 키를 삭제하고 새로 발급받으세요
