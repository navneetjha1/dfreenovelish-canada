'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const https      = require('https');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ─────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

/* ── Data directory ─────────────────────────────────── */


const ADMIN_EMAIL = process.env.NOTIFY_EMAIL || 'info@dfreenovelish.com';
const SITE_NAME   = 'DFree Novelish';

/* ── Helpers ────────────────────────────────────────── */
function readJSON(filename) {
  return []; // Return an empty array directly without checking disk
}
function writeJSON(filename, data) {
  // Do nothing here since email notifications handle the data transfer!
}
function sanitize(str, maxLen = 2000) {
  return String(str || '').trim().replace(/[<>]/g, '').slice(0, maxLen);
}
function log(tag, data) {
  console.log(`[${new Date().toISOString()}] [${tag}]`, JSON.stringify(data));
}

/* ── Email (nodemailer) ─────────────────────────────── */
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls:    { rejectUnauthorized: false }
    });
    console.log('[Email] SMTP configured — live email mode.');
  } else {
    console.log('[Email] SMTP not configured — log-only mode. Set SMTP_USER/SMTP_PASS in .env');
  }
} catch (e) {
  console.log('[Email] nodemailer not installed — log-only mode.');
}

function buildEmailHTML(title, rows) {
  const rowsHTML = rows.map(([k, v]) =>
    `<tr>
       <td style="padding:10px 16px;font-weight:600;color:#8b92a5;font-size:13px;border-bottom:1px solid #1a1a1e;white-space:nowrap;width:160px;">${k}</td>
       <td style="padding:10px 16px;color:#ffffff;font-size:13px;border-bottom:1px solid #1a1a1e;">${String(v || '—').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
     </tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#07070a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
  <table width="600" style="background:#0f1014;border:1px solid #1a1a1e;border-radius:16px;overflow:hidden;">
    <tr><td style="background:linear-gradient(135deg,#C49A3C,#8A6A1E);padding:28px 40px;">
      <h1 style="margin:0;color:#080808;font-size:22px;font-weight:700;">${SITE_NAME}</h1>
      <p style="margin:6px 0 0;color:rgba(8,8,8,0.75);font-size:14px;">${title}</p>
    </td></tr>
    <tr><td style="padding:32px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1a1a1e;border-radius:8px;overflow:hidden;">
        ${rowsHTML}
      </table>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #1a1a1e;text-align:center;">
      <p style="margin:0;color:#8b92a5;font-size:12px;">${SITE_NAME} • ${ADMIN_EMAIL}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function sendEmail(to, subject, html) {
  if (transporter) {
    try {
      await transporter.sendMail({
        from:    `"${SITE_NAME}" <${process.env.SMTP_USER}>`,
        to, subject, html
      });
      log('Email:SENT', { to, subject });
    } catch (err) {
      log('Email:ERROR', { to, subject, error: err.message });
    }
  } else {
    log('Email:LOG', { to, subject });
  }
}

/* ══════════════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════════════ */

/* ── Health check ── */
app.get('/api/health', (req, res) => {
  const groqConfigured  = !!(process.env.GROQ_API_KEY || '').trim();
  const smtpConfigured  = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    status:   'ok',
    timestamp: new Date().toISOString(),
    groq:  groqConfigured  ? 'configured' : 'not configured (chatbot disabled)',
    email: smtpConfigured  ? 'configured' : 'log-only mode'
  });
});

/* ── Contact form ── */
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, service, phone, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ success: false, message: 'First name, email and message are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  const entry = {
    id:          Date.now(),
    firstName:   sanitize(firstName, 100),
    lastName:    sanitize(lastName,  100),
    email:       sanitize(email, 200).toLowerCase(),
    service:     sanitize(service,  200),
    phone:       sanitize(phone,    50),
    message:     sanitize(message,  3000),
    submittedAt: new Date().toISOString(),
    ip:          req.ip
  };

  const contacts = readJSON('contacts.json');
  contacts.push(entry);
  writeJSON('contacts.json', contacts);
  log('Contact:NEW', { id: entry.id, name: `${entry.firstName} ${entry.lastName}`, email: entry.email, service: entry.service });

  // Admin notification
  await sendEmail(
    ADMIN_EMAIL,
    `📬 New Contact — ${entry.firstName} ${entry.lastName} (${entry.service || 'General'})`,
    buildEmailHTML('New Contact Form Submission', [
      ['Name',     `${entry.firstName} ${entry.lastName}`],
      ['Email',    entry.email],
      ['Phone',    entry.phone],
      ['Service',  entry.service],
      ['Message',  entry.message],
      ['Ref ID',   `DN-${entry.id}`],
      ['Time',     new Date(entry.submittedAt).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})]
    ])
  );

  // Auto-reply to user
  await sendEmail(
    entry.email,
    `We received your message — ${SITE_NAME}`,
    buildEmailHTML('Thank You for Reaching Out!', [
      ['Dear',       entry.firstName],
      ['Status',     'Your enquiry has been received successfully.'],
      ['Our Reply',  'Our team will respond within 24 business hours.'],
      ['Reference',  `DN-${entry.id}`],
      ['Email Us',   ADMIN_EMAIL]
    ])
  );

  res.json({ success: true, message: "Thank you! We'll respond within 24 hours. Check your inbox for a confirmation." });
});

/* ── Newsletter ── */
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }
  const cleanEmail   = sanitize(email, 200).toLowerCase();
  const subscribers  = readJSON('newsletter.json');

  if (subscribers.find(s => s.email === cleanEmail)) {
    return res.json({ success: true, message: "You're already subscribed! Thank you." });
  }

  subscribers.push({ email: cleanEmail, subscribedAt: new Date().toISOString(), ip: req.ip });
  writeJSON('newsletter.json', subscribers);
  log('Newsletter:NEW', { email: cleanEmail, total: subscribers.length });

  await sendEmail(
    ADMIN_EMAIL,
    `📰 New Subscriber — ${cleanEmail}`,
    buildEmailHTML('New Newsletter Subscriber', [
      ['Email',       cleanEmail],
      ['Subscribed',  new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})],
      ['Total',       String(subscribers.length)]
    ])
  );

  await sendEmail(
    cleanEmail,
    `Welcome to ${SITE_NAME} Newsletter!`,
    buildEmailHTML("You're In!", [
      ['Status',       `You've subscribed to ${SITE_NAME} updates.`],
      ['What to Expect','Latest news, events, academic tips & exclusive offers.'],
      ['Contact',      ADMIN_EMAIL]
    ])
  );

  res.json({ success: true, message: "You're subscribed! Welcome to the DFree Novelish community." });
});

/* ── Quote / Start a Project ── */
app.post('/api/quote', async (req, res) => {
  const { name, email, service, budget, message } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  const entry = {
    id:          Date.now(),
    name:        sanitize(name,    200),
    email:       sanitize(email,   200).toLowerCase(),
    service:     sanitize(service, 200),
    budget:      sanitize(budget,  100),
    message:     sanitize(message, 3000),
    submittedAt: new Date().toISOString(),
    ip:          req.ip
  };

  const quotes = readJSON('quotes.json');
  quotes.push(entry);
  writeJSON('quotes.json', quotes);
  log('Quote:NEW', { id: entry.id, name: entry.name, service: entry.service });

  await sendEmail(
    ADMIN_EMAIL,
    `💼 New Quote Request — ${entry.name} (${entry.service || 'General'})`,
    buildEmailHTML('New Quote Request', [
      ['Name',     entry.name],
      ['Email',    entry.email],
      ['Service',  entry.service],
      ['Budget',   entry.budget],
      ['Details',  entry.message],
      ['Ref ID',   `DQ-${entry.id}`],
      ['Time',     new Date(entry.submittedAt).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})]
    ])
  );

  await sendEmail(
    entry.email,
    `Quote Request Received — ${SITE_NAME}`,
    buildEmailHTML('Your Quote Request is Confirmed!', [
      ['Dear',      entry.name],
      ['Service',   entry.service || 'General Inquiry'],
      ['Status',    'Our specialists are reviewing your request.'],
      ['Delivery',  'A custom quote will reach you within 24 hours.'],
      ['Reference', `DQ-${entry.id}`],
      ['Email',     ADMIN_EMAIL]
    ])
  );

  res.json({ success: true, message: "Thank you! We'll send your custom quote within 24 hours." });
});

/* ── AI Chatbot (Groq) ── */
const SYSTEM_PROMPT = `You are a friendly and professional AI assistant for DFree Novelish — an elite academic and business solutions agency.

About DFree Novelish:
- Tagline: "Excellence Delivered."
- Experience: 6+ years, 10,000+ projects, 98% success rate, clients worldwide.
- Email: info@dfreenovelish.com

Academic Services: Assignment Help, Research Writing, SOP & Resumes, Turnitin Reports, Journal Publication, Book Writing, Content Writing, Thesis Support.

Business Services: Web Design & Development, Social Media Marketing, Software Development, iOS Apps, Digital Ads & Campaigns, E-Learning Technology, Brand Identity.

Why Choose Us: Professional expertise, 100% original work, confidential, affordable, 98% success rate, global reach.

Process: 1) Consultation → 2) Proposal (transparent pricing) → 3) Execution → 4) Delivery on schedule.

Contact: info@dfreenovelish.com | WhatsApp via website. For pricing, always direct to contact.

Guidelines: Be warm, concise, professional. Under 120 words unless detail needed. Never invent prices.`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    log('Chat:ERROR', 'GROQ_API_KEY not set');
    return res.status(500).json({ error: 'AI service is not configured. Please contact us directly at info@dfreenovelish.com' });
  }

  // Sanitize messages
  const safeMessages = messages
    .slice(-20)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map(m => ({ role: m.role, content: sanitize(String(m.content), 2000) }));

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:       'llama-3.1-8b-instant',
        max_tokens:  600,
        temperature: 0.7,
        messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      log('Chat:GroqError', { status: response.status, body: errText.slice(0, 300) });
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }

    const data  = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'I could not generate a response. Please reach us at info@dfreenovelish.com';
    res.json({ reply });

  } catch (err) {
    log('Chat:Exception', err.message);
    res.status(500).json({ error: 'Could not reach AI service. Please try again or email us.' });
  }
});

/* ── 404 — serve index for SPA-style fallback ── */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════════╗`);
  console.log(`  ║  ${SITE_NAME} Server Started     ║`);
  console.log(`  ║  http://localhost:${PORT}            ║`);
  console.log(`  ╚════════════════════════════════════╝\n`);
});
