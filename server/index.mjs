import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PORT = Number(process.env.PORT || process.env.API_PORT || 8787);
const API_HOST = process.env.API_HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.ndjson');
const EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');

await fs.mkdir(DATA_DIR, { recursive: true });

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a bit.' }
});

const eventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analytics events.' }
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Slow down and try again shortly.' }
});

const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(2).max(120),
  brandWebsite: z.string().trim().max(220).optional().default(''),
  monthlySpend: z.string().trim().min(1).max(80),
  projectBrief: z.string().trim().min(10).max(2200),
  honeypot: z.string().max(0).optional().default(''),
  formStartedAt: z.number().int().positive()
});

const eventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])).default({}),
  timestamp: z.string().datetime(),
  path: z.string().max(300)
});

const aiRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(30000),
  model: z.string().trim().min(1).max(120).default('claude-3-5-sonnet-latest'),
  maxTokens: z.number().int().positive().max(4096).default(1200),
  apiKey: z.string().trim().max(300).optional().default('')
});

const parseOpenAIResponseText = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  (payload?.output || []).forEach((item) => {
    if (item?.type !== 'message') return;
    (item?.content || []).forEach((content) => {
      if (content?.type === 'output_text' && content?.text) parts.push(content.text);
      if (content?.type === 'text' && content?.text) parts.push(content.text);
    });
  });
  return parts.join('\n').trim() || 'No response.';
};

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const leadsTo = process.env.LEADS_TO;

const transporter =
  smtpHost && smtpPort && smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })
    : null;

const appendNdjson = async (filepath, data) => {
  await fs.appendFile(filepath, `${JSON.stringify(data)}\n`, 'utf8');
};

const maybeSendLeadEmail = async (lead) => {
  if (!transporter || !leadsTo) {
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || smtpUser,
    to: leadsTo,
    subject: `New Lead: ${lead.company} (${lead.name})`,
    text: [
      `Lead ID: ${lead.leadId}`,
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Company: ${lead.company}`,
      `Website: ${lead.brandWebsite || 'n/a'}`,
      `Monthly Spend: ${lead.monthlySpend}`,
      '',
      'Brief:',
      lead.projectBrief
    ].join('\n')
  });
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/leads', leadLimiter, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid lead payload', details: parsed.error.issues });
  }

  const lead = parsed.data;

  if (lead.honeypot) {
    return res.status(202).json({ ok: true });
  }

  const elapsedMs = Date.now() - lead.formStartedAt;
  if (elapsedMs < 2000) {
    return res.status(400).json({ error: 'Submission rejected as suspicious.' });
  }

  const leadRecord = {
    leadId: `lead_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    brandWebsite: lead.brandWebsite,
    monthlySpend: lead.monthlySpend,
    projectBrief: lead.projectBrief,
    createdAt: new Date().toISOString(),
    userAgent: req.get('user-agent') || '',
    ip: req.ip || ''
  };

  try {
    await appendNdjson(LEADS_FILE, leadRecord);
    await maybeSendLeadEmail(leadRecord);
    return res.status(201).json({ ok: true, leadId: leadRecord.leadId });
  } catch (error) {
    console.error('Lead write failed', error);
    return res.status(500).json({ error: 'Could not save lead.' });
  }
});

app.post('/api/events', eventLimiter, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid event payload' });
  }

  const event = {
    ...parsed.data,
    receivedAt: new Date().toISOString(),
    ip: req.ip || '',
    userAgent: req.get('user-agent') || ''
  };

  try {
    await appendNdjson(EVENTS_FILE, event);
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('Event write failed', error);
    return res.status(500).json({ error: 'Could not save event.' });
  }
});

app.post('/api/ai/anthropic', aiLimiter, async (req, res) => {
  const parsed = aiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid AI payload', details: parsed.error.issues });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'Missing Anthropic API key.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let msg = `Anthropic error ${upstream.status}`;
      try {
        const parsedError = JSON.parse(raw);
        msg = parsedError?.error?.message || msg;
      } catch {}
      return res.status(upstream.status).json({ error: msg });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Invalid AI response format.' });
    }

    const text =
      data?.content
        ?.map((item) => (item?.type === 'text' ? item.text : ''))
        .filter(Boolean)
        .join('\n') || 'No response.';
    return res.json({ ok: true, text });
  } catch (error) {
    console.error('Anthropic proxy failed', error);
    return res.status(502).json({ error: 'AI proxy request failed.' });
  }
});

app.post('/api/ai/openai', aiLimiter, async (req, res) => {
  const parsed = aiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid AI payload', details: parsed.error.issues });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'Missing OpenAI API key.' });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: maxTokens
      })
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let msg = `OpenAI error ${upstream.status}`;
      try {
        const parsedError = JSON.parse(raw);
        msg = parsedError?.error?.message || parsedError?.error || msg;
      } catch {}
      return res.status(upstream.status).json({ error: msg });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Invalid AI response format.' });
    }

    const text = parseOpenAIResponseText(data);
    return res.json({ ok: true, text });
  } catch (error) {
    console.error('OpenAI proxy failed', error);
    return res.status(502).json({ error: 'AI proxy request failed.' });
  }
});

const server = app.listen(API_PORT, API_HOST, () => {
  console.log(`API listening on http://${API_HOST}:${API_PORT}`);
});

server.on('error', (error) => {
  console.error('API failed to start:', error);
  process.exit(1);
});
