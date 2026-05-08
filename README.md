# ✈️ VisaPath Pro — AI Immigration Consultant

Production-grade visa consultancy platform with AI-powered chat, real-time embassy data scraping, Firebase auth, and chat history. Built as a full-stack web app that converts to Android APK.

---

## 📁 Project Structure

```
visapath_pro/
├── backend/                  # Python FastAPI server
│   ├── main.py               # API routes + Gemini AI + streaming
│   ├── knowledge_base.py     # Visa data for 7 countries + system prompt
│   ├── scraper.py            # Real-time embassy website scraper
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Copy to .env and fill in keys
│   └── firebase-service-account.json   ← YOU ADD THIS
│
└── frontend/                 # React + Vite web app
    ├── src/
    │   ├── main.jsx           # React entry point
    │   ├── App.jsx            # Root component + Firebase auth
    │   ├── App.css            # Full design system (dark theme)
    │   ├── api.js             # API client + country data fallback
    │   └── pages/
    │       ├── AuthPage.jsx   # Login / signup / Google auth
    │       ├── Dashboard.jsx  # Country selector, visa info, checklist
    │       └── ChatPage.jsx   # Full chat with history + streaming
    ├── public/
    │   ├── manifest.json      # PWA manifest (for APK conversion)
    │   └── icon.svg           # App icon
    ├── index.html             # HTML entry with PWA meta tags
    ├── vite.config.js         # Vite + dev proxy config
    ├── package.json           # npm dependencies
    └── .env.example           # Copy to .env and fill in keys
```

---

## ⚙️ Setup — Step by Step

### Step 1: Firebase Setup (5 minutes)
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g., `visapath-pro`)
3. Enable **Authentication** → Sign-in methods → Enable **Email/Password** and **Google**
4. Enable **Firestore Database** → Start in production mode
5. Go to **Project Settings → Service Accounts → Generate new private key**
6. Download the JSON file and save it as `backend/firebase-service-account.json`
7. Go to **Project Settings → Your Apps → Add Web App**
8. Copy the Firebase config values into `frontend/.env`

### Step 2: Backend Setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
# Place firebase-service-account.json in this folder
uvicorn main:app --reload --port 8000
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env — add Firebase config values + VITE_API_URL=http://localhost:8000
npm run dev
# Open http://localhost:3000
```

### Step 4: Run the Scraper (Real-Time Data)
```bash
cd backend
# Run once:
python scraper.py

# Run on schedule (every 24 hours — for production):
python scraper.py --schedule
```

---

## 🚀 Deployment

### Backend → Render.com (Free)
1. Push `backend/` folder to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Set:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `GEMINI_API_KEY`
6. Add `firebase-service-account.json` content as an env variable or use Render's secret files
7. Deploy → copy the URL (e.g., `https://visapath-api.onrender.com`)

### Frontend → Vercel (Free)
1. Push `frontend/` folder to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Set environment variables (all `VITE_*` values from `.env`)
4. Set `VITE_API_URL` to your Render backend URL
5. Deploy → your site is live at `https://visapath.vercel.app`

---

## 📱 Android APK (PWABuilder — No Flutter Needed)

Once your frontend is deployed on Vercel:

1. Go to [pwabuilder.com](https://www.pwabuilder.com)
2. Enter your Vercel URL (e.g., `https://visapath.vercel.app`)
3. Click **Start** → it will analyze your PWA manifest
4. Click **Package for Stores** → **Android**
5. Download the `.apk` file
6. Install on Android: transfer to phone → enable "Install from unknown sources" → install

> The app will look and feel like a native Android app with your icon, splash screen, and no browser UI.

---

## 🧠 About Real-Time Data (For Your Supervisor)

**How it works:**

The platform uses a **hybrid real-time data approach**:

1. **Structured Knowledge Base** (`knowledge_base.py`) — Core visa requirements, costs, and processes for 7 countries hardcoded and maintained.

2. **Gemini Google Search Grounding** — Every AI chat response uses Gemini's built-in Google Search tool. Before answering, the AI searches official embassy websites (IRCC, gov.uk, USCIS, immi.homeaffairs.gov.au, etc.) in real-time and incorporates the latest information.

3. **Embassy Scraper** (`scraper.py`) — A scheduled Python scraper that hits official government immigration websites every 24 hours and stores updated data in Firebase Firestore. The AI uses this stored data for instant lookups.

**What to say to your supervisor:**
> *"We use a three-layer real-time data architecture: a structured knowledge base for core visa rules, Gemini's Google Search grounding for live policy lookups on every query, and a scheduled web scraper that monitors 7 official embassy and immigration websites daily — storing changes in Firebase. This ensures our information reflects the latest government policies."*

---

## 🌟 Features Summary

| Feature | Technology |
|---|---|
| AI Chat | Gemini 2.5 Flash + Google Search grounding |
| User Auth | Firebase Authentication (Email + Google) |
| Chat History | Firebase Firestore (per-user sessions) |
| Real-time Data | Embassy scraper + Gemini web search |
| Document Checklist | Firebase Firestore (persisted per user) |
| Streaming Responses | FastAPI Server-Sent Events (SSE) |
| Frontend | React + Vite (mobile-responsive) |
| Android APK | PWA → PWABuilder → APK |
| Backend | FastAPI + Python |
| Deployment | Vercel (frontend) + Render (backend) |

---

## 🗺️ Countries Covered

🇨🇦 Canada · 🇬🇧 United Kingdom · 🇺🇸 United States · 🇩🇪 Germany · 🇦🇺 Australia · 🇦🇪 UAE · 🇳🇿 New Zealand

Each with: Study Visa · Work Visa · Visit Visa — requirements, process, costs, tips, official links.
