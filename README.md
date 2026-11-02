# Know Your Appliance

A full-stack MERN app: register/log in with JWT, add your appliances (brand +
model number), and ask an AI natural-language questions about each one.

**Note on the AI provider:** questions go to **Groq** (`openai/gpt-oss-120b`).
Image diagnosis uses Groq's vision model (`qwen/qwen3.8-27b` by default;
override with `GROQ_VISION_MODEL`). Both calls live in
`backend/services/aiService.js`.

## Stack
- **Backend:** Node.js, Express, MongoDB/Mongoose, JWT auth (bcrypt password hashing)
- **Frontend:** React + Vite, Tailwind CSS v4, React Router
- **AI:** Groq — `openai/gpt-oss-120b` for questions, `qwen/qwen3.8-27b` for image diagnosis

## 1. Set up MongoDB
Create a free cluster at https://www.mongodb.com/cloud/atlas, then grab your
connection string (Database → Connect → Drivers).

## 2. Set up Groq
Get an API key at https://console.groq.com/keys.

## 3. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# edit .env and fill in MONGO_URI, JWT_SECRET, GROQ_API_KEY
npm run dev
```
Backend runs on http://localhost:5000

## 4. Frontend setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

## API overview

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | No | Create account (with a personal household), returns JWT |
| POST | /api/auth/login | No | Log in, returns JWT |
| GET | /api/appliances?q= | Yes | List your household's appliances; `q` searches brand / model / nickname. Each one includes `records` and `reminders` |
| GET | /api/appliances/reminders | Yes | Warranty and upkeep reminders that are due, overdue, or within 90 days |
| POST | /api/appliances/identify | Yes | Read a photo or PDF. Nothing is saved. Returns the reading and the dates it would store |
| POST | /api/appliances | Yes | Add an appliance. Optional `diagnosis` and `file` from a previous read |
| GET | /api/appliances/:id | Yes | Get one appliance, its readings, and Q&A history |
| DELETE | /api/appliances/:id | Yes | Remove an appliance and its files |
| POST | /api/appliances/:id/ask | Yes | Ask a question `{ question }`. Answers prefer saved readings |
| POST | /api/appliances/:id/diagnose | Yes | Read a photo or PDF and save it on the appliance |
| POST | /api/appliances/:id/uploads/:uploadId/apply | Yes | Copy a sticker's brand, model, serial, and generation onto the appliance |
| POST | /api/appliances/:id/maintenance/done | Yes | Mark an upkeep task done `{ taskKey, doneOn }`. `doneOn` is `YYYY-MM-DD` |
| GET | /api/appliances/:id/uploads/:uploadId/file | Yes | Fetch the stored photo or PDF |
| DELETE | /api/appliances/:id/uploads/:uploadId | Yes | Remove one reading and its file |
| GET | /api/household | Yes | Your household, invite code and members |
| PATCH | /api/household | Admin | Rename `{ name }` |
| POST | /api/household/invite-code | Admin | Generate a new invite code (old one stops working) |
| POST | /api/household/join | Yes | Join another household `{ inviteCode }` |
| POST | /api/household/leave | Yes | Leave; you get a fresh personal household |
| POST | /api/household/transfer-admin | Admin | Make another member admin `{ userId }` |
| DELETE | /api/household/members/:userId | Admin | Remove a member |

Auth is via `Authorization: Bearer <token>` header — the frontend's axios
instance (`src/api/axios.js`) attaches this automatically once you're logged in.

## Data models

**User:** name, email (unique), password (bcrypt-hashed), household (ref)

**Household:** name, admin (ref User), inviteCode (unique, 8 chars)

**Appliance:** household (ref), user (ref, who added it), brand, modelNumber,
nickname (optional), serialNumber, generation, history[], uploads[], records,
serviceLog[]. Each history entry is `{ question, answer, askedBy, createdAt }`.
Each upload is a reading of one file: kind (`sticker`, `manual`, `bill`,
`warranty`, `service`, `condition`, or `other`), summary, and whatever could
be extracted. A bill stores retailer, purchase date, price, currency, and
invoice number. A warranty (on a bill or its own document) stores provider,
coverage type, term in months, start, end, coverage, and renewal date when
one is printed. Maintenance tasks store the task, an interval in months or
days, and any last-done or next-due date printed on the file. The file itself
is stored on disk, not in MongoDB.

`records` is rebuilt from those uploads whenever a file is added or removed.
It is the household's purchase, the warranties, and the upkeep schedule, with
real calendar dates. A "2 year" term plus a purchase date becomes an end date
here; the upload still keeps only what the document printed. `serviceLog`
stores upkeep the household marked done, and the schedule uses that date the
next time `records` is built. Appliance responses also include `reminders`,
computed from `records` at read time: warranty expiry and renewal (from 30
days before) and upkeep (from 7 days before). Each reminder is `scheduled`,
`due`, or `overdue`.

## Households

Every user belongs to exactly one household, and all appliances belong to a
household rather than a person. Everyone in a household can see, add, search,
delete and ask about all of its appliances.

- **Creating:** registering creates a personal household with you as its
  admin. Registration never asks for an invite code.
- **Inviting:** the invite code lives on the in-app Household page. New
  members sign up normally, then enter the code under "Join another
  household". Max 10 members per household.
- **Admin:** exactly one per household (the creator, until transferred). Only
  the admin can change the invite code (the old one stops working), rename,
  remove members and transfer admin. The admin must transfer admin before
  leaving.
- **Leaving / removal:** the member gets a fresh personal household;
  appliances they added stay behind.
- **Joining from an existing account:** if you were the only member of your
  old household, its appliances move with you and the empty household is
  deleted.
- Membership is checked against the database on every request (not stored in
  the JWT), so removing a member takes effect immediately.

## Image diagnosis

One upload handles a model or generation sticker, a manual, a bill or receipt,
a warranty card, a service invoice, or a photo of the appliance and its
condition. The reader classifies the file; you don't pick a type.

- **Registering:** "Read a photo or PDF" fills brand, model, serial, and
  generation from a sticker. A bill or warranty card shows the purchase date
  and expiry before you save. Correct anything that looks wrong, then save.
  The reading is stored with the appliance and the model is not called again.
- **On an appliance:** drop a file to diagnose it. A sticker never overwrites
  the brand or model until you choose "Save this identification". Bills,
  warranty cards, and service invoices update the purchase, warranty, and
  upkeep dates. A manual's service intervals become the upkeep schedule.
- **Reminders:** the dashboard lists warranty expiry, warranty renewal, and
  upkeep that is due, overdue, or coming up within 90 days. Expiry is reminded
  30 days ahead, upkeep 7 days ahead. "Done" on an upkeep task records the day
  and, when the manual gave an interval, schedules the next one. Removing the
  reading removes the dates that came from it.
- **Condition:** scorching, smoke, exposed wiring, and similar hazards are
  marked urgent. The appliance card then says "Needs attention".
- **Questions** prefer facts read from these uploads, including stored
  purchase, warranty, and upkeep dates, and fall back to general guidance for
  the brand and model when the uploads don't cover the question.
- Photos are JPEG, PNG, WebP, GIF, or HEIC, up to 8 MB. PDFs with selectable
  text are read as text. Scanned PDFs are rendered, up to the first 3 pages.
- Files live in `backend/data/uploads` and are only served to members of that
  household.
- Accounts created before households existed get a personal household, with
  their appliances migrated into it, on their first authenticated request.

## Project structure
```
backend/
  config/db.js            MongoDB connection
  models/User.js           user schema + password hashing
  models/Appliance.js      appliance + embedded Q&A history
  models/Household.js      household name, admin, invite code
  middleware/authMiddleware.js   JWT verification + household-admin check
  middleware/uploadMiddleware.js  8 MB photo or PDF upload
  routes/authRoutes.js     register / login
  routes/applianceRoutes.js  CRUD + search + /ask + image diagnosis
  routes/householdRoutes.js  invite / join / leave / members
  services/aiService.js    Groq calls for questions and vision
  services/diagnosisService.js  file type detection, PDF text, diagnosis shape
  services/documentRecords.js  purchase, warranty, and upkeep dates, plus reminders
  services/uploadStore.js  household files on disk
  services/householdService.js  membership rules (join, leave, remove, migrate)
  server.js
frontend/
  src/api/axios.js         JWT-attaching axios instance
  src/context/AuthContext.jsx
  src/pages/Login.jsx, Register.jsx, Dashboard.jsx, ApplianceDetail.jsx, Household.jsx
  src/components/ApplianceCard.jsx, AddApplianceForm.jsx, ImageDiagnosis.jsx, ApplianceRecords.jsx
```

## Next steps you might want
- Rate-limit the `/ask` endpoint per user to control Gemini API usage
- Add a "verify email" step to registration
- Add RAG: embed appliance manuals in a vector DB (MongoDB Atlas Vector
  Search works well here since you're already on Atlas) so answers can cite
  the actual manual instead of relying on general web knowledge
