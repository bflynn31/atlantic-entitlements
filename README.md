# Atlantic Entitlements

A subscription entitlement system for The Atlantic. A Django + DRF backend computes live entitlements from a user's active subscriptions; a Next.js frontend provides an admin dashboard for managing users and subscriptions.

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
- Swagger UI: http://localhost:8000/api/docs/

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

Open **http://localhost:3000** in your browser. Swagger UI is at **http://localhost:8000/api/docs/**.

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

## Design decisions

- **Entitlements are never stored.** The `GET /api/users/{id}/entitlements/` endpoint runs the union logic at query time. This means entitlements are always correct without background jobs.
- **`revoked_at` over a boolean.** A separate `is_revoked` column would be redundant. `revoked_at IS NOT NULL` carries both the revocation state and its timestamp.
- **Active filter is a DB query, not Python filtering.** `SubscriptionViewSet.get_queryset` builds a queryset with `revoked_at__isnull`, `start_date__lte`, and `end_date__gt` conditions so the database does the work rather than loading all rows into Python.
