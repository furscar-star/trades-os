-- Trades-OS: Supabase 스키마
-- Supabase 대시보드 → SQL Editor → New Query 에 붙여넣고 Run
-- RLS는 데모용 "전체 접근 허용". 프로덕션은 auth.uid() 정책 필수.

-- ── 공용: updated_at 자동 갱신 ─────────────────────────
CREATE OR REPLACE FUNCTION trades_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── jobs (작업/공사) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  client_name       TEXT,
  client_phone      TEXT,
  client_email      TEXT,
  address           TEXT,
  trade_type        TEXT,                                 -- 핸디맨/시공/전기/배관/HVAC/청소/조경/기타
  status            TEXT NOT NULL DEFAULT 'lead',         -- lead/quoted/scheduled/in_progress/completed/cancelled
  expected_revenue  NUMERIC(12,2),                        -- CAD
  expected_cost     NUMERIC(12,2),                        -- CAD (인건+자재)
  crew_size         INT,
  assigned_crew     TEXT,                                 -- 자유 텍스트 ("Mike, Joon")
  scheduled_start   TIMESTAMPTZ,
  scheduled_end     TIMESTAMPTZ,
  actual_start      TIMESTAMPTZ,
  actual_end        TIMESTAMPTZ,
  description       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status, scheduled_start);
CREATE INDEX IF NOT EXISTS jobs_updated_at_idx ON jobs(updated_at DESC);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION trades_set_updated_at();

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON jobs;
CREATE POLICY "demo_all_access" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- ── crew (인력 명부, 선택) ─────────────────────────────
CREATE TABLE IF NOT EXISTS crew (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  role        TEXT,                                       -- 전기/타일/페인트 etc
  day_rate    NUMERIC(10,2),
  active      BOOLEAN DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_crew_updated_at ON crew;
CREATE TRIGGER trg_crew_updated_at
  BEFORE UPDATE ON crew
  FOR EACH ROW EXECUTE FUNCTION trades_set_updated_at();

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON crew;
CREATE POLICY "demo_all_access" ON crew FOR ALL USING (true) WITH CHECK (true);

-- ── notes (메모) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at DESC);

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION trades_set_updated_at();

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON notes;
CREATE POLICY "demo_all_access" ON notes FOR ALL USING (true) WITH CHECK (true);

-- ── calls (Vapi 통화 로그) ───────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller        TEXT,
  duration_sec  INT DEFAULT 0,
  summary       TEXT,
  transcript    TEXT,
  ended_reason  TEXT,
  language      TEXT,                                     -- ko/en/zh 자동감지
  matched_job_id UUID,                                    -- 자동 매칭된 잡
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls(created_at DESC);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON calls;
CREATE POLICY "demo_all_access" ON calls FOR ALL USING (true) WITH CHECK (true);

-- ── oauth_tokens (Google) ────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider      TEXT PRIMARY KEY,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    BIGINT,
  email         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON oauth_tokens;
CREATE POLICY "demo_all_access" ON oauth_tokens FOR ALL USING (true) WITH CHECK (true);

-- ── job_documents (계약서·견적서·작업사진 등 종류별 버전 관리) ──
CREATE TABLE IF NOT EXISTS job_documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  doc_type   TEXT NOT NULL DEFAULT 'other',
  file_name  TEXT NOT NULL,
  file_data  TEXT,
  file_size  BIGINT,
  mime_type  TEXT,
  version    INT DEFAULT 1,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_documents_job_idx
  ON job_documents(job_id, doc_type, version DESC);

ALTER TABLE job_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON job_documents;
CREATE POLICY "demo_all_access" ON job_documents FOR ALL USING (true) WITH CHECK (true);

-- ── feedback (개발자 코멘트, 다국어 + 자동 한국어 번역) ─────
CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL,
  language      TEXT,
  translated_ko TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_all_access" ON feedback;
CREATE POLICY "demo_all_access" ON feedback FOR ALL USING (true) WITH CHECK (true);

-- ── 샘플 데이터 ───────────────────────────────────────
INSERT INTO jobs (title, client_name, client_phone, client_email, address, trade_type, status,
                  expected_revenue, expected_cost, crew_size, assigned_crew,
                  scheduled_start, scheduled_end, description) VALUES
  ('Smith 욕실 타일 교체', 'John Smith', '+1 416 555 0142', 'jsmith@example.com',
   '123 Main St, Richmond Hill', '시공', 'in_progress',
   4800.00, 2300.00, 2, 'Mike, Joon',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days',
   '메인 욕실 바닥 + 벽 타일 전체 교체. 고객 자재 본인 구매 X.'),

  ('Wong 콘도 거실 페인트', 'Sarah Wong', '+1 647 555 0199', 'swong@example.com',
   '88 Yonge St, Toronto', '시공', 'scheduled',
   2200.00, 800.00, 1, 'Kim',
   NOW() + INTERVAL '3 days', NOW() + INTERVAL '4 days',
   '거실 + 복도 화이트 페인트 2회 도장.'),

  ('Lee 오피스 LED 교체', 'David Lee', '+1 437 555 0123', 'dlee@example.com',
   '500 King St W, Toronto', '전기', 'lead',
   3500.00, NULL, NULL, NULL,
   NULL, NULL,
   '사무실 천장 형광등 24개 LED 패널로. 견적 요청.'),

  ('Park 단독주택 에어컨 점검', 'James Park', '+1 905 555 0166', 'jpark@example.com',
   '45 Maple Ave, Markham', 'HVAC', 'quoted',
   650.00, 200.00, 1, 'Tony',
   NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days',
   '여름 시즌 전 점검 + 필터 교체.')
ON CONFLICT DO NOTHING;

INSERT INTO crew (name, phone, role, day_rate) VALUES
  ('Mike Chen',  '+1 416 555 0001', '타일·바닥', 380.00),
  ('Joon Park',  '+1 437 555 0002', '시공·전기', 400.00),
  ('Kim Lee',    '+1 647 555 0003', '페인트·도장', 350.00),
  ('Tony Wang',  '+1 905 555 0004', 'HVAC·전기', 420.00)
ON CONFLICT DO NOTHING;

INSERT INTO notes (content) VALUES
  ('Smith 욕실 — 타일 도착 5/10 확인'),
  ('Wong 콘도 — 페인트 2갤런 추가 주문'),
  ('5월 마지막 주 휴무 (가족 일정)')
ON CONFLICT DO NOTHING;
