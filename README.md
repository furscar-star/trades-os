# Trades-OS

소규모 노동력 중심 사업자(핸디맨·시공사·전기공·배관공 등)용 AI 운영 비서.

## Quickstart (로컬)

```bash
cd src/demo-server
cp .env.example .env   # 키 채우기
npm install
npm run dev            # http://localhost:3000/dashboard
```

## 키 받기

| 키 | 어디서 | 비용 |
|---|---|---|
| `GROQ_API_KEY` | https://console.groq.com/keys | 무료 티어 |
| `ORS_API_KEY` | https://account.heigit.org/signup | 무료 (2,000건/일) |
| `SUPABASE_URL/ANON_KEY` | https://supabase.com 프로젝트 생성 | 무료 |
| `GOOGLE_CLIENT_ID/SECRET` | GCP Console → OAuth Client ID (Web) | 무료 |

## DB 셋업

Supabase SQL Editor → `src/demo-server/supabase-schema.sql` 붙여넣고 Run.

## 다국어

대시보드 우측 상단 토글 — 한국어 / English / 中文.
**번역이 아니라** 각 언어권 사장님이 일상으로 쓰는 표현 사용.

## 자매 프로젝트

[Realtor-OS](../Realtor-OS) — GTA 한인 리얼터용 동일 인프라 기반 비서.
인프라 코드 70% 공유, 비즈니스 로직만 다름.

## 라이선스

Private — 미배포.
