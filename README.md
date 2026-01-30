# 🎓 광양고 자공고 2.0 이수 트랙 추천 시스템

광양고등학교 학생들의 성공적인 3개년 학교생활을 위해 디자인된 **AI 기반 맞춤형 진로 로드맵 설계 솔루션**입니다.

## ✨ 주요 기능
- **AI 맞춤형 트랙 추천**: Google Gemini 3 Flash Preview 모델을 활용하여 학생의 진로 계열, 성향(활동/학업)에 따른 최적의 프로그램 및 과목 이수 로직 제안.
- **실시간 데이터 연동**: Google Sheets와 실시간 연동하여 프로그램 정보가 자동으로 업데이트됩니다. (재배포 불필요)
- **데이터 기반의 정확성**: 학교의 실제 프로그램 운영 시트와 2022 개정 교육과정 편제표를 100% 준수.
- **지능형 사용량 제한**: Firestore를 기반으로 **1인당 1일 10회**로 AI 호출을 제한하여 안정적인 서비스 유지 (기기 중복 로그인 시에도 통합 관리).
- **결과 저장 및 공유**: 나만의 이수 트랙을 고화질 이미지(PNG)로 즉시 저장.
- **강력한 접근 제어**: 외부 관계자의 무단 접근을 방지하는 본교 학생(학번/성명)/교사(성명/비밀번호) 전용 인증 시스템.

## 📂 프로젝트 구조
- `primary_data/`: 원본 데이터 (프로그램 리스트, 교육과정 편제표)
- `src/`: 프론트엔드 소스 코드 (React, CSS)
- `interim_reports/`: 개발 진행 단계별 분석 리포트
- `sample/`: 기획 참조 사례 및 가이드 이미지

## 🚀 시작하기

### 설치 및 실행
```bash
npm install
npm run dev
```

### 환경 설정

#### 1. Gemini API 키 발급
1. [Google AI Studio](https://makersuite.google.com/app/apikey)에 접속
2. **Get API Key** 버튼 클릭
3. API 키 복사

#### 2. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음과 같이 설정하세요:

```bash
VITE_GEMINI_API_KEY=여기에_발급받은_API_키_입력
```

**참고**: `.env.example` 파일을 복사하여 사용할 수 있습니다.
```bash
# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

#### 3. Firebase Functions 설정 (배포 시)
Firebase Functions에서는 Gemini API 키를 보안을 위해 **Firebase Secrets**로 관리합니다. 또한 일일 사용량 추적을 위해 **Firestore**가 활성화되어 있어야 합니다.

## 🛡️ 보안 규정
본 프로젝트의 모든 데이터와 로직은 광양고등학교의 자산이며, 외부 유출 및 상업적 목적의 활용을 엄격히 금지합니다.
또한, AI 남용 방지를 위해 모든 접속 및 API 호출 기록은 서버(Firestore)에 안전하게 기록됩니다.

---
**Created by Antigravity AI Assistant for Gwangyang High School**
