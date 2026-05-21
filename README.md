# DFree Novelish Website — Setup Guide

## Quick Start

```bash
npm install
npm start
```

Open: http://localhost:3000

## Configuration

Edit `.env` before starting:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `GROQ_API_KEY` | Your Groq key — chatbot works out of the box |
| `SMTP_USER` | Gmail address for sending emails |
| `SMTP_PASS` | Gmail App Password (16 chars) |
| `NOTIFY_EMAIL` | Admin inbox for form submissions |

### Enable Gmail Emails
1. Enable 2-Factor Authentication on Gmail
2. Go to: Google Account → Security → App Passwords
3. Generate a 16-character app password
4. Set `SMTP_USER=yourgmail@gmail.com` and `SMTP_PASS=xxxx xxxx xxxx xxxx`

Without SMTP credentials, the server still works — form submissions are logged to console and saved to `data/` folder.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/contact` | Contact form submission |
| POST | `/api/quote` | "Start a Project" quote requests |
| POST | `/api/newsletter` | Newsletter signup |
| POST | `/api/chat` | AI chatbot (Groq) |
| GET | `/api/health` | Server health check |

## Data Storage

All submissions saved locally in `data/`:
- `data/contacts.json` — Contact form entries
- `data/quotes.json` — Quote requests
- `data/newsletter.json` — Newsletter subscribers
