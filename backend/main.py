"""
VisaPath Pro — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import os, json, asyncio
from dotenv import load_dotenv
from google import genai
from google.genai import types
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from datetime import datetime
import uuid

load_dotenv()

# ── Firebase init ──────────────────────────────────────────────────────────
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ── Gemini init ────────────────────────────────────────────────────────────
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="VisaPath Pro API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth dependency ────────────────────────────────────────────────────────
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# ── Pydantic models ────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    country: Optional[str] = None
    visa_type: Optional[str] = None
    history: Optional[List[dict]] = []

class ChecklistUpdate(BaseModel):
    country: str
    visa_type: str
    items: dict  # {item_index: bool}

class SessionCreate(BaseModel):
    country: Optional[str] = None
    visa_type: Optional[str] = None
    title: Optional[str] = "New Conversation"

# ── System prompt builder ──────────────────────────────────────────────────
from knowledge_base import VISA_DB, build_system_prompt

# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "VisaPath Pro API v2.0 running"}

@app.get("/api/countries")
def get_countries():
    return {
        country: {
            "flag": data["flag"],
            "highlight": data["highlight"],
            "visas": {
                vt: {"name": data[vt]["name"], "cost": data[vt]["cost"], "time": data[vt]["time"]}
                for vt in ["study", "work", "visit"] if vt in data
            }
        }
        for country, data in VISA_DB.items()
    }

@app.get("/api/visa/{country}/{visa_type}")
def get_visa_info(country: str, visa_type: str):
    if country not in VISA_DB:
        raise HTTPException(404, "Country not found")
    data = VISA_DB[country]
    vt = visa_type.lower()
    if vt not in data:
        raise HTTPException(404, "Visa type not found")
    return {"country": country, "flag": data["flag"], "visa_type": vt, **data[vt]}

@app.post("/api/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    """Stream chat response from Gemini with Google Search grounding."""
    uid = user["uid"]
    session_id = req.session_id or str(uuid.uuid4())

    system_prompt = build_system_prompt(req.country, req.visa_type)

    # Build message history for context
    messages = []
    for msg in (req.history or []):
        messages.append({"role": msg["role"], "content": msg["content"]})

    async def generate():
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )

            # Use non-streaming for reliability, stream manually
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=req.message,
                config=config
            )

            full_text = ""
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    full_text += part.text

            # Stream word by word for effect
            words = full_text.split(" ")
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'text': chunk, 'done': False})}\n\n"
                await asyncio.sleep(0.01)

            # Save to Firestore
            msg_doc = {
                "session_id": session_id,
                "uid": uid,
                "role": "assistant",
                "content": full_text,
                "country": req.country,
                "visa_type": req.visa_type,
                "timestamp": datetime.utcnow().isoformat(),
            }
            db.collection("messages").add(msg_doc)

            # Also save user message
            user_doc = {
                "session_id": session_id,
                "uid": uid,
                "role": "user",
                "content": req.message,
                "country": req.country,
                "visa_type": req.visa_type,
                "timestamp": datetime.utcnow().isoformat(),
            }
            db.collection("messages").add(user_doc)

            # Update session
            db.collection("sessions").document(session_id).set({
                "uid": uid,
                "last_message": req.message[:80],
                "updated_at": datetime.utcnow().isoformat(),
                "country": req.country,
                "visa_type": req.visa_type,
            }, merge=True)

            yield f"data: {json.dumps({'text': '', 'done': True, 'session_id': session_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/api/chat/simple")
async def chat_simple(req: ChatRequest, user=Depends(get_current_user)):
    """Non-streaming chat for simpler clients."""
    uid = user["uid"]
    session_id = req.session_id or str(uuid.uuid4())

    system_prompt = build_system_prompt(req.country, req.visa_type)

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.3,
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=req.message,
        config=config
    )

    full_text = ""
    for part in response.candidates[0].content.parts:
        if hasattr(part, "text") and part.text:
            full_text += part.text

    # Save messages
    for role, content in [("user", req.message), ("assistant", full_text)]:
        db.collection("messages").add({
            "session_id": session_id, "uid": uid,
            "role": role, "content": content,
            "country": req.country, "visa_type": req.visa_type,
            "timestamp": datetime.utcnow().isoformat(),
        })

    db.collection("sessions").document(session_id).set({
        "uid": uid, "last_message": req.message[:80],
        "updated_at": datetime.utcnow().isoformat(),
        "country": req.country, "visa_type": req.visa_type,
    }, merge=True)

    return {"response": full_text, "session_id": session_id}

@app.get("/api/sessions")
async def get_sessions(user=Depends(get_current_user)):
    uid = user["uid"]
    sessions = db.collection("sessions").where("uid", "==", uid)\
        .order_by("updated_at", direction=firestore.Query.DESCENDING).limit(20).stream()
    return [{"id": s.id, **s.to_dict()} for s in sessions]

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str, user=Depends(get_current_user)):
    uid = user["uid"]
    msgs = db.collection("messages")\
        .where("session_id", "==", session_id)\
        .where("uid", "==", uid)\
        .order_by("timestamp").stream()
    return [{"id": m.id, **m.to_dict()} for m in msgs]

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, user=Depends(get_current_user)):
    uid = user["uid"]
    # Delete messages
    msgs = db.collection("messages").where("session_id", "==", session_id).stream()
    for m in msgs:
        m.reference.delete()
    db.collection("sessions").document(session_id).delete()
    return {"deleted": True}

@app.get("/api/checklist/{country}/{visa_type}")
async def get_checklist(country: str, visa_type: str, user=Depends(get_current_user)):
    uid = user["uid"]
    doc = db.collection("checklists").document(f"{uid}_{country}_{visa_type}").get()
    if doc.exists:
        return doc.to_dict()
    return {"items": {}, "country": country, "visa_type": visa_type}

@app.post("/api/checklist")
async def save_checklist(req: ChecklistUpdate, user=Depends(get_current_user)):
    uid = user["uid"]
    db.collection("checklists").document(f"{uid}_{req.country}_{req.visa_type}").set({
        "uid": uid,
        "country": req.country,
        "visa_type": req.visa_type,
        "items": req.items,
        "updated_at": datetime.utcnow().isoformat(),
    })
    return {"saved": True}

@app.get("/api/live-data/{country}")
async def get_live_data(country: str):
    """Returns latest scraped data from official embassy sites."""
    doc = db.collection("live_data").document(country).get()
    if doc.exists:
        return doc.to_dict()
    return {"country": country, "data": None, "message": "No live data yet — run scraper"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "gemini": "connected", "firebase": "connected"}
