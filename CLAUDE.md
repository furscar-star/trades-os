# CLAUDE.md — 세션 시작 시 먼저 읽을 것

## 1. 프로젝트 한 줄 정의

**Trades-OS** = 소규모 노동력 중심 사업자(핸디맨·시공사·전기공·배관공·청소·조경 등) 용 AI 운영 비서. 현장 운영자가 차 안에서도 한 번의 질문으로 작업 현황·일정·매출을 파악하게 한다.

## 2. 현재 단계

- **Phase 0 (Discovery)** 진행 중.
- 자매 프로젝트 [Realtor-OS](C:\Agent_Projects\Realtor-OS\CLAUDE.md)와 코드 70% 공유 (Supabase·Groq·ORS·Whisper·Google OAuth·Vapi 인프라).
- 차이점: 고객 관리 → **잡(공사) 관리** 모듈로 교체.

## 3. MVP 스코프

기능 **3개만** 락인. 이 범위 밖 요청 오면 V2로 밀어낸다.

1. **인바운드 음성 봇 (다국어)** — EN/KO/ZH 자동 감지. 고객 문의 받아 잡(공사) 정보 수집(주소·작업종류·시급도) → 대시보드 "신규 의뢰" 자동 등록 → 시공자 수동 견적/확정.
2. **잡 관리 대시보드** — 신규 의뢰 / 진행 중 / 완료 / 매출 요약. 잡 단위로 예상 매출·비용·투입인원·기간 관리.
3. **AI 비서 (자연어 + 음성)** — "오늘 진행 중인 작업", "Smith 댁 일정", "이번 주 예상 매출" 같은 질의. 일정 등록·이동시간 계산 포함.

V2로 밀린 것: 견적서 자동 생성·발송, 인보이스, 직원 출퇴근 관리, 자재 재고, 사진 업로드 + 작업 보고서, 다중 사이트 동시 관리.

## 4. 절대 규칙 (Realtor-OS 4.x 그대로 적용)

### 4.1 팩트 데이터는 LLM이 생성하지 않는다
- 이동 거리·시간 → **ORS / Maps API만**
- 매출·비용 합계 → **DB 집계만** (LLM이 더하기 안 함)
- 일정 시각 → **Calendar API만**
- LLM은 자연어 변환·요약만 담당.

### 4.2 AI 고지 + 녹음 동의 통화 서두 100% 유지
- 봇 첫 멘트: *"AI 어시스턴트입니다. 통화는 품질 향상을 위해 녹음됩니다."* (3개 언어 동시 안내 또는 사전 언어 감지 후 해당 언어로)
- 캐나다 CRTC + two-party consent 동시 충족.

### 4.3 아웃바운드는 기술적으로 차단
- Phase 1 인바운드 전용. opt-in DB 검증 없이 발신 불가.

### 4.4 다국어 = 번역이 아니라 현지 표현
- 메뉴/UI 라벨은 각 언어권 소상공인이 실제로 쓰는 표현으로.
  - KR: "신규 의뢰", "진행 중", "이번 달 매출"
  - EN: "New Requests", "In Progress", "Monthly Revenue"
  - ZH: "新订单", "进行中", "本月收入"
- 단어 대응이 아니라 "그 동네 사장님이 일상적으로 쓰는 말".

### 4.5 비용 안전장치
- Vapi `maxDurationSeconds: 900` (15분 캡)
- Anthropic/Groq 월 한도
- 일일 호출 카운터 + 자동 차단

## 5. 기술 스택 (Realtor-OS와 동일)

| 레이어 | 선택 | 이유 |
|---|---|---|
| 음성 | Vapi + OpenAI GPT-4o Transcribe | 한국어/중국어 정확도 |
| LLM | Groq Llama 3.3 70B (free tier) | tool-use + 비용 |
| 음성 입력 | Groq Whisper-large-v3-turbo | 무료, 다국어 |
| DB | Supabase (Postgres) | 무료 티어 |
| 배포 | Vercel | 무료 티어 |
| 이동시간 | OpenRouteService | 카드 불필요 |
| 캘린더·메일 | Google APIs | 사장님 사용률 최상위 |

## 6. 디렉토리 구조

```
Trades-OS/
├── CLAUDE.md
├── docs/
│   ├── 01-vision.md
│   └── 02-features.md
├── src/
│   └── demo-server/
│       ├── server.js
│       ├── supabase-schema.sql
│       ├── package.json
│       ├── vercel.json
│       └── .env.example
└── README.md
```

## 7. 커뮤니케이션 규칙

- 사용자는 한국어로 소통 (코드 주석은 영어/한국어 혼용)
- 응답 간결하게
- 스코프 확장 요청은 정중하게 V2로

## 8. 자매 프로젝트 활용

대부분의 인프라 코드는 Realtor-OS의 `src/demo-server/server.js` 에서 그대로 가져옴. 차이는:
- `customers` → `jobs` 테이블 (스키마 다름)
- `notes` → 그대로 재사용
- `calls` → 그대로 재사용
- 챗 툴 정의 → 잡 관리에 맞게 재작성
- 시스템 프롬프트 → 트레이드 시장 맥락
- 대시보드 HTML → i18n + 잡 중심 섹션
