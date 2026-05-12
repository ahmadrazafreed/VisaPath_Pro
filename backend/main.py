"""
VisaPath Pro — FastAPI Backend v3
- Multiple Gemini API key rotation
- Fast responses (no search by default)
- Retry logic
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import os, json, asyncio, time, random
from dotenv import load_dotenv
from google import genai
from google.genai import types
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from datetime import datetime
import uuid

load_dotenv()

# ── Multiple API Key Rotation ──────────────────────────────────────────────
# Add all your free Gemini API keys here
GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
    os.getenv("GEMINI_API_KEY_4"),
    os.getenv("GEMINI_API_KEY_5"),
]
# Filter out None values
GEMINI_KEYS = [k for k in GEMINI_KEYS if k]

print(f"✅ Loaded {len(GEMINI_KEYS)} Gemini API key(s)")

# Create clients for each key
gemini_clients = []
for key in GEMINI_KEYS:
    try:
        gemini_clients.append(genai.Client(api_key=key))
    except Exception as e:
        print(f"⚠️ Failed to init key: {e}")

current_key_index = 0

def get_gemini_client():
    """Get current Gemini client, rotate if needed."""
    global current_key_index
    if not gemini_clients:
        return None
    return gemini_clients[current_key_index % len(gemini_clients)]

def rotate_key():
    """Rotate to next API key."""
    global current_key_index
    current_key_index = (current_key_index + 1) % len(gemini_clients)
    print(f"🔄 Rotated to Gemini key #{current_key_index + 1}")

def generate_with_rotation(contents, config, max_retries=None):
    """Generate content with automatic key rotation on rate limit."""
    if max_retries is None:
        max_retries = max(len(gemini_clients) * 2, 3)
    
    last_error = None
    for attempt in range(max_retries):
        client = get_gemini_client()
        if not client:
            raise Exception("No Gemini clients available")
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=config
            )
            return response
        except Exception as e:
            last_error = e
            err_str = str(e)
            if any(code in err_str for code in ["429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE"]):
                print(f"⚠️ Key #{current_key_index + 1} limit hit, rotating... (attempt {attempt+1})")
                rotate_key()
                time.sleep(1)
            elif "400" in err_str or "401" in err_str:
                raise e
            else:
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    raise e
    raise last_error

# ── Firebase init ──────────────────────────────────────────────────────────
try:
    cred = credentials.Certificate("firebase-service-account.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase connected")
except Exception as e:
    print(f"⚠️ Firebase not connected: {e}")
    db = None

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="VisaPath Pro API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://visa-path-pro.vercel.app",
        "https://visapath-pro.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)

# ── Auth ───────────────────────────────────────────────────────────────────
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

# ── Models ─────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    country: Optional[str] = None
    visa_type: Optional[str] = None
    history: Optional[List[dict]] = []
    use_search: Optional[bool] = False

class ChecklistUpdate(BaseModel):
    country: str
    visa_type: str
    items: dict

from knowledge_base import VISA_DB, build_system_prompt, generate_chat_title

# ── Save to Firestore ──────────────────────────────────────────────────────
def save_to_firestore(session_id, uid, user_msg, ai_msg, country, visa_type):
    if not db:
        return
    try:
        now = datetime.utcnow().isoformat()
        for role, content in [("user", user_msg), ("assistant", ai_msg)]:
            db.collection("messages").add({
                "session_id": session_id, "uid": uid,
                "role": role, "content": content,
                "country": country, "visa_type": visa_type,
                "timestamp": now,
            })
        db.collection("sessions").document(session_id).set({
            "uid": uid,
            "last_message": user_msg[:80],
            "updated_at": now,
            "country": country,
            "visa_type": visa_type,
            "title": generate_chat_title(user_msg),
        }, merge=True)
    except Exception as e:
        print(f"⚠️ Firestore save error: {e}")

# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/")
@app.head("/")
def root():
    return {"status": "VisaPath Pro API v3.0", "keys_loaded": len(gemini_clients)}

@app.get("/api/health")
@app.head("/api/health")
def health():
    return {
        "status": "healthy",
        "gemini_keys": len(gemini_clients),
        "current_key": current_key_index + 1,
        "firebase": "connected" if db else "disconnected"
    }

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

@app.post("/api/chat/simple")
async def chat_simple(req: ChatRequest, user=Depends(get_current_user)):
    if not gemini_clients:
        raise HTTPException(500, "No Gemini API keys configured")

    uid = user["uid"]
    session_id = req.session_id or str(uuid.uuid4())
    system_prompt = build_system_prompt(req.country, req.visa_type)

    # Use search only when explicitly requested
    tools = [types.Tool(google_search=types.GoogleSearch())] if req.use_search else []
    
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.3,
        tools=tools if tools else None,
    )

    try:
        response = generate_with_rotation(req.message, config)
        full_text = ""
        for part in response.candidates[0].content.parts:
            if hasattr(part, "text") and part.text:
                full_text += part.text
        if not full_text:
            full_text = "I apologize, I could not generate a response. Please try again."
    except Exception as e:
        print(f"❌ GEMINI ERROR: {str(e)}")
        raise HTTPException(500, f"AI error: {str(e)}")

    save_to_firestore(session_id, uid, req.message, full_text, req.country, req.visa_type)
    return {"response": full_text, "session_id": session_id}

@app.post("/api/chat")
async def chat_stream(req: ChatRequest, user=Depends(get_current_user)):
    if not gemini_clients:
        raise HTTPException(500, "No Gemini API keys configured")

    uid = user["uid"]
    session_id = req.session_id or str(uuid.uuid4())
    system_prompt = build_system_prompt(req.country, req.visa_type)

    tools = [types.Tool(google_search=types.GoogleSearch())] if req.use_search else []

    async def generate():
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,
                tools=tools if tools else None,
            )
            response = generate_with_rotation(req.message, config)
            full_text = ""
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    full_text += part.text

            # Stream word by word for ChatGPT-like effect
            words = full_text.split(" ")
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'text': chunk, 'done': False})}\n\n"
                await asyncio.sleep(0.008)

            save_to_firestore(session_id, uid, req.message, full_text, req.country, req.visa_type)
            yield f"data: {json.dumps({'text': '', 'done': True, 'session_id': session_id})}\n\n"

        except Exception as e:
            print(f"❌ STREAM ERROR: {str(e)}")
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/api/sessions")
async def get_sessions(user=Depends(get_current_user)):
    if not db:
        return []
    uid = user["uid"]
    try:
        sessions = db.collection("sessions")\
            .where("uid", "==", uid)\
            .order_by("updated_at", direction=firestore.Query.DESCENDING)\
            .limit(20).stream()
        return [{"id": s.id, **s.to_dict()} for s in sessions]
    except Exception as e:
        print(f"⚠️ Get sessions error: {e}")
        return []

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str, user=Depends(get_current_user)):
    if not db:
        return []
    uid = user["uid"]
    try:
        msgs = db.collection("messages")\
            .where("session_id", "==", session_id)\
            .where("uid", "==", uid)\
            .order_by("timestamp").stream()
        return [{"id": m.id, **m.to_dict()} for m in msgs]
    except Exception as e:
        print(f"⚠️ Get messages error: {e}")
        return []

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, user=Depends(get_current_user)):
    if not db:
        return {"deleted": False}
    uid = user["uid"]
    try:
        msgs = db.collection("messages").where("session_id", "==", session_id).stream()
        for m in msgs:
            m.reference.delete()
        db.collection("sessions").document(session_id).delete()
    except Exception as e:
        print(f"⚠️ Delete error: {e}")
    return {"deleted": True}

@app.get("/api/checklist/{country}/{visa_type}")
async def get_checklist(country: str, visa_type: str, user=Depends(get_current_user)):
    if not db:
        return {"items": {}}
    uid = user["uid"]
    try:
        doc = db.collection("checklists").document(f"{uid}_{country}_{visa_type}").get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        print(f"⚠️ Get checklist error: {e}")
    return {"items": {}, "country": country, "visa_type": visa_type}

@app.post("/api/checklist")
async def save_checklist(req: ChecklistUpdate, user=Depends(get_current_user)):
    if not db:
        return {"saved": False}
    uid = user["uid"]
    try:
        db.collection("checklists").document(f"{uid}_{req.country}_{req.visa_type}").set({
            "uid": uid, "country": req.country, "visa_type": req.visa_type,
            "items": req.items, "updated_at": datetime.utcnow().isoformat(),
        })
        return {"saved": True}
    except Exception as e:
        print(f"⚠️ Save checklist error: {e}")
        return {"saved": False}
