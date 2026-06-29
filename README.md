# Atlantic Entitlements

A subscription entitlement system for The Atlantic. A Django + DRF backend computes live entitlements from a user's active subscriptions; a Next.js frontend provides an admin dashboard for managing users and subscriptions.

## What I was able to complete

The core entitlement system is fully implemented. The backend is a Django + DRF API with a single Subscription model that tracks product grants per user with a full lifecycle — subscriptions can be future-dated, set to expire on a specific date, or revoked immediately. Entitlements are computed live at query time as the union of all active subscription grants rather than being stored, meaning the answer to "what is this user entitled to right now" is always correct without any background sync jobs.
The frontend is a Next.js admin dashboard where you can create users, grant subscriptions with optional end dates, revoke subscriptions, and see a user's current entitlement status rendered as live indicators. The whole stack runs with a single docker compose up --build command.

## Assumtions and Trade Offs
- Users can hold multiple subscriptions simultaneously. The prompt describes products as a strict hierarchy but doesn't explicitly say a user can only hold one at a time. I treated multiple concurrent grants as a feature — it supports legitimate scenarios like overlapping renewals, gifted subscriptions on top of a self-purchased one, or upgrading mid-cycle without revoking the old subscription. The union-based entitlement logic handles this correctly.
- Use revoked_at over a boolean is_revoked. A nullable datetime carries both the revocation state and its timestamp in one field. A separate boolean would be redundant. The tradeoff is that revoked_at IS NOT NULL is slightly less readable than is_revoked = true but the schema is cleaner.
- start_date and created_at are separate fields. created_at is when the record was written to the database. start_date is when the subscription becomes active. These can differ. For example, a gift subscription created today that activates on a future date, or a backdated grant for a grandfathered user.
- No authentication on the API. Adding auth was out of scope for the assessment and would have required decisions about the broader auth model — session-based, token-based, or JWT. The endpoints are intentionally open for ease of review.
- SQLite over PostgreSQL. Keeps the setup simple and zero-config. In production this would be the first thing to change — SQLite doesn't handle concurrent writes and has no replication story.
- Django's runserver in the Docker container. Used for simplicity. In production this would be replaced with gunicorn.

## What I would prioritize next if given additional time
If more time was given and if the system would be productionized a few things would be changed. The following would have to be addressed:
- Security: Proper authentication and secret handling would need to be added. Rate limiting would need to be added.
- Database: SQLite would have to be migrated to PostgresSQL. Database backups would need to be added for failure scenarios
- Backend: proper error handling, logging, and health checks need to be added
- Frontend: Might completely change depending on entitlements needs and how the company needs to visualize the data
- Testing: unit tests, load testing, etc
- Observability: structured logs, metrics, and alerts

## Any areas intentionally left incomplete or simplified
- No payment processing. Explicitly out of scope per the brief.
- No subscription update endpoint. Modifying a subscription (e.g. extending the end date) intentionally has no generic PATCH endpoint. The only supported mutation is revocation via PATCH /api/subscriptions/{id}/revoke/. A generic update would allow silently un-revoking a subscription or backdating start dates without validation. The user should get additional subscriptions after each successful payment process and the previous expired one can be revoked. 
- No duplicate subscription warning. The system allows granting the same product twice to one user. This is intentional because overlapping grants are legitimate. However, the UI doesn't warn when you're about to create a duplicate. A pre-submit check would be a small improvement.

---

## Architecture

```
backend/   Django 4.2 + DRF, SQLite, port 8000
frontend/  Next.js 14, Tailwind CSS, port 3000
```

### Data model

**Subscription** fields:

| Field        | Type              | Notes                                     |
|--------------|-------------------|-------------------------------------------|
| `id`         | PK                |                                           |
| `user`       | FK → User         |                                           |
| `product`    | enum              | `DIGITAL` \| `PRINT` \| `PREMIUM`        |
| `start_date` | date              | Can be future-dated or backdated          |
| `end_date`   | date (nullable)   | `null` = no expiry                        |
| `revoked_at` | datetime (nullable) | `null` = active; non-null = revoked     |
| `created_at` | datetime (auto)   |                                           |

### Entitlement logic

A subscription is **active** when:
```
revoked_at IS NULL
AND start_date <= today
AND (end_date IS NULL OR end_date > today)
```

Product hierarchy (each product grants everything the previous one does):

| Product   | can_read_web | can_receive_print | ad_free |
|-----------|:---:|:---:|:---:|
| `DIGITAL` | ✓ | | |
| `PRINT`   | ✓ | ✓ | |
| `PREMIUM` | ✓ | ✓ | ✓ |

Entitlements are computed live as the **union** of all active subscription grants — never stored.

---

## Setup

### Option A — Docker (recommended)

**Prerequisites:** Docker + Docker Compose

```bash
# From the repo root
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api

The SQLite database is stored in a named Docker volume (`sqlite-data`) so data persists across restarts. To wipe it: `docker compose down -v`.

---

### Option B — Local (manual)

**Prerequisites:** Python 3.10+, Node.js 18+

#### Backend

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## API Reference

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/users/` | List all users |
| `POST` | `/api/users/` | Create a user |
| `GET`  | `/api/users/{id}/` | Get a user |
| `GET`  | `/api/users/{id}/entitlements/` | Compute live entitlements |

**POST `/api/users/`** body:
```json
{ "username": "jsmith", "email": "jsmith@example.com", "password": "securepass1" }
```

**GET `/api/users/{id}/entitlements/`** response:
```json
{
  "user_id": 1,
  "entitlements": {
    "can_read_web": true,
    "can_receive_print": true,
    "ad_free": false
  },
  "active_subscriptions": [
    { "id": 2, "product": "PRINT", "end_date": "2026-12-31", "revoked_at": null },
    { "id": 1, "product": "DIGITAL", "end_date": null, "revoked_at": null }
  ]
}
```

### Subscriptions

| Method   | Path | Description |
|----------|------|-------------|
| `GET`    | `/api/subscriptions/` | List subscriptions (filterable) |
| `POST`   | `/api/subscriptions/` | Grant a subscription |
| `GET`    | `/api/subscriptions/{id}/` | Get a subscription |
| `PATCH`  | `/api/subscriptions/{id}/revoke/` | Revoke (sets `revoked_at` to now) |
| `DELETE` | `/api/subscriptions/{id}/` | Hard delete |

**Example curl session:**

```bash
# Create a user
curl -s -X POST http://localhost:8000/api/users/ \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"securepass1"}'

# Grant a PRINT subscription
curl -s -X POST http://localhost:8000/api/subscriptions/ \
  -H "Content-Type: application/json" \
  -d '{"user":1,"product":"PRINT","start_date":"2026-01-01","end_date":"2026-12-31"}'

# Check entitlements
curl -s http://localhost:8000/api/users/1/entitlements/

# Revoke the subscription
curl -s -X PATCH http://localhost:8000/api/subscriptions/1/revoke/

# Confirm entitlements are now empty
curl -s http://localhost:8000/api/users/1/entitlements/
```

**Query filters for `GET /api/subscriptions/`:**
- `?user=<id>` — filter by user
- `?product=DIGITAL` — filter by product
- `?active=true` — only active subscriptions

**POST `/api/subscriptions/`** body:
```json
{
  "user": 1,
  "product": "DIGITAL",
  "start_date": "2026-01-01",
  "end_date": "2027-01-01"
}
```
`end_date` is optional. `product` must be `DIGITAL`, `PRINT`, or `PREMIUM`.

---

## Frontend

The dashboard provides:

- **User list** — all users with a link to their detail page; form to create new users
- **User detail** — live entitlement status cards (green/gray indicators), full subscription history, grant and revoke controls

---



