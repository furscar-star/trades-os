// Trades-OS 데모 서버
// 핸디맨/시공사/전기공 등 소규모 노동력 사업자용 AI 운영 비서
require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Supabase ──────────────────────────────────────────────
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  console.log('[supabase] initialized');
} else {
  console.log('[supabase] env missing — using in-memory mock');
}

// ── Mock 데이터 ───────────────────────────────────────────
const mockJobs = [
  { id: 'mock-j1', title: 'Smith 욕실 타일 교체', client_name: 'John Smith', client_phone: '+1 416 555 0142', address: '123 Main St, Richmond Hill', trade_type: '시공', status: 'in_progress', expected_revenue: 4800, expected_cost: 2300, crew_size: 2, assigned_crew: 'Mike, Joon', scheduled_start: new Date(Date.now() - 24*3600*1000).toISOString(), scheduled_end: new Date(Date.now() + 2*24*3600*1000).toISOString(), description: '메인 욕실 바닥+벽 타일 전체.', created_at: new Date(Date.now() - 5*24*3600*1000).toISOString(), updated_at: new Date().toISOString() },
  { id: 'mock-j2', title: 'Wong 콘도 거실 페인트', client_name: 'Sarah Wong', client_phone: '+1 647 555 0199', address: '88 Yonge St, Toronto', trade_type: '시공', status: 'scheduled', expected_revenue: 2200, expected_cost: 800, crew_size: 1, assigned_crew: 'Kim', scheduled_start: new Date(Date.now() + 3*24*3600*1000).toISOString(), scheduled_end: new Date(Date.now() + 4*24*3600*1000).toISOString(), description: '거실+복도 화이트 2회.', created_at: new Date(Date.now() - 2*24*3600*1000).toISOString(), updated_at: new Date(Date.now() - 1*24*3600*1000).toISOString() },
  { id: 'mock-j3', title: 'Lee 오피스 LED 교체', client_name: 'David Lee', client_phone: '+1 437 555 0123', address: '500 King St W, Toronto', trade_type: '전기', status: 'lead', expected_revenue: 3500, expected_cost: null, crew_size: null, assigned_crew: null, scheduled_start: null, scheduled_end: null, description: '천장 형광등 24개 LED 패널로. 견적 요청.', created_at: new Date(Date.now() - 1*3600*1000).toISOString(), updated_at: new Date(Date.now() - 1*3600*1000).toISOString() },
  { id: 'mock-j4', title: 'Park 단독주택 에어컨 점검', client_name: 'James Park', client_phone: '+1 905 555 0166', address: '45 Maple Ave, Markham', trade_type: 'HVAC', status: 'quoted', expected_revenue: 650, expected_cost: 200, crew_size: 1, assigned_crew: 'Tony', scheduled_start: new Date(Date.now() + 7*24*3600*1000).toISOString(), scheduled_end: new Date(Date.now() + 7*24*3600*1000).toISOString(), description: '여름 시즌 전 점검+필터.', created_at: new Date(Date.now() - 3*24*3600*1000).toISOString(), updated_at: new Date(Date.now() - 1*24*3600*1000).toISOString() },
];
const mockCrew = [
  { id: 'mock-c1', name: 'Mike Chen', phone: '+1 416 555 0001', role: '타일·바닥', day_rate: 380, active: true },
  { id: 'mock-c2', name: 'Joon Park', phone: '+1 437 555 0002', role: '시공·전기', day_rate: 400, active: true },
  { id: 'mock-c3', name: 'Kim Lee', phone: '+1 647 555 0003', role: '페인트·도장', day_rate: 350, active: true },
  { id: 'mock-c4', name: 'Tony Wang', phone: '+1 905 555 0004', role: 'HVAC·전기', day_rate: 420, active: true },
];
const mockNotes = [
  { id: 'mock-n1', content: 'Smith 욕실 — 타일 도착 5/10 확인', created_at: new Date(Date.now() - 2*3600*1000).toISOString(), updated_at: new Date(Date.now() - 2*3600*1000).toISOString() },
  { id: 'mock-n2', content: 'Wong 콘도 — 페인트 2갤런 추가 주문', created_at: new Date(Date.now() - 24*3600*1000).toISOString(), updated_at: new Date(Date.now() - 24*3600*1000).toISOString() },
];
const mockCalls = [];
let memoryTokens = {};
function genMockId() { return 'mock-' + Math.random().toString(36).slice(2, 10); }

// ── Health ─────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'trades-os-demo', ts: new Date().toISOString() }));

// ═══════════════════════════════════════════════════════════════════════════
// VAPI WEBHOOK — 통화 종료 시 신규 잡(lead) 등록
// ═══════════════════════════════════════════════════════════════════════════
app.post('/webhook/vapi-call-end', async (req, res) => {
  res.json({ ok: true });
  const msg = req.body?.message;
  if (!msg) return;
  const type = msg.type;
  if (type && type !== 'end-of-call-report' && type !== 'end-of-call') return;

  const caller = msg.call?.customer?.number || msg.customer?.number || 'unknown';
  const durationSec = Math.round(msg.durationSeconds || msg.call?.durationSeconds || 0);
  const summary = msg.summary || msg.analysis?.summary || '(요약 없음)';
  const transcript = msg.transcript || msg.artifact?.transcript || '';
  const endedReason = msg.endedReason || msg.call?.endedReason || 'unknown';
  // 언어 감지 (간단): 한글 / 한자 / 그 외 → ko/zh/en
  const lang = /[가-힣]/.test(transcript) ? 'ko'
             : /[一-鿿]/.test(transcript) ? 'zh' : 'en';

  console.log(`\n📞 통화 종료 — ${caller} / ${durationSec}s / ${lang}`);
  console.log(`  요약: ${summary}\n`);

  if (supabase) {
    try {
      // 1) 통화 로그
      await supabase.from('calls').insert([{
        caller, duration_sec: durationSec, summary, transcript,
        ended_reason: endedReason, language: lang,
      }]);
      // 2) 신규 의뢰(jobs.lead) 자동 등록
      const title = `${lang === 'ko' ? '전화 문의' : lang === 'zh' ? '电话询价' : 'Phone Inquiry'} — ${caller}`;
      await supabase.from('jobs').insert([{
        title, client_phone: caller, status: 'lead', description: summary,
      }]);
    } catch (err) { console.error('[vapi insert error]', err.message); }
  } else {
    mockCalls.unshift({ id: genMockId(), caller, duration_sec: durationSec, summary, ended_reason: endedReason, language: lang, created_at: new Date().toISOString() });
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.OWNER_PHONE) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({
        body: `📞 신규 문의 (${lang})\n발신: ${caller}\n${summary}`,
        from: process.env.TWILIO_FROM_NUMBER, to: process.env.OWNER_PHONE,
      });
    } catch (err) { console.error('[SMS]', err.message); }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// JOBS CRUD
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/jobs', async (req, res) => {
  const { status, trade_type } = req.query;
  if (!supabase) {
    let list = [...mockJobs];
    if (status) list = list.filter(j => j.status === status);
    if (trade_type) list = list.filter(j => j.trade_type === trade_type);
    return res.json({ source: 'mock', jobs: list });
  }
  try {
    let q = supabase.from('jobs').select('*').order('updated_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (trade_type) q = q.eq('trade_type', trade_type);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ source: 'supabase', jobs: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/jobs', async (req, res) => {
  const payload = req.body || {};
  if (!supabase) {
    const row = { id: genMockId(), ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockJobs.unshift(row);
    return res.json({ source: 'mock', job: row });
  }
  try {
    const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
    if (error) throw error;
    res.json({ source: 'supabase', job: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/jobs/:id', async (req, res) => {
  const id = req.params.id;
  const payload = { ...req.body, updated_at: new Date().toISOString() };
  if (!supabase) {
    const idx = mockJobs.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    mockJobs[idx] = { ...mockJobs[idx], ...payload };
    return res.json({ source: 'mock', job: mockJobs[idx] });
  }
  try {
    const { data, error } = await supabase.from('jobs').update(payload).eq('id', id).select().single();
    if (error) throw error;
    res.json({ source: 'supabase', job: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/jobs/:id', async (req, res) => {
  const id = req.params.id;
  if (!supabase) {
    const idx = mockJobs.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    mockJobs.splice(idx, 1);
    return res.json({ source: 'mock', ok: true });
  }
  try {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw error;
    res.json({ source: 'supabase', ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 매출 요약 (이번 달, 진행중·완료 합계)
app.get('/api/jobs/revenue-summary', async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (!supabase) {
    const inMonth = mockJobs.filter(j => (j.created_at || '') >= monthStart);
    const sum = (key, statusFilter) => inMonth.filter(j => !statusFilter || statusFilter.includes(j.status)).reduce((s, j) => s + (Number(j[key]) || 0), 0);
    return res.json({
      source: 'mock',
      month_revenue_pipeline: sum('expected_revenue'),
      month_revenue_in_progress: sum('expected_revenue', ['in_progress', 'completed']),
      month_cost_estimated: sum('expected_cost'),
      job_count: inMonth.length,
    });
  }
  try {
    const { data, error } = await supabase.from('jobs').select('expected_revenue, expected_cost, status').gte('created_at', monthStart);
    if (error) throw error;
    const sum = (key, statusFilter) => (data || []).filter(j => !statusFilter || statusFilter.includes(j.status)).reduce((s, j) => s + (Number(j[key]) || 0), 0);
    res.json({
      source: 'supabase',
      month_revenue_pipeline: sum('expected_revenue'),
      month_revenue_in_progress: sum('expected_revenue', ['in_progress', 'completed']),
      month_cost_estimated: sum('expected_cost'),
      job_count: (data || []).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREW CRUD
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/crew', async (_req, res) => {
  if (!supabase) return res.json({ source: 'mock', crew: mockCrew });
  try {
    const { data, error } = await supabase.from('crew').select('*').order('name');
    if (error) throw error;
    res.json({ source: 'supabase', crew: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crew', async (req, res) => {
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: 'name 필요' });
  if (!supabase) {
    const row = { id: genMockId(), active: true, ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockCrew.push(row);
    return res.json({ source: 'mock', member: row });
  }
  try {
    const { data, error } = await supabase.from('crew').insert([payload]).select().single();
    if (error) throw error;
    res.json({ source: 'supabase', member: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/crew/:id', async (req, res) => {
  const id = req.params.id;
  const payload = { ...req.body, updated_at: new Date().toISOString() };
  if (!supabase) {
    const idx = mockCrew.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    mockCrew[idx] = { ...mockCrew[idx], ...payload };
    return res.json({ source: 'mock', member: mockCrew[idx] });
  }
  try {
    const { data, error } = await supabase.from('crew').update(payload).eq('id', id).select().single();
    if (error) throw error;
    res.json({ source: 'supabase', member: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/crew/:id', async (req, res) => {
  const id = req.params.id;
  if (!supabase) {
    const idx = mockCrew.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    mockCrew.splice(idx, 1);
    return res.json({ source: 'mock', ok: true });
  }
  try {
    const { error } = await supabase.from('crew').delete().eq('id', id);
    if (error) throw error;
    res.json({ source: 'supabase', ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTES CRUD
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/notes', async (_req, res) => {
  if (!supabase) return res.json({ source: 'mock', notes: mockNotes });
  try {
    const { data, error } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ source: 'supabase', notes: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes', async (req, res) => {
  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'content 필요' });
  if (!supabase) {
    const row = { id: genMockId(), content, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockNotes.unshift(row);
    return res.json({ source: 'mock', note: row });
  }
  try {
    const { data, error } = await supabase.from('notes').insert([{ content }]).select().single();
    if (error) throw error;
    res.json({ source: 'supabase', note: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/notes/:id', async (req, res) => {
  const id = req.params.id;
  if (!supabase) {
    const idx = mockNotes.findIndex(n => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    mockNotes.splice(idx, 1);
    return res.json({ source: 'mock', ok: true });
  }
  try {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw error;
    res.json({ source: 'supabase', ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CALLS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/calls', async (_req, res) => {
  if (!supabase) return res.json({ source: 'mock', calls: mockCalls });
  try {
    const { data, error } = await supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ source: 'supabase', calls: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// OPENROUTESERVICE — 이동시간
// ═══════════════════════════════════════════════════════════════════════════
async function orsGeocode(address) {
  if (!process.env.ORS_API_KEY) throw new Error('ORS_API_KEY 미설정');
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${process.env.ORS_API_KEY}&text=${encodeURIComponent(address)}&size=1&boundary.country=CA`;
  const r = await fetch(url);
  const data = await r.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error('주소 못 찾음: ' + address);
  return { lonlat: feat.geometry.coordinates, label: feat.properties.label };
}

async function orsTravelTime(fromAddress, toAddress) {
  const [origin, dest] = await Promise.all([orsGeocode(fromAddress), orsGeocode(toAddress)]);
  const r = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations: [origin.lonlat, dest.lonlat], metrics: ['duration', 'distance'] }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const sec = data.durations?.[0]?.[1];
  const m = data.distances?.[0]?.[1];
  return {
    from: origin.label, to: dest.label,
    duration_min: sec != null ? Math.round(sec / 60) : null,
    distance_km: m != null ? +(m / 1000).toFixed(1) : null,
    note: '실시간 교통 미반영. 러시아워 +20% 권장.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH (간소화 — Realtor-OS와 동일한 패턴)
// ═══════════════════════════════════════════════════════════════════════════
function getGoogleRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/oauth/google/callback`;
}

app.get('/oauth/google/start', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).send('GOOGLE_CLIENT_ID 미설정');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(req),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid', 'email', 'profile',
    ].join(' '),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/oauth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/dashboard?gmail=error&reason=no_code');
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: getGoogleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    const tok = await r.json();
    if (tok.error) throw new Error(tok.error);
    const expires_at = Date.now() + ((tok.expires_in || 3600) * 1000);
    if (supabase) {
      await supabase.from('oauth_tokens').upsert({
        provider: 'google',
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at, updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
    } else {
      memoryTokens.google = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at };
    }
    res.redirect('/dashboard?gmail=connected');
  } catch (err) {
    res.redirect(`/dashboard?gmail=error&reason=${encodeURIComponent(err.message)}`);
  }
});

async function getValidGoogleToken() {
  let row;
  if (supabase) {
    const { data } = await supabase.from('oauth_tokens').select('*').eq('provider', 'google').single();
    row = data;
  } else { row = memoryTokens.google; }
  if (!row?.access_token) return null;
  if (row.expires_at && row.expires_at - Date.now() > 60_000) return row.access_token;
  // refresh
  if (row.refresh_token) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    const tok = await r.json();
    if (tok.access_token) {
      const newExp = Date.now() + ((tok.expires_in || 3600) * 1000);
      if (supabase) {
        await supabase.from('oauth_tokens').update({ access_token: tok.access_token, expires_at: newExp }).eq('provider', 'google');
      } else {
        memoryTokens.google = { ...memoryTokens.google, access_token: tok.access_token, expires_at: newExp };
      }
      return tok.access_token;
    }
  }
  return null;
}

async function calendarListToday() {
  const token = await getValidGoogleToken();
  if (!token) return { connected: false, events: [] };
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(now); end.setHours(23,59,59,999);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=25`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return { connected: true, events: (data.items || []).map(e => ({ id: e.id, title: e.summary || '(제목 없음)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, location: e.location || '' })) };
}

app.get('/api/calendar/today', async (_req, res) => {
  try { res.json(await calendarListToday()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/oauth/google/disconnect', async (_req, res) => {
  if (supabase) await supabase.from('oauth_tokens').delete().eq('provider', 'google');
  else delete memoryTokens.google;
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// CHAT ASSISTANT — Groq (OpenAI-호환) tool-use
// ═══════════════════════════════════════════════════════════════════════════
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

async function callGroq({ messages, tools, max_tokens = 1024, temperature = 0.3 }) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, ...(tools ? { tools, tool_choice: 'auto' } : {}), max_tokens, temperature }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

const CHAT_SYSTEM_PROMPT = `당신은 소규모 시공/수리 사업자의 AI 운영 비서입니다.

역할:
- 사장님이 현장에서도 한 번의 질의로 작업·일정·매출을 파악하게 돕는다.
- 답변은 간결하게, 이모지로 시각 정리. 마크다운 문법(**, #, -)은 쓰지 말고 줄바꿈 + 이모지.
- 모바일에서 보기 때문에 3~6줄 내로 끝낸다.
- 사용자 언어로 응답 (한국어로 물으면 한국어, English 면 English, 中文 면 中文).

규칙:
1. 작업·일정·매출·이동시간은 반드시 도구(tool)로 조회. 추측 금지.
2. 매출/비용 합계는 get_revenue_summary 호출 결과만 사용.
3. 잡 상태 변경, 일정 등록 같은 쓰기 작업은 항상 2단계: 요약 후 사용자 확인 → 명시적 "네/OK/Yes" 후에만 실행.
4. 이동시간은 get_travel_time. ORS 무료티어라 실시간 교통 미반영 — 러시아워 +20% 권고.
5. 모르는 건 솔직히 "데이터 없음"이라고 답한다.

상태 코드 (status): lead(문의), quoted(견적), scheduled(예약), in_progress(진행 중), completed(완료), cancelled(취소).`;

const CHAT_TOOLS = [
  { name: 'list_jobs', description: '잡(공사) 목록 조회. status/trade_type 필터 가능.', input_schema: { type: 'object', properties: { status: { type: 'string', description: 'lead|quoted|scheduled|in_progress|completed|cancelled' }, trade_type: { type: 'string' }, limit: { type: 'integer', default: 20 } } } },
  { name: 'search_job', description: '제목·고객명·주소로 잡 검색.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'update_job_status', description: '잡 상태 변경. job_id + new_status. 사용자 확인 후에만.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, new_status: { type: 'string' } }, required: ['job_id', 'new_status'] } },
  { name: 'create_job', description: '신규 잡 등록. 사용자 확인 후에만.', input_schema: { type: 'object', properties: { title: { type: 'string' }, client_name: { type: 'string' }, client_phone: { type: 'string' }, address: { type: 'string' }, trade_type: { type: 'string' }, status: { type: 'string', default: 'lead' }, expected_revenue: { type: 'number' }, expected_cost: { type: 'number' }, crew_size: { type: 'integer' }, scheduled_start: { type: 'string', description: 'ISO 8601' }, scheduled_end: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } },
  { name: 'get_revenue_summary', description: '이번 달 잡 단위 예상 매출/비용 합계.', input_schema: { type: 'object', properties: {} } },
  { name: 'list_crew', description: '인력 명부 조회.', input_schema: { type: 'object', properties: {} } },
  { name: 'assign_crew', description: '잡에 인력 배정 (assigned_crew 필드 갱신). 사용자 확인 후에만.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, crew_names: { type: 'string', description: '쉼표로 구분 (예: "Mike, Joon")' } }, required: ['job_id', 'crew_names'] } },
  { name: 'get_today_schedule', description: '오늘 구글 캘린더 일정.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_travel_time', description: '두 주소 간 운전 이동시간.', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'add_note', description: '메모 추가.', input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } },
  { name: 'get_notes', description: '메모 조회.', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
];

function mkToolImpl() {
  return {
    async list_jobs({ status, trade_type, limit = 20 } = {}) {
      if (supabase) {
        let q = supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(limit);
        if (status) q = q.eq('status', status);
        if (trade_type) q = q.eq('trade_type', trade_type);
        const { data, error } = await q;
        if (error) throw error;
        return { count: (data || []).length, jobs: data || [] };
      }
      let list = [...mockJobs];
      if (status) list = list.filter(j => j.status === status);
      if (trade_type) list = list.filter(j => j.trade_type === trade_type);
      return { count: list.slice(0, limit).length, jobs: list.slice(0, limit) };
    },
    async search_job({ query }) {
      const q = String(query || '').toLowerCase();
      if (supabase) {
        const { data, error } = await supabase.from('jobs').select('*').or(`title.ilike.%${q}%,client_name.ilike.%${q}%,address.ilike.%${q}%`).limit(10);
        if (error) throw error;
        return { count: (data || []).length, jobs: data || [] };
      }
      const list = mockJobs.filter(j => `${j.title} ${j.client_name||''} ${j.address||''}`.toLowerCase().includes(q));
      return { count: list.length, jobs: list };
    },
    async update_job_status({ job_id, new_status }) {
      const valid = ['lead','quoted','scheduled','in_progress','completed','cancelled'];
      if (!valid.includes(new_status)) return { ok: false, error: 'status 값 오류' };
      if (supabase) {
        const { data, error } = await supabase.from('jobs').update({ status: new_status, updated_at: new Date().toISOString() }).eq('id', job_id).select().single();
        if (error) throw error;
        return { ok: true, job: data };
      }
      const idx = mockJobs.findIndex(j => j.id === job_id);
      if (idx === -1) return { ok: false, error: '잡 못 찾음' };
      mockJobs[idx] = { ...mockJobs[idx], status: new_status, updated_at: new Date().toISOString() };
      return { ok: true, job: mockJobs[idx] };
    },
    async create_job(payload) {
      if (!payload.title) return { ok: false, error: 'title 필요' };
      if (supabase) {
        const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
        if (error) throw error;
        return { ok: true, job: data };
      }
      const row = { id: genMockId(), status: 'lead', ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockJobs.unshift(row);
      return { ok: true, job: row };
    },
    async get_revenue_summary() {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const list = supabase
        ? (await supabase.from('jobs').select('expected_revenue, expected_cost, status').gte('created_at', monthStart)).data || []
        : mockJobs.filter(j => (j.created_at || '') >= monthStart);
      const sum = (key, sf) => list.filter(j => !sf || sf.includes(j.status)).reduce((s, j) => s + (Number(j[key]) || 0), 0);
      return {
        month_revenue_pipeline: sum('expected_revenue'),
        month_revenue_in_progress: sum('expected_revenue', ['in_progress', 'completed']),
        month_cost_estimated: sum('expected_cost'),
        job_count: list.length,
      };
    },
    async list_crew() {
      if (supabase) {
        const { data, error } = await supabase.from('crew').select('*').order('name');
        if (error) throw error;
        return { count: (data || []).length, crew: data || [] };
      }
      return { count: mockCrew.length, crew: mockCrew };
    },
    async assign_crew({ job_id, crew_names }) {
      if (supabase) {
        const { data, error } = await supabase.from('jobs').update({ assigned_crew: crew_names, updated_at: new Date().toISOString() }).eq('id', job_id).select().single();
        if (error) throw error;
        return { ok: true, job: data };
      }
      const idx = mockJobs.findIndex(j => j.id === job_id);
      if (idx === -1) return { ok: false, error: '잡 못 찾음' };
      mockJobs[idx] = { ...mockJobs[idx], assigned_crew: crew_names, updated_at: new Date().toISOString() };
      return { ok: true, job: mockJobs[idx] };
    },
    async get_today_schedule() {
      try { return await calendarListToday(); }
      catch (err) { return { connected: false, error: err.message, events: [] }; }
    },
    async get_travel_time({ from, to }) {
      try { return await orsTravelTime(from, to); }
      catch (err) { return { error: err.message }; }
    },
    async add_note({ content }) {
      if (!content?.trim()) return { ok: false, error: '내용 비어있음' };
      if (supabase) {
        const { data, error } = await supabase.from('notes').insert([{ content }]).select().single();
        if (error) throw error;
        return { ok: true, note: data };
      }
      const row = { id: genMockId(), content, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockNotes.unshift(row);
      return { ok: true, note: row };
    },
    async get_notes({ query } = {}) {
      if (supabase) {
        let q = supabase.from('notes').select('*').order('updated_at', { ascending: false }).limit(20);
        if (query) q = q.ilike('content', `%${query}%`);
        const { data, error } = await q;
        if (error) throw error;
        return { count: (data || []).length, notes: data || [] };
      }
      let list = mockNotes;
      if (query) list = list.filter(n => (n.content || '').includes(query));
      return { count: list.length, notes: list };
    },
  };
}

const CHAT_TOOLS_OAI = CHAT_TOOLS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function runChatTurn(messages) {
  const impl = mkToolImpl();
  let conversation = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...messages.filter(m => m.role !== 'system')];
  for (let i = 0; i < 6; i++) {
    const data = await callGroq({ messages: conversation, tools: CHAT_TOOLS_OAI });
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Groq 응답 없음');
    conversation.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let result;
        try {
          const fn = impl[tc.function.name];
          if (!fn) throw new Error('unknown tool: ' + tc.function.name);
          result = await fn(JSON.parse(tc.function.arguments || '{}'));
        } catch (err) { result = { error: String(err.message || err) }; }
        conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
      continue;
    }
    return { reply: (msg.content || '').trim() || '(응답 없음)', conversation: conversation.filter(m => m.role !== 'system') };
  }
  return { reply: '응답이 너무 많은 단계를 거쳤어요.', conversation: conversation.filter(m => m.role !== 'system') };
}

app.post('/api/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY 필요' });
  let messages = Array.isArray(req.body?.messages) && req.body.messages.length ? req.body.messages
               : req.body?.message ? [{ role: 'user', content: req.body.message }] : null;
  if (!messages) return res.status(400).json({ error: '메시지 필요' });
  try {
    const r = await runChatTurn(messages);
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOICE INPUT (Whisper)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/transcribe', async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY 필요' });
  try {
    const { audio, mime } = req.body || {};
    if (!audio) return res.status(400).json({ error: '오디오 없음' });
    const buffer = Buffer.from(audio, 'base64');
    const form = new FormData();
    const ext = (mime || '').includes('ogg') ? 'ogg' : (mime || '').includes('mp4') ? 'mp4' : 'webm';
    form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ text: data.text || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
app.get('/dashboard', (_req, res) => {
  res.type('html').send(getDashboardHTML());
});

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trades-OS</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK SC", sans-serif; }
  .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .status-lead { background: #fef3c7; color: #92400e; }
  .status-quoted { background: #dbeafe; color: #1e40af; }
  .status-scheduled { background: #e0e7ff; color: #3730a3; }
  .status-in_progress { background: #fed7aa; color: #9a3412; }
  .status-completed { background: #d1fae5; color: #065f46; }
  .status-cancelled { background: #f3f4f6; color: #6b7280; }
</style>
</head>
<body class="bg-slate-100 min-h-screen">

<div class="max-w-7xl mx-auto p-4">
  <header class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-800" id="hdr-title">Trades-OS</h1>
      <p class="text-sm text-slate-500" id="hdr-date"></p>
    </div>
    <div class="flex items-center gap-2">
      <select id="lang-select" class="text-sm border rounded px-2 py-1 bg-white">
        <option value="ko">한국어</option>
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
      <span id="db-status" class="text-xs px-2 py-1 rounded">·</span>
      <button id="btn-google" onclick="connectGoogle()" class="text-xs px-3 py-1.5 rounded bg-red-500 text-white hover:bg-red-600">Gmail 연결</button>
      <button onclick="loadAll()" class="text-sm px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-700">🔄</button>
    </div>
  </header>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- 왼쪽 -->
    <div class="space-y-4">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-revenue">이번 달 매출</h2>
        </div>
        <div id="revenue-box" class="space-y-2 text-sm">
          <p class="text-slate-400">로딩...</p>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-schedule">📅 오늘 일정</h2>
        </div>
        <ul id="schedule-list" class="space-y-2 text-sm text-slate-700"></ul>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-calls">📞 부재중 통화</h2>
          <span id="calls-count" class="text-xs text-slate-400"></span>
        </div>
        <ul id="calls-list" class="space-y-2 text-sm text-slate-700"></ul>
      </div>
    </div>

    <!-- 가운데/오른쪽 (잡 섹션 2칸) -->
    <div class="md:col-span-2 space-y-4">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-newjobs">🟡 신규 의뢰</h2>
          <button onclick="openJobModal()" class="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" id="t-add">+ 추가</button>
        </div>
        <div id="newjobs-list" class="space-y-2 text-sm"></div>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-active">🔨 진행 중</h2>
        </div>
        <div id="active-list" class="space-y-2 text-sm"></div>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-scheduled">📌 예약 / 견적</h2>
        </div>
        <div id="scheduled-list" class="space-y-2 text-sm"></div>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold" id="t-notes">📝 메모</h2>
        </div>
        <div class="flex gap-2 mb-3">
          <input id="note-input" placeholder="메모 추가..." class="flex-1 border rounded px-2 py-1 text-sm">
          <button onclick="addNote()" class="text-xs px-3 py-1 rounded bg-slate-700 text-white" id="t-add2">+ 추가</button>
        </div>
        <ul id="notes-list" class="space-y-2 text-sm"></ul>
      </div>
    </div>
  </div>
</div>

<!-- 챗 위젯 -->
<button id="chat-toggle" onclick="toggleChat()" class="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl">💬</button>

<div id="chat-panel" class="hidden fixed bottom-20 right-5 z-40 w-96 max-w-[calc(100vw-2.5rem)] h-[32rem] card flex flex-col overflow-hidden">
  <div class="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
    <div>
      <div class="font-semibold" id="t-chat-title">🤖 AI 비서</div>
      <div class="text-xs opacity-80" id="t-chat-sub">잡·일정·매출 질의</div>
    </div>
    <div class="flex gap-2 items-center">
      <button id="chat-pin" onclick="toggleChatPin()" title="고정" class="text-base bg-white/20 hover:bg-white/30 px-2 py-1 rounded">📌</button>
      <button onclick="resetChat()" class="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded" id="t-reset">초기화</button>
      <button onclick="toggleChat()" class="text-lg">✕</button>
    </div>
  </div>
  <div id="chat-messages" class="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 text-sm"></div>
  <form id="chat-form" class="border-t p-2 flex gap-2 bg-white items-stretch">
    <button type="button" id="chat-mic" title="음성" class="px-3 rounded bg-slate-100 hover:bg-slate-200 text-lg">🎤</button>
    <textarea id="chat-input" rows="1" placeholder="..." class="flex-1 border rounded px-2 py-1.5 text-sm resize-none"></textarea>
    <button type="submit" id="chat-send" class="px-3 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm" id="t-send">전송</button>
  </form>
</div>

<!-- 잡 모달 -->
<div id="job-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-4">
      <h3 id="job-modal-title" class="font-semibold text-slate-800">잡 추가</h3>
      <button onclick="closeJobModal()" class="text-slate-400 hover:text-slate-700">✕</button>
    </div>
    <form id="job-form" class="space-y-3 text-sm">
      <input type="hidden" id="j-id">
      <div><label class="text-xs text-slate-500" id="lab-title">작업명 *</label><input id="j-title" required class="w-full border rounded px-2 py-1.5"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs text-slate-500" id="lab-client">고객</label><input id="j-client" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-phone">연락처</label><input id="j-phone" class="w-full border rounded px-2 py-1.5"></div>
        <div class="col-span-2"><label class="text-xs text-slate-500" id="lab-address">주소</label><input id="j-address" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-trade">유형</label>
          <select id="j-trade" class="w-full border rounded px-2 py-1.5">
            <option value="">-</option><option>핸디맨</option><option>시공</option><option>전기</option><option>배관</option><option>HVAC</option><option>청소</option><option>조경</option><option>기타</option>
          </select>
        </div>
        <div><label class="text-xs text-slate-500" id="lab-status">상태</label>
          <select id="j-status" class="w-full border rounded px-2 py-1.5">
            <option value="lead">lead</option><option value="quoted">quoted</option><option value="scheduled">scheduled</option><option value="in_progress">in_progress</option><option value="completed">completed</option><option value="cancelled">cancelled</option>
          </select>
        </div>
        <div><label class="text-xs text-slate-500" id="lab-revenue">예상 매출</label><input id="j-revenue" type="number" step="0.01" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-cost">예상 비용</label><input id="j-cost" type="number" step="0.01" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-crewsize">투입 인원</label><input id="j-crewsize" type="number" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-crew">배정</label><input id="j-crew" placeholder="Mike, Joon" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-start">시작일</label><input id="j-start" type="datetime-local" class="w-full border rounded px-2 py-1.5"></div>
        <div><label class="text-xs text-slate-500" id="lab-end">종료 예정</label><input id="j-end" type="datetime-local" class="w-full border rounded px-2 py-1.5"></div>
      </div>
      <div><label class="text-xs text-slate-500" id="lab-desc">상세</label><textarea id="j-desc" rows="3" class="w-full border rounded px-2 py-1.5"></textarea></div>
      <div class="flex justify-between pt-2">
        <button type="button" id="j-btn-delete" onclick="deleteJob()" class="hidden text-sm px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100">삭제</button>
        <div class="flex gap-2 ml-auto">
          <button type="button" onclick="closeJobModal()" class="text-sm px-3 py-1.5 rounded bg-slate-100 text-slate-700">취소</button>
          <button type="submit" class="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">저장</button>
        </div>
      </div>
    </form>
  </div>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════
// I18N — 단어 번역이 아니라 각 언어권 사장님이 일상으로 쓰는 표현
// ═══════════════════════════════════════════════════════════════════════════
const I18N = {
  ko: {
    title: 'Trades-OS',
    revenue: '이번 달 매출', schedule: '📅 오늘 일정', calls: '📞 부재중 통화',
    newjobs: '🟡 신규 의뢰', active: '🔨 진행 중', scheduled: '📌 예약 / 견적',
    notes: '📝 메모', add: '+ 추가', addNote: '+ 추가',
    chatTitle: '🤖 AI 비서', chatSub: '잡·일정·매출 질의',
    chatPlaceholder: '예: 오늘 진행 중인 작업, Smith 댁 일정',
    reset: '초기화', send: '전송',
    gmailConnect: 'Gmail 연결', gmailConnected: 'Gmail 연결됨',
    dbConnected: 'DB 연결됨', dbMock: '샘플 데이터',
    statusLabels: { lead: '문의', quoted: '견적', scheduled: '예약', in_progress: '진행중', completed: '완료', cancelled: '취소' },
    fields: { title: '작업명 *', client: '고객', phone: '연락처', address: '주소', trade: '유형', status: '상태', revenue: '예상 매출', cost: '예상 비용', crewSize: '투입 인원', crew: '배정', start: '시작일', end: '종료 예정', desc: '상세' },
    pipeline: '파이프라인', inProgress: '진행중·완료', cost: '예상 비용', jobsThisMonth: '이번 달 잡',
    addJob: '잡 추가', editJob: '잡 수정',
    welcome: '안녕하세요! 사장님 무엇을 도와드릴까요?\\n\\n예시:\\n• 오늘 진행 중인 작업\\n• Smith 댁 일정\\n• 이번 달 매출 합계\\n• 전기 작업만 보여줘',
  },
  en: {
    title: 'Trades-OS',
    revenue: 'Monthly Revenue', schedule: '📅 Today\\'s Schedule', calls: '📞 Missed Calls',
    newjobs: '🟡 New Requests', active: '🔨 In Progress', scheduled: '📌 Scheduled / Quoted',
    notes: '📝 Notes', add: '+ Add', addNote: '+ Add',
    chatTitle: '🤖 AI Assistant', chatSub: 'Jobs · Schedule · Revenue',
    chatPlaceholder: 'e.g., Active jobs today, Smith schedule',
    reset: 'Reset', send: 'Send',
    gmailConnect: 'Connect Gmail', gmailConnected: 'Gmail Connected',
    dbConnected: 'DB Connected', dbMock: 'Sample Data',
    statusLabels: { lead: 'Lead', quoted: 'Quoted', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' },
    fields: { title: 'Job Title *', client: 'Customer', phone: 'Phone', address: 'Address', trade: 'Type', status: 'Status', revenue: 'Est. Revenue', cost: 'Est. Cost', crewSize: 'Crew Size', crew: 'Assigned', start: 'Start Date', end: 'Est. Completion', desc: 'Details' },
    pipeline: 'Pipeline', inProgress: 'In Progress · Completed', cost: 'Est. Cost', jobsThisMonth: 'Jobs This Month',
    addJob: 'Add Job', editJob: 'Edit Job',
    welcome: 'Hi! How can I help today?\\n\\nExamples:\\n• Active jobs today\\n• Smith schedule\\n• Monthly revenue total\\n• Show electrical jobs only',
  },
  zh: {
    title: 'Trades-OS',
    revenue: '本月收入', schedule: '📅 今日排期', calls: '📞 未接来电',
    newjobs: '🟡 新订单', active: '🔨 施工中', scheduled: '📌 已排期 / 已报价',
    notes: '📝 备忘录', add: '+ 添加', addNote: '+ 添加',
    chatTitle: '🤖 AI 助理', chatSub: '工程·排期·收入',
    chatPlaceholder: '例如：今日施工中工程、Smith 家排期',
    reset: '重置', send: '发送',
    gmailConnect: '连接 Gmail', gmailConnected: 'Gmail 已连接',
    dbConnected: '数据库已连接', dbMock: '示例数据',
    statusLabels: { lead: '询价', quoted: '已报价', scheduled: '已排期', in_progress: '施工中', completed: '已完成', cancelled: '已取消' },
    fields: { title: '工程名 *', client: '客户', phone: '电话', address: '地址', trade: '类型', status: '状态', revenue: '预计收入', cost: '预计成本', crewSize: '人手', crew: '人员', start: '开工日期', end: '预计完工', desc: '详细描述' },
    pipeline: '在途总额', inProgress: '施工·完工', cost: '预计成本', jobsThisMonth: '本月工程',
    addJob: '添加工程', editJob: '编辑工程',
    welcome: '您好！请问有什么可以帮您？\\n\\n例如：\\n• 今日施工中工程\\n• Smith 家排期\\n• 本月收入合计\\n• 只看电工工程',
  },
};

let LANG = localStorage.getItem('trades-lang') || 'ko';
function t() { return I18N[LANG] || I18N.ko; }

function applyI18n() {
  const T = t();
  document.documentElement.lang = LANG;
  document.title = T.title;
  document.getElementById('hdr-title').textContent = T.title;
  document.getElementById('t-revenue').textContent = T.revenue;
  document.getElementById('t-schedule').textContent = T.schedule;
  document.getElementById('t-calls').textContent = T.calls;
  document.getElementById('t-newjobs').textContent = T.newjobs;
  document.getElementById('t-active').textContent = T.active;
  document.getElementById('t-scheduled').textContent = T.scheduled;
  document.getElementById('t-notes').textContent = T.notes;
  document.getElementById('t-add').textContent = T.add;
  document.getElementById('t-add2').textContent = T.addNote;
  document.getElementById('t-chat-title').textContent = T.chatTitle;
  document.getElementById('t-chat-sub').textContent = T.chatSub;
  document.getElementById('t-reset').textContent = T.reset;
  document.getElementById('chat-input').placeholder = T.chatPlaceholder;
  document.getElementById('btn-google').textContent = T.gmailConnect;
  document.getElementById('lab-title').textContent = T.fields.title;
  document.getElementById('lab-client').textContent = T.fields.client;
  document.getElementById('lab-phone').textContent = T.fields.phone;
  document.getElementById('lab-address').textContent = T.fields.address;
  document.getElementById('lab-trade').textContent = T.fields.trade;
  document.getElementById('lab-status').textContent = T.fields.status;
  document.getElementById('lab-revenue').textContent = T.fields.revenue;
  document.getElementById('lab-cost').textContent = T.fields.cost;
  document.getElementById('lab-crewsize').textContent = T.fields.crewSize;
  document.getElementById('lab-crew').textContent = T.fields.crew;
  document.getElementById('lab-start').textContent = T.fields.start;
  document.getElementById('lab-end').textContent = T.fields.end;
  document.getElementById('lab-desc').textContent = T.fields.desc;

  const dateOpts = { weekday: 'short', month: 'numeric', day: 'numeric' };
  document.getElementById('hdr-date').textContent = new Date().toLocaleDateString(LANG === 'en' ? 'en-CA' : LANG === 'zh' ? 'zh-CN' : 'ko-KR', dateOpts);
}

document.getElementById('lang-select').value = LANG;
document.getElementById('lang-select').addEventListener('change', (ev) => {
  LANG = ev.target.value;
  localStorage.setItem('trades-lang', LANG);
  applyI18n();
  loadAll();
});

// ═══════════════════════════════════════════════════════════════════════════
// API helpers
// ═══════════════════════════════════════════════════════════════════════════
async function api(p, opts = {}) {
  const r = await fetch(p, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error('API ' + r.status);
  return r.json();
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function fmt$(n) {
  if (n == null) return '-';
  return '$' + Number(n).toLocaleString(LANG === 'en' ? 'en-CA' : LANG === 'zh' ? 'zh-CN' : 'ko-KR', { maximumFractionDigits: 0 });
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(LANG === 'en' ? 'en-CA' : LANG === 'zh' ? 'zh-CN' : 'ko-KR', { month: 'numeric', day: 'numeric' });
}

function statusBadge(status) {
  const T = t();
  const label = T.statusLabels[status] || status;
  return \`<span class="text-[11px] px-1.5 py-0.5 rounded status-\${status}">\${esc(label)}</span>\`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 매출 요약
// ═══════════════════════════════════════════════════════════════════════════
async function loadRevenue() {
  const T = t();
  const box = document.getElementById('revenue-box');
  try {
    const r = await api('/api/jobs/revenue-summary');
    box.innerHTML = \`
      <div class="flex justify-between"><span class="text-slate-500">\${T.pipeline}</span><span class="font-semibold">\${fmt$(r.month_revenue_pipeline)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">\${T.inProgress}</span><span class="font-semibold text-green-600">\${fmt$(r.month_revenue_in_progress)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">\${T.cost}</span><span class="text-red-600">\${fmt$(r.month_cost_estimated)}</span></div>
      <div class="flex justify-between text-xs pt-1 border-t mt-1"><span class="text-slate-500">\${T.jobsThisMonth}</span><span>\${r.job_count}</span></div>
    \`;
    document.getElementById('db-status').textContent = r.source === 'supabase' ? '🟢 ' + T.dbConnected : '🟡 ' + T.dbMock;
    document.getElementById('db-status').className = 'text-xs px-2 py-1 rounded ' + (r.source === 'supabase' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800');
  } catch (e) {
    box.innerHTML = '<p class="text-red-500 text-xs">' + esc(e.message) + '</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 잡 섹션
// ═══════════════════════════════════════════════════════════════════════════
function jobCard(j) {
  const T = t();
  const lines = [];
  lines.push(\`<div class="flex items-center gap-2 mb-1"><span class="font-medium">\${esc(j.title)}</span> \${statusBadge(j.status)} \${j.trade_type ? \`<span class="text-xs text-slate-500">· \${esc(j.trade_type)}</span>\` : ''}</div>\`);
  if (j.client_name || j.address) lines.push(\`<div class="text-xs text-slate-600">\${esc(j.client_name || '-')} · \${esc(j.address || '-')}</div>\`);
  if (j.expected_revenue || j.scheduled_start) {
    const parts = [];
    if (j.expected_revenue) parts.push(\`💰 \${fmt$(j.expected_revenue)}\`);
    if (j.crew_size) parts.push(\`👥 \${j.crew_size}\`);
    if (j.assigned_crew) parts.push(\`(\${esc(j.assigned_crew)})\`);
    if (j.scheduled_start) parts.push(\`📅 \${fmtDate(j.scheduled_start)}\${j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ' ~ ' + fmtDate(j.scheduled_end) : ''}\`);
    lines.push(\`<div class="text-xs text-slate-700">\${parts.join(' · ')}</div>\`);
  }
  if (j.description) lines.push(\`<div class="text-xs text-slate-500 truncate">\${esc(j.description)}</div>\`);

  return \`<div class="border border-slate-200 rounded-lg p-2.5 hover:bg-slate-50 cursor-pointer" onclick='editJob(\${JSON.stringify(j).replace(/"/g, "&quot;")})'>\${lines.join('')}</div>\`;
}

async function loadJobs() {
  try {
    const r = await api('/api/jobs');
    const all = r.jobs || [];

    const newJobs = all.filter(j => j.status === 'lead');
    const active = all.filter(j => j.status === 'in_progress');
    const sched = all.filter(j => j.status === 'scheduled' || j.status === 'quoted');

    const empty = '<p class="text-slate-400 text-xs">—</p>';
    document.getElementById('newjobs-list').innerHTML = newJobs.length ? newJobs.map(jobCard).join('') : empty;
    document.getElementById('active-list').innerHTML = active.length ? active.map(jobCard).join('') : empty;
    document.getElementById('scheduled-list').innerHTML = sched.length ? sched.map(jobCard).join('') : empty;
  } catch (e) {
    console.error('jobs load failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 잡 모달
// ═══════════════════════════════════════════════════════════════════════════
function openJobModal(j) {
  const T = t();
  document.getElementById('job-modal').classList.remove('hidden');
  if (j) {
    document.getElementById('job-modal-title').textContent = T.editJob;
    document.getElementById('j-btn-delete').classList.remove('hidden');
    document.getElementById('j-id').value = j.id || '';
    document.getElementById('j-title').value = j.title || '';
    document.getElementById('j-client').value = j.client_name || '';
    document.getElementById('j-phone').value = j.client_phone || '';
    document.getElementById('j-address').value = j.address || '';
    document.getElementById('j-trade').value = j.trade_type || '';
    document.getElementById('j-status').value = j.status || 'lead';
    document.getElementById('j-revenue').value = j.expected_revenue || '';
    document.getElementById('j-cost').value = j.expected_cost || '';
    document.getElementById('j-crewsize').value = j.crew_size || '';
    document.getElementById('j-crew').value = j.assigned_crew || '';
    document.getElementById('j-start').value = j.scheduled_start ? j.scheduled_start.slice(0, 16) : '';
    document.getElementById('j-end').value = j.scheduled_end ? j.scheduled_end.slice(0, 16) : '';
    document.getElementById('j-desc').value = j.description || '';
  } else {
    document.getElementById('job-modal-title').textContent = T.addJob;
    document.getElementById('j-btn-delete').classList.add('hidden');
    document.getElementById('job-form').reset();
    document.getElementById('j-id').value = '';
    document.getElementById('j-status').value = 'lead';
  }
}
function closeJobModal() { document.getElementById('job-modal').classList.add('hidden'); }
function editJob(j) { openJobModal(j); }

document.getElementById('job-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('j-id').value;
  const payload = {
    title: document.getElementById('j-title').value,
    client_name: document.getElementById('j-client').value || null,
    client_phone: document.getElementById('j-phone').value || null,
    address: document.getElementById('j-address').value || null,
    trade_type: document.getElementById('j-trade').value || null,
    status: document.getElementById('j-status').value,
    expected_revenue: parseFloat(document.getElementById('j-revenue').value) || null,
    expected_cost: parseFloat(document.getElementById('j-cost').value) || null,
    crew_size: parseInt(document.getElementById('j-crewsize').value) || null,
    assigned_crew: document.getElementById('j-crew').value || null,
    scheduled_start: document.getElementById('j-start').value ? new Date(document.getElementById('j-start').value).toISOString() : null,
    scheduled_end: document.getElementById('j-end').value ? new Date(document.getElementById('j-end').value).toISOString() : null,
    description: document.getElementById('j-desc').value || null,
  };
  try {
    if (id) {
      await api('/api/jobs/' + id, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeJobModal();
    loadAll();
  } catch (e) { alert('저장 실패: ' + e.message); }
});

async function deleteJob() {
  const id = document.getElementById('j-id').value;
  if (!id || !confirm('정말 삭제할까요?')) return;
  try {
    await api('/api/jobs/' + id, { method: 'DELETE' });
    closeJobModal();
    loadAll();
  } catch (e) { alert('삭제 실패: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 메모, 통화, 일정
// ═══════════════════════════════════════════════════════════════════════════
async function loadNotes() {
  try {
    const r = await api('/api/notes');
    const ul = document.getElementById('notes-list');
    if (!r.notes.length) { ul.innerHTML = '<p class="text-slate-400 text-xs">—</p>'; return; }
    ul.innerHTML = r.notes.slice(0, 10).map(n => \`
      <li class="flex items-start gap-2 group">
        <div class="flex-1">\${esc(n.content)}<div class="text-xs text-slate-400">\${fmtDate(n.created_at)}</div></div>
        <button onclick="delNote('\${n.id}')" class="opacity-0 group-hover:opacity-100 text-xs text-red-500">✕</button>
      </li>\`).join('');
  } catch (e) {}
}

async function addNote() {
  const input = document.getElementById('note-input');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('/api/notes', { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
    loadNotes();
  } catch (e) { alert(e.message); }
}

async function delNote(id) {
  if (!confirm('삭제할까요?')) return;
  try {
    await api('/api/notes/' + id, { method: 'DELETE' });
    loadNotes();
  } catch (e) {}
}

async function loadCalls() {
  try {
    const r = await api('/api/calls');
    document.getElementById('calls-count').textContent = (r.calls || []).length + '';
    const ul = document.getElementById('calls-list');
    if (!r.calls.length) { ul.innerHTML = '<p class="text-slate-400 text-xs">—</p>'; return; }
    ul.innerHTML = r.calls.slice(0, 6).map(c => \`
      <li>
        <div class="font-medium text-xs">\${esc(c.caller || '-')} \${c.language ? \`<span class="text-[10px] text-slate-400">[\${c.language}]</span>\` : ''}</div>
        <div class="text-xs text-slate-600">\${esc(c.summary || '-')}</div>
        <div class="text-[11px] text-slate-400">\${fmtDate(c.created_at)} · \${Math.round((c.duration_sec || 0) / 60)}분</div>
      </li>\`).join('');
  } catch (e) {}
}

async function loadSchedule() {
  try {
    const r = await api('/api/calendar/today');
    const ul = document.getElementById('schedule-list');
    if (!r.connected) { ul.innerHTML = '<li class="text-slate-400 text-xs">Gmail 연결 후 표시</li>'; return; }
    if (!r.events?.length) { ul.innerHTML = '<li class="text-slate-400 text-xs">오늘 일정 없음</li>'; return; }
    ul.innerHTML = r.events.map(e => {
      const time = e.start ? new Date(e.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
      return \`<li><span class="text-xs font-mono text-slate-500">\${time}</span> \${esc(e.title)}\${e.location ? \` <span class="text-xs text-slate-400">@ \${esc(e.location)}</span>\` : ''}</li>\`;
    }).join('');
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// Google
// ═══════════════════════════════════════════════════════════════════════════
function connectGoogle() { window.location.href = '/oauth/google/start'; }

// ═══════════════════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════════════════
let chatHistory = [];
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('chat-input').focus();
    if (chatHistory.length === 0) {
      renderChatMessage('assistant', t().welcome);
    }
  }
}

function resetChat() {
  chatHistory = [];
  document.getElementById('chat-messages').innerHTML = '';
  renderChatMessage('assistant', t().welcome);
}

function toggleChatPin() {
  const cur = localStorage.getItem('trades-chat-pinned') === '1';
  const next = !cur;
  localStorage.setItem('trades-chat-pinned', next ? '1' : '0');
  applyChatPinUI(next);
  if (next && document.getElementById('chat-panel').classList.contains('hidden')) toggleChat();
}

function applyChatPinUI(pinned) {
  const btn = document.getElementById('chat-pin');
  if (!btn) return;
  if (pinned) { btn.textContent = '📍'; btn.classList.remove('bg-white/20'); btn.classList.add('bg-yellow-400', 'text-slate-900'); }
  else { btn.textContent = '📌'; btn.classList.remove('bg-yellow-400', 'text-slate-900'); btn.classList.add('bg-white/20'); }
}

function renderChatMessage(role, text) {
  const wrap = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'flex ' + (role === 'user' ? 'justify-end' : 'justify-start');
  const bubble = document.createElement('div');
  bubble.className = 'max-w-[85%] px-3 py-2 rounded-2xl whitespace-pre-wrap text-sm ' +
    (role === 'user' ? 'bg-blue-600 text-white' : role === 'system' ? 'bg-red-50 text-red-700' : 'bg-white border border-slate-200');
  bubble.textContent = text;
  div.appendChild(bubble);
  wrap.appendChild(div);
  wrap.scrollTop = 99999;
}

async function sendChatMessage(text) {
  text = text.trim();
  if (!text) return;
  renderChatMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  document.getElementById('chat-send').disabled = true;
  try {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ messages: chatHistory }) });
    if (r.error) { renderChatMessage('system', r.error); chatHistory.pop(); return; }
    chatHistory = r.conversation || chatHistory;
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    renderChatMessage('assistant', r.reply || '(응답 없음)');
  } catch (e) {
    renderChatMessage('system', '오류: ' + e.message);
    chatHistory.pop();
  } finally {
    document.getElementById('chat-send').disabled = false;
  }
}

document.getElementById('chat-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value;
  input.value = '';
  sendChatMessage(text);
});
document.getElementById('chat-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    document.getElementById('chat-form').requestSubmit();
  }
});

// 음성 입력
let mediaRecorder = null, recordedChunks = [], isRecording = false;
const micBtn = document.getElementById('chat-mic');
if (!navigator.mediaDevices || !window.MediaRecorder) {
  micBtn.style.display = 'none';
} else {
  micBtn.addEventListener('click', async () => {
    if (isRecording) { mediaRecorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      recordedChunks = [];
      mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) recordedChunks.push(ev.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        isRecording = false;
        micBtn.textContent = '⏳';
        micBtn.classList.remove('bg-red-500', 'text-white', 'animate-pulse');
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        try {
          const base64 = await blobToBase64(blob);
          const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64, mime: blob.type }) });
          const data = await r.json();
          if (data.error) throw new Error(data.error);
          const input = document.getElementById('chat-input');
          input.value = (input.value ? input.value + ' ' : '') + (data.text || '').trim();
          input.focus();
        } catch (e) { renderChatMessage('system', '음성 변환 실패: ' + e.message); }
        finally { micBtn.textContent = '🎤'; }
      };
      mediaRecorder.start();
      isRecording = true;
      micBtn.textContent = '⏹';
      micBtn.classList.add('bg-red-500', 'text-white', 'animate-pulse');
    } catch (e) { renderChatMessage('system', '마이크 거부: ' + e.message); }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 핀 복원
(function restoreChatPin() {
  const pinned = localStorage.getItem('trades-chat-pinned') === '1';
  applyChatPinUI(pinned);
  if (pinned) {
    document.getElementById('chat-panel').classList.remove('hidden');
    if (chatHistory.length === 0) renderChatMessage('assistant', t().welcome);
  }
})();

// OAuth toast
(function handleOAuth() {
  const q = new URLSearchParams(window.location.search);
  const g = q.get('gmail');
  if (g === 'connected') alert(t().gmailConnected);
  else if (g === 'error') alert('Gmail error: ' + (q.get('reason') || ''));
  if (g) window.history.replaceState({}, '', '/dashboard');
})();

// ═══════════════════════════════════════════════════════════════════════════
// 초기 로드 + 30초 자동 새로고침
// ═══════════════════════════════════════════════════════════════════════════
async function loadAll() {
  await Promise.all([loadRevenue(), loadJobs(), loadNotes(), loadCalls(), loadSchedule()]);
}

applyI18n();
loadAll();
setInterval(loadAll, 30000);
</script>
</body>
</html>`;
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🛠️  Trades-OS demo on http://localhost:${PORT}/dashboard\n`);
    console.log('  GROQ:', process.env.GROQ_API_KEY ? 'set' : 'MISSING');
    console.log('  Supabase:', supabase ? 'set' : 'mock');
    console.log('  ORS:', process.env.ORS_API_KEY ? 'set' : 'MISSING');
    console.log('  Google OAuth:', process.env.GOOGLE_CLIENT_ID ? 'set' : 'MISSING\n');
  });
}

module.exports = app;
