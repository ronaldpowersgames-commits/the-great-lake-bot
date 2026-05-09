# The Great Lake Bot

**Leadership Clarity Platform API v1.3.0**

## Quick Start (Local)

```
npm install
cp .env.example .env
# Edit .env with your JWT_SECRET
npm run dev
```

## Endpoints

| Method | Path | Rules | Description |
|--------|------|-------|-------------|
| GET | /health | - | Health check |
| GET | /status | - | Status check |
| POST | /dev/token | - | Dev token (non-prod) |
| POST | /onboarding | 21,4,5 | User onboarding |
| POST | /template | 3,4,5 | Submit template |
| POST | /engine/process | 1,6,9,27 | Run engine |
| POST | /characters | 21,7 | Add character |
| GET | /characters | 21 | List characters |
| POST | /nicknames | 22 | Assign nickname |
| POST | /groups | 23-26 | Create group |
| POST | /groups/:id/messages | 23-26 | Post message |
| GET | /groups/:id/messages | 23-26 | Get messages |
| POST | /updates | 11,12 | Governance update |

## Deploy to Render.com

1. Push to GitHub
2. Go to render.com > New > Web Service
3. Connect your repo
4. Render auto-detects render.yaml
5. Done!

## Governance Enforcement

All 27 rules enforced through layered middleware:
Auth > Rate Limit > Safety Filter > Validation > Controller
