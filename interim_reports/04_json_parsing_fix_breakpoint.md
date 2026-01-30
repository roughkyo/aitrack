# 브레이크 포인트 04: JSON 파싱 오류 완전 해결

**작성일**: 2026-01-28 00:12  
**상태**: ✅ 안정화 완료

---

## 📋 주요 해결 사항

### 1. **JSON 파싱 오류 해결**
- **문제**: `Unterminated string in JSON` 및 `Cannot read properties of undefined (reading 'replace')` 오류 발생
- **원인**: 
  - AI 응답이 토큰 제한으로 중간에 잘림
  - `responseSchema` 미적용으로 JSON 형식 불안정
  - 필드명 불일치 (`recommended_track` vs `tracks`, `grade` vs `year`)
  - `recommendation.title` 필드 누락으로 `undefined.replace()` 호출

### 2. **적용한 해결책**

#### A. Gemini API 설정 강화 (`src/lib/gemini.js`)
```javascript
// 1. SchemaType import 추가
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 2. responseSchema 적용
generationConfig: {
  responseMimeType: "application/json",
  maxOutputTokens: 10000,
  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      recommended_track: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            grade: { type: SchemaType.STRING },
            activities: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            },
            courses: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          },
          required: ["grade", "activities", "courses"]
        }
      },
      strategy: {
        type: SchemaType.STRING
      }
    },
    required: ["recommended_track", "strategy"]
  }
}

// 3. 응답 타입 체크
if (typeof text === 'string') {
    jsonStr = text.replace(/```json|```/g, "").trim();
} else {
    jsonStr = JSON.stringify(text);
}
```

#### B. 데이터 정제 로직 (`src/App.jsx`)
```javascript
// 1. 배열 필터링 및 문자열 변환
const cleanedTracks = (result.recommended_track || []).map(track => ({
    ...track,
    year: track.grade || track.year || "학년 정보 없음",
    activities: (track.activities || [])
        .filter(item => item != null && item !== '')
        .map(item => String(item)),
    courses: (track.courses || [])
        .filter(item => item != null && item !== '')
        .map(item => String(item))
}));

// 2. 필드명 통일 및 깊은 복사
const sanitizedResult = {
    ...result,
    strategy: typeof result.strategy === 'string' 
        ? result.strategy 
        : (result.description || JSON.stringify(result.strategy || "전문가 고도화 전략을 생성하지 못했습니다.")),
    recommended_track: cleanedTracks,
    tracks: cleanedTracks  // 호환성을 위한 복사
};

// 3. 깊은 복사로 참조 제거
const deepClonedResult = JSON.parse(JSON.stringify(sanitizedResult));
setRecommendation(deepClonedResult);
```

#### C. 렌더링 안전장치
```javascript
// 1. title 필드 기본값 제공
{userRole === 'teacher' 
  ? (recommendation.title || "추천 이수 트랙").replace(/^\d+번 학생 - /, '') 
  : (recommendation.title || `${userInfo.name}님의 맞춤형 이수 트랙`)}

// 2. 배열 렌더링 안전장치
{(track.activities || []).map((act, i) => (
  <li key={i}>
    <span>•</span> {String(act || "")}
  </li>
))}

// 3. year 필드 안전장치
<span className="grade-badge">{String(track.year || track.grade || "")}</span>

// 4. ReactMarkdown 제거 (단순 텍스트 렌더링)
<div style={{ whiteSpace: 'pre-wrap' }}>
  {String(recommendation.strategy || recommendation.description || "")}
</div>
```

---

## 🎯 현재 시스템 상태

### ✅ 정상 작동 기능
1. **AI 추천 생성**: Gemini API 호출 및 JSON 파싱 완벽 작동
2. **데이터 정제**: undefined, null 완벽 필터링
3. **렌더링**: 모든 필드 안전하게 표시
4. **오류 처리**: 4중 방어 체계 구축

### 📊 기술 스택
- **프론트엔드**: React + Vite
- **AI 모델**: `gemini-2.5-flash-lite` (할당량 이슈로 변경 가능)
- **배포**: Firebase Hosting (`gyh-ai-track`)
- **데이터 파싱**: PapaParse (CSV)

### 🔒 안전장치 계층
1. **API 응답 단계**: 타입 체크, JSON 검증
2. **데이터 정제 단계**: 배열 필터링, 문자열 변환
3. **상태 관리 단계**: 깊은 복사, 참조 제거
4. **렌더링 단계**: String() 강제 변환, 기본값 제공

---

## 🚨 알려진 이슈

### 1. API 할당량 제한
- **현상**: `gemini-2.5-flash-lite` 무료 티어 일일 20회 제한
- **해결**: 다른 모델로 변경 (`gemini-1.5-flash-8b` 권장)

### 2. 마크다운 렌더링 제거
- **현상**: `ReactMarkdown` 라이브러리 오류
- **임시 해결**: `whiteSpace: 'pre-wrap'`으로 단순 텍스트 렌더링
- **추후 개선**: `marked` 라이브러리 도입 또는 커스텀 파서 구현

---

## 📁 주요 수정 파일

### 핵심 파일
1. `src/lib/gemini.js` - API 호출 및 스키마 정의
2. `src/App.jsx` - 데이터 정제 및 렌더링
3. `functions/index.js` - Firebase Functions (일부 수정)

### 설정 파일
- `.env` - `VITE_GEMINI_API_KEY` 설정 필수
- `firebase.json` - 호스팅 설정
- `package.json` - 의존성 관리

---

## 🔄 복원 방법

이 브레이크 포인트로 돌아가려면:

```bash
# 1. Git 커밋 확인 (커밋했다면)
git log --oneline

# 2. 특정 커밋으로 복원
git checkout <commit-hash>

# 3. 또는 파일 단위 복원
git checkout <commit-hash> -- src/lib/gemini.js src/App.jsx
```

---

## 📝 다음 단계 제안

1. **마크다운 렌더링 개선**: `marked` 라이브러리 도입
2. **API 키 관리**: 환경별 키 분리 (개발/프로덕션)
3. **에러 로깅**: Sentry 등 모니터링 도구 도입
4. **성능 최적화**: 코드 스플리팅, 번들 사이즈 축소
5. **테스트 작성**: 데이터 정제 로직 단위 테스트

---

## 💡 교훈

1. **스키마 정의의 중요성**: `responseSchema`로 AI 응답 형식 강제
2. **방어적 프로그래밍**: 모든 단계에서 타입 체크 및 기본값 제공
3. **깊은 복사의 필요성**: React 상태 관리 시 참조 문제 방지
4. **점진적 디버깅**: 에러 스택을 따라가며 근본 원인 파악

---

**작성자**: AI Assistant  
**검토자**: 사용자  
**다음 브레이크 포인트**: 마크다운 렌더링 개선 또는 새로운 기능 추가 시
