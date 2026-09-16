# [Hand-off Document] Task 05 Terminal Dashboard Development

Git Commit Version ID : `${TASK05_VERSION_ID}`

## 1. 목표 (Goal)

TASK_05의 목적은 터미널 형태의 환율 모니터링 대시보드에서 외부 데이터 조회 오류를 재현하고, 오류 상황에서도 데이터 상태를 명확하게 표시하며, 고정된 TEST-01~TEST-10을 동일한 기준으로 검증할 수 있도록 구현하는 것이다.

주요 목표는 다음과 같다.

- 외부 환율 API의 정상 데이터 조회
- HTTP 504 Timeout 발생 시 자동 재시도
- Exponential Backoff 기반 재시도 로그 표시
- 인증 실패(401), Rate Limit(429), Offline(503), Schema Changed(500) 오류 재현
- 오류 발생 시 STALE 상태 및 오류 코드 표시
- 정상 데이터 복구 확인
- Asia/Seoul 시간대 표시
- RAW / STORED / DISPLAY 데이터의 동일성 확인
- HANDOFF 문서와 실제 소스코드의 일치 여부 검증
- TEST-01~TEST-10을 고정된 테스트 기준으로 반복 실행할 수 있는 구조 유지

---

## 2. 현재 상태 (Current Status)

현재 프로젝트에는 TASK_05의 터미널 대시보드 및 오류 시뮬레이션 기능이 구현되어 있다.

### Git Version

- Git Commit Version ID는 환경변수 `${TASK05_VERSION_ID}`를 기준으로 관리한다.
- HANDOFF 검증 시 서버 환경변수에 설정된 Version ID를 사용하여 현재 작업 버전을 확인한다.
- Current Git Version ID: `${TASK05_VERSION_ID}`

### 주요 구현 파일

- `src/app/page.tsx`
  - 터미널 대시보드 UI
  - 정상 환율 데이터 표시
  - 오류 상태 표시
  - 자동 재시도 로직
  - Exponential Backoff 로그 표시
  - 일별 데이터 기록
  - PREV_DAY_DIFF 계산
  - RAW / STORED / DISPLAY 비교 화면
  - TEST-01~TEST-10 고정 테스트 표시
  - AI B HANDOFF 검증 실행

- `src/app/api/metric/route.ts`
  - 한국수출입은행 환율 API 조회
  - 최근 영업일 데이터 탐색
  - Frankfurter API fallback
  - Timeout fixture
  - Auth Denied fixture
  - Rate Limit fixture
  - Offline fixture
  - Schema Changed fixture
  - T04-RECOVER-D2 복구 fixture

- `src/app/api/handoff-verify/route.ts`
  - HANDOFF 문서 검증
  - page.tsx 및 metric API 소스 검증
  - HANDOFF 7개 섹션 구조 검증
  - Gemini / Groq AI 교차 검증

### 자동 재시도 구현

`src/app/page.tsx`의 `fetchMetricData()`에는 최대 3회의 시도가 구현되어 있다.

- 1차 요청
- 실패 시 2차 요청
- 실패 시 3차 요청

HTTP 504 또는 네트워크 오류 발생 시 재시도하며 Exponential Backoff 대기시간을 적용한다.

---

## 3. 실행 명령 (Execution Commands)

### 의존성 설치
```bash
npm install