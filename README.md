# Know Your Appliance

A full-stack MERN app: register/log in with JWT, add your appliances (brand +
model number), and ask an AI natural-language questions about each one.

**Note on the AI provider:** OpenAI doesn't currently offer a free API tier,
so this build uses **Google Gemini** (`gemini-2.0-flash`) instead, which has
a generous free tier. The AI-calling code lives entirely in
`backend/services/aiService.js`, so swapping providers later only means
editing that one file.

## Stack
- **Backend:** Node.js, Express, MongoDB/Mongoose, JWT auth (bcrypt password hashing)
- **Frontend:** React + Vite, Tailwind CSS v4, React Router
- **AI:** Google Gemini API (free tier), with Google Search grounding enabled to reduce hallucination on model-specific facts

## 1. Set up MongoDB
Create a free cluster at https://www.mongodb.com/cloud/atlas, then grab your
connection string (Database → Connect → Drivers).

## 2. Set up Gemini
Get a free API key at https://aistudio.google.com/apikey.

## 3. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# edit .env and fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY
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
| POST | /api/auth/register | No | Create account, returns JWT |
| POST | /api/auth/login | No | Log in, returns JWT |
| GET | /api/appliances | Yes | List your appliances |
| POST | /api/appliances | Yes | Add an appliance `{ brand, modelNumber, nickname }` |
| GET | /api/appliances/:id | Yes | Get one appliance + Q&A history |
| DELETE | /api/appliances/:id | Yes | Remove an appliance |
| POST | /api/appliances/:id/ask | Yes | Ask a question `{ question }`, get an AI answer |

Auth is via `Authorization: Bearer <token>` header — the frontend's axios
instance (`src/api/axios.js`) attaches this automatically once you're logged in.

## Data models

**User:** name, email (unique), password (bcrypt-hashed)

**Appliance:** user (ref), brand, modelNumber, nickname (optional), history[]
— each history entry is `{ question, answer, createdAt }`, so every appliance
keeps its own running Q&A log.

## Project structure
```
backend/
  config/db.js            MongoDB connection
  models/User.js           user schema + password hashing
  models/Appliance.js      appliance + embedded Q&A history
  middleware/authMiddleware.js   JWT verification
  routes/authRoutes.js     register / login
  routes/applianceRoutes.js  CRUD + /ask endpoint
  services/aiService.js    Gemini API call, isolated for easy provider swaps
  server.js
frontend/
  src/api/axios.js         JWT-attaching axios instance
  src/context/AuthContext.jsx
  src/pages/Login.jsx, Register.jsx, Dashboard.jsx, ApplianceDetail.jsx
  src/components/ApplianceCard.jsx, AddApplianceForm.jsx
```

## Next steps you might want
- Rate-limit the `/ask` endpoint per user to control Gemini API usage
- Add a "verify email" step to registration
- Add RAG: embed appliance manuals in a vector DB (MongoDB Atlas Vector
  Search works well here since you're already on Atlas) so answers can cite
  the actual manual instead of relying on general web knowledge
