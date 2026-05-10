# MVP 기능 정의

## 1. 잡(공사) 모듈

### 데이터 모델
- **id** (uuid)
- **title** — 작업명 (예: "Smith 욕실 타일 교체")
- **client_name / client_phone / client_email**
- **address**
- **trade_type** — `핸디맨 | 시공 | 전기 | 배관 | HVAC | 청소 | 조경 | 기타`
- **status** — `lead | quoted | scheduled | in_progress | completed | cancelled`
- **expected_revenue** — 예상 매출 (CAD)
- **expected_cost** — 예상 비용 (CAD, 인건비+자재)
- **crew_size** — 투입 인원 (정수)
- **assigned_crew** — 인원 명단 (텍스트 또는 jsonb)
- **scheduled_start / scheduled_end** — 작업 일정
- **actual_start / actual_end** — 실제 (완료 후)
- **description** — 상세 (작업 범위)
- **notes** — 메모

### 상태 흐름
```
lead → quoted → scheduled → in_progress → completed
                  ↓
              cancelled
```

### 대시보드 섹션 (i18n)

| KR | EN | ZH |
|---|---|---|
| 신규 의뢰 | New Requests | 新订单 |
| 견적 발송 | Quoted | 已报价 |
| 진행 중 | In Progress | 进行中 |
| 이번 달 매출 | Monthly Revenue | 本月收入 |

## 2. AI 비서 자연어 질의

### 조회
- "오늘 진행 중인 작업"
- "Smith 댁 일정"
- "이번 주 신규 의뢰 몇 건"
- "이번 달 예상 매출 합계"
- "전기 작업만 보여줘"

### 등록·변경
- "Smith 댁 작업 완료로 변경"
- "내일 오전 9시 Johnson 거실 페인트 시작 등록"
- "오늘 9시~6시 빈 시간"

### 이동시간
- "지금 위치에서 마캄 ABC 주소까지 얼마"
- "오늘 가야할 3곳 순서 짜줘"

## 3. 인바운드 음성봇

### 첫 멘트 (3개 언어)
- KR: "안녕하세요, [업체명]입니다. 저는 AI 어시스턴트예요. 통화는 품질 향상을 위해 녹음됩니다. 무엇을 도와드릴까요?"
- EN: "Hello, this is [Company]. I'm an AI assistant. This call is recorded for quality. How can I help?"
- ZH: "您好，这里是[公司名]。我是 AI 助理，通话将被录音。请问有什么可以帮您的？"

### 정보 수집
1. 작업 유형 (어떤 일이 필요한지)
2. 주소 (시·구 단위)
3. 시급도 (당장? 며칠 내? 몇 주 내?)
4. 예산 (대략)
5. 발신번호 → 자동 저장

### 자동 처리
- 통화 종료 → end-of-call webhook → `jobs` 테이블 INSERT (status=`lead`)
- 사장님 휴대폰으로 요약 SMS (선택)
- 대시보드 "신규 의뢰" 카드 자동 갱신

## 4. 다국어 처리

- **언어 자동 감지**: 통화 시 첫 한 마디로 언어 판정
- **대시보드**: 우측 상단 토글 (KR / EN / ZH)
- **localStorage 저장**: 다음 방문 시 동일 언어
- **메뉴 표현**: "번역"이 아니라 각 언어권 사장님이 일상으로 쓰는 표현

## 5. V2 (스코프 외)

- 견적서 PDF 자동 생성
- 자재 재고 관리
- 직원 출퇴근 (위치 + QR)
- 작업 사진 업로드 + AI 진행률
- 인보이스 + 결제 (Stripe)
- 다중 사이트 동시 관리 추천
