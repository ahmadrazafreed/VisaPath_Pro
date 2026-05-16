import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail,
  sendEmailVerification, updateProfile
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const COUNTRIES = {
  "Canada":         { flag:"🇨🇦", highlight:"PGWP · Express Entry · PR" },
  "United Kingdom": { flag:"🇬🇧", highlight:"Graduate Visa · NHS · Points" },
  "United States":  { flag:"🇺🇸", highlight:"OPT · STEM OPT · H-1B" },
  "Germany":        { flag:"🇩🇪", highlight:"Free Tuition · EU Blue Card" },
  "Australia":      { flag:"🇦🇺", highlight:"485 Visa · SkillSelect" },
  "UAE":            { flag:"🇦🇪", highlight:"Golden Visa · Tax-Free" },
  "New Zealand":    { flag:"🇳🇿", highlight:"AEWV · Skilled Migrant" },
};

// ── API ──────────────────────────────────────────────────────────────────
const api = {
  async tok(u) { try { return await u.getIdToken(); } catch { return ""; } },
  async get(path, u) {
    const r = await fetch(`${BASE}${path}`, { headers:{ Authorization:`Bearer ${await this.tok(u)}` } });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  },
  async post(path, body, u) {
    const r = await fetch(`${BASE}${path}`, {
      method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await this.tok(u)}`},
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  },
  async del(path, u) {
    const r = await fetch(`${BASE}${path}`, { method:"DELETE", headers:{ Authorization:`Bearer ${await this.tok(u)}` } });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  },
  async stream(body, u, onChunk, onDone, onError) {
    try {
      const r = await fetch(`${BASE}/api/chat`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await this.tok(u)}`},
        body: JSON.stringify(body)
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream:true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.error) { onError(d.error); return; }
              if (d.done) { onDone(d.session_id, d.model); return; }
              if (d.text) onChunk(d.text);
            } catch {}
          }
        }
      }
    } catch(e) { onError(e.message); }
  }
};

// ── Markdown ──────────────────────────────────────────────────────────────
function MD({ text }) {
  const html = text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/^\d+\. (.+)$/gm,"<li class='ol'>$1</li>")
    .replace(/^[-•✓] (.+)$/gm,"<li>$1</li>")
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,m=>`<ul>${m}</ul>`)
    .replace(/\n\n+/g,"</p><p>").replace(/\n/g,"<br/>").trim();
  return <div className="md" dangerouslySetInnerHTML={{__html:`<p>${html}</p>`}}/>;
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════
function AuthPage() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verifyStep, setVerifyStep] = useState(false);

  const errMap = {
    "auth/user-not-found":"No account found with this email.",
    "auth/wrong-password":"Incorrect password. Try again.",
    "auth/email-already-in-use":"This email is already registered.",
    "auth/weak-password":"Password must be at least 6 characters.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/too-many-requests":"Too many attempts. Please wait a moment.",
  };

  const handleGoogle = async () => {
    setLoading(true); setError("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e) { setError(errMap[e.code]||e.message); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(""); setInfo("");
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if (!cred.user.emailVerified) {
          await signOut(auth);
          setError("Please verify your email first. Check your inbox.");
        }
      } else if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setVerifyStep(true);
      } else {
        await sendPasswordResetEmail(auth, email);
        setInfo("Password reset email sent! Check your inbox.");
      }
    } catch(e) { setError(errMap[e.code]||e.message); }
    setLoading(false);
  };

  if (verifyStep) return (
    <div style={authWrap}>
      <div style={authCard}>
        <div style={{fontSize:"3rem",textAlign:"center",marginBottom:16}}>📧</div>
        <h2 style={{textAlign:"center",fontSize:"1.3rem",fontWeight:700,marginBottom:8,color:"#e8eaf0"}}>Verify your email</h2>
        <p style={{textAlign:"center",color:"#8b91a8",fontSize:"0.88rem",lineHeight:1.6,marginBottom:24}}>
          We sent a verification link to <strong style={{color:"#e8eaf0"}}>{email}</strong>. Click the link in your email then come back to sign in.
        </p>
        <button onClick={()=>{setVerifyStep(false);setMode("login");}} style={primaryBtn}>Go to Sign In</button>
        <p style={{textAlign:"center",fontSize:"0.78rem",color:"#8b91a8",marginTop:14}}>
          Didn't receive it? <button onClick={async()=>{
            setLoading(true);
            try {
              const cred = await signInWithEmailAndPassword(auth, email, pass);
              await sendEmailVerification(cred.user);
              await signOut(auth);
              setInfo("Verification email resent!");
            } catch {}
            setLoading(false);
          }} style={linkBtnStyle}>Resend email</button>
        </p>
        {info && <div style={infoBox}>{info}</div>}
      </div>
    </div>
  );

  return (
    <div style={authWrap}>
      <div style={authCard}>
        <div style={{fontSize:"1.9rem",fontWeight:800,letterSpacing:-1,textAlign:"center",marginBottom:4,color:"#e8eaf0"}}>
          Visa<span style={{color:"#4f8ef7"}}>Path</span>
          <span style={{fontSize:"0.45em",background:"rgba(79,142,247,0.15)",border:"1px solid rgba(79,142,247,0.3)",color:"#4f8ef7",padding:"2px 8px",borderRadius:6,fontWeight:700,marginLeft:8,verticalAlign:"middle"}}>PRO</span>
        </div>
        <p style={{textAlign:"center",color:"#8b91a8",fontSize:"0.86rem",marginBottom:28}}>
          {mode==="login"?"Your AI immigration consultant":mode==="signup"?"Create your free account":"Reset your password"}
        </p>

        {mode !== "reset" && (
          <>
            <button onClick={handleGoogle} disabled={loading} style={googleBtn}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0"}}>
              <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.08)"}}/>
              <span style={{fontSize:"0.73rem",color:"#3d4263"}}>or with email</span>
              <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.08)"}}/>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup" && <input style={inputStyle} placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} required/>}
          <input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required/>
          {mode!=="reset" && <input style={inputStyle} type="password" placeholder="Password (min 6 chars)" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6}/>}
          {error && <div style={errorBox}>{error}</div>}
          {info && <div style={infoBox}>{info}</div>}
          <button type="submit" disabled={loading} style={primaryBtn}>
            {loading?"Please wait…":mode==="login"?"Sign In →":mode==="signup"?"Create Account →":"Send Reset Email"}
          </button>
        </form>

        <div style={{textAlign:"center",fontSize:"0.8rem",color:"#8b91a8",marginTop:18,display:"flex",flexDirection:"column",gap:8}}>
          {mode==="login" && <>
            <span>No account? <button onClick={()=>{setMode("signup");setError("");}} style={linkBtnStyle}>Sign up free</button></span>
            <button onClick={()=>{setMode("reset");setError("");}} style={{...linkBtnStyle,color:"#8b91a8"}}>Forgot password?</button>
          </>}
          {mode==="signup" && <span>Have an account? <button onClick={()=>{setMode("login");setError("");}} style={linkBtnStyle}>Sign in</button></span>}
          {mode==="reset" && <button onClick={()=>{setMode("login");setError("");}} style={linkBtnStyle}>← Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE MODAL
// ══════════════════════════════════════════════════════════════════════════
function ProfileModal({ user, onClose }) {
  const name = user.displayName || user.email?.split("@")[0] || "User";
  const init = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
  const joined = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}) : "Unknown";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#1a1d27",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:32,width:"100%",maxWidth:380,position:"relative"}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"#8b91a8",cursor:"pointer",fontSize:"1.2rem",lineHeight:1}}>×</button>
        
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",fontWeight:700,color:"white",margin:"0 auto 12px"}}>{init}</div>
          <div style={{fontSize:"1.1rem",fontWeight:700,color:"#e8eaf0"}}>{name}</div>
          <div style={{fontSize:"0.82rem",color:"#8b91a8",marginTop:4}}>{user.email}</div>
          {user.emailVerified && <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",color:"#4ade80",fontSize:"0.72rem",fontWeight:600,marginTop:8}}>✓ Verified</div>}
        </div>

        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,overflow:"hidden",marginBottom:16}}>
          {[["Account type","Free Plan"],["Member since",joined],["Sign-in method",user.providerData[0]?.providerId==="google.com"?"Google":"Email"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{fontSize:"0.82rem",color:"#8b91a8"}}>{k}</span>
              <span style={{fontSize:"0.82rem",color:"#e8eaf0",fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>

        <button onClick={()=>{signOut(auth);onClose();}} style={{width:"100%",padding:"11px",borderRadius:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontFamily:"inherit",fontSize:"0.86rem",fontWeight:600,cursor:"pointer"}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
function Dashboard({ user, onOpenChat }) {
  const [selCountry, setSelCountry] = useState(null);
  const [selVisa, setSelVisa]       = useState(null);
  const [visaData, setVisaData]     = useState(null);
  const [checklist, setChecklist]   = useState({});
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const name = user.displayName || user.email?.split("@")[0] || "User";
  const init = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  useEffect(()=>{ api.get("/api/sessions",user).then(d=>setSessions(d||[])).catch(()=>{}); },[]);

  useEffect(()=>{
    if (selCountry && selVisa) {
      setLoading(true); setVisaData(null);
      api.get(`/api/visa/${encodeURIComponent(selCountry)}/${selVisa}`,user).then(d=>{setVisaData(d);setLoading(false);}).catch(()=>setLoading(false));
      api.get(`/api/checklist/${encodeURIComponent(selCountry)}/${selVisa}`,user).then(d=>setChecklist(d?.items||{})).catch(()=>{});
    }
  },[selCountry,selVisa]);

  const toggleCheck = async(i)=>{
    const u={...checklist,[i]:!checklist[i]}; setChecklist(u);
    api.post("/api/checklist",{country:selCountry,visa_type:selVisa,items:u},user).catch(()=>{});
  };
  const delSession = async(id,e)=>{
    e.stopPropagation();
    await api.del(`/api/sessions/${id}`,user).catch(()=>{});
    setSessions(p=>p.filter(s=>s.id!==id));
  };

  const done = Object.values(checklist).filter(Boolean).length;
  const total = visaData?.requirements?.length||0;
  const pct = total?Math.round(done/total*100):0;

  const Sidebar = ()=>(
    <aside style={{width:240,flexShrink:0,background:"#13161f",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"20px 16px 12px"}}>
        <div style={{fontSize:"1.15rem",fontWeight:800,letterSpacing:-0.5,marginBottom:16,color:"#e8eaf0"}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
        <button onClick={()=>{onOpenChat(selCountry&&selVisa?{country:selCountry,visa:selVisa}:null);setMobileMenuOpen(false);}}
          style={{width:"100%",padding:"10px 16px",borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.84rem",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:"1.1rem"}}>+</span> New Consultation
        </button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
        <div style={{fontSize:"0.62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",padding:"8px 8px 6px"}}>Recent Chats</div>
        {sessions.length===0 && <p style={{fontSize:"0.74rem",color:"#3d4263",padding:"8px"}}>No chats yet</p>}
        {sessions.slice(0,12).map(s=>(
          <div key={s.id} onClick={()=>{onOpenChat({sessionId:s.id,country:s.country,visa:s.visa_type});setMobileMenuOpen(false);}}
            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 8px",borderRadius:9,cursor:"pointer",marginBottom:2,position:"relative"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.querySelector(".dx").style.opacity="1";}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.querySelector(".dx").style.opacity="0";}}>
            <span style={{fontSize:"1rem",flexShrink:0}}>{COUNTRIES[s.country]?.flag||"💬"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"0.78rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||s.country||"General Chat"}</div>
              <div style={{fontSize:"0.67rem",color:"#3d4263",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(s.last_message||"").slice(0,26)}…</div>
            </div>
            <button className="dx" onClick={e=>delSession(s.id,e)} style={{opacity:0,background:"none",border:"none",color:"#ef4444",cursor:"pointer",padding:3,fontSize:"0.75rem",transition:"opacity 0.15s",flexShrink:0}}>✕</button>
          </div>
        ))}
      </div>

      <div style={{padding:"12px 12px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,cursor:"pointer",transition:"background 0.15s"}}
          onClick={()=>setShowProfile(true)}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem",fontWeight:700,color:"white",flexShrink:0}}>{init}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"0.8rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
            <div style={{fontSize:"0.68rem",color:"#3d4263"}}>View profile</div>
          </div>
          <span style={{color:"#3d4263",fontSize:"0.75rem"}}>⋯</span>
        </div>
      </div>
    </aside>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f1117",color:"#e8eaf0",fontFamily:"Inter,-apple-system,sans-serif"}}>
      {/* Mobile nav */}
      <nav style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:56,background:"#13161f",borderBottom:"1px solid rgba(255,255,255,0.06)",position:"sticky",top:0,zIndex:50}} className="mobile-nav">
        <div style={{fontSize:"1.1rem",fontWeight:800,letterSpacing:-0.5}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowProfile(true)} style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",border:"none",color:"white",fontSize:"0.7rem",fontWeight:700,cursor:"pointer"}}>{init}</button>
          <button onClick={()=>setMobileMenuOpen(p=>!p)} style={{width:34,height:34,borderRadius:8,background:"rgba(255,255,255,0.06)",border:"none",color:"#e8eaf0",fontSize:"1.1rem",cursor:"pointer"}}>☰</button>
        </div>
      </nav>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Desktop sidebar */}
        <div className="desktop-sidebar" style={{display:"flex"}}>
          <Sidebar/>
        </div>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div style={{position:"fixed",inset:0,zIndex:200,display:"flex"}} onClick={()=>setMobileMenuOpen(false)}>
            <div style={{width:260,height:"100%"}} onClick={e=>e.stopPropagation()}><Sidebar/></div>
            <div style={{flex:1,background:"rgba(0,0,0,0.5)"}}/>
          </div>
        )}

        <main style={{flex:1,overflowY:"auto"}}>
          {/* Hero */}
          <div style={{padding:"clamp(24px,5vw,48px) clamp(16px,4vw,36px) clamp(20px,4vw,36px)",textAlign:"center",backgroundImage:"radial-gradient(ellipse 70% 60% at 50% 0%,rgba(79,142,247,0.08),transparent)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 14px",borderRadius:20,background:"rgba(79,142,247,0.08)",border:"1px solid rgba(79,142,247,0.2)",fontSize:"0.7rem",fontWeight:700,color:"#4f8ef7",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:16}}>✈️ AI-Powered Immigration Consultant</div>
            <h1 style={{fontSize:"clamp(1.6rem,5vw,3rem)",fontWeight:800,letterSpacing:-1.5,marginBottom:12,lineHeight:1.1}}>Your Visa. <em style={{fontStyle:"normal",color:"#4f8ef7"}}>Our Expertise.</em></h1>
            <p style={{fontSize:"clamp(0.82rem,2vw,0.92rem)",color:"#8b91a8",maxWidth:480,margin:"0 auto 24px",lineHeight:1.7}}>Expert guidance for study, work and travel visas across 7 major destinations — powered by real-time AI.</p>
            <button onClick={()=>onOpenChat(null)} style={{padding:"12px 28px",borderRadius:12,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.9rem",fontWeight:600,cursor:"pointer"}}>Start Consultation →</button>
            <div style={{display:"flex",justifyContent:"center",gap:"clamp(16px,4vw,36px)",marginTop:28,flexWrap:"wrap"}}>
              {[["7","Countries"],["21","Visa Types"],["Live","Data"],["AI","Powered"]].map(([v,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:"clamp(1.2rem,3vw,1.8rem)",fontWeight:800,letterSpacing:-1}}>{v}</div>
                  <div style={{fontSize:"0.72rem",color:"#8b91a8",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Country grid */}
          <div style={{padding:"clamp(16px,3vw,28px) clamp(16px,4vw,36px)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <span style={{fontSize:"0.95rem",fontWeight:700}}>🌍 Select Destination</span>
              <span style={{fontSize:"0.78rem",color:"#8b91a8"}}>Choose a country to explore visas</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))",gap:8}}>
              {Object.entries(COUNTRIES).map(([country,data])=>(
                <div key={country} onClick={()=>{setSelCountry(c=>c===country?null:country);setSelVisa(null);setVisaData(null);setChecklist({});}}
                  style={{background:selCountry===country?"rgba(79,142,247,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${selCountry===country?"rgba(79,142,247,0.5)":"rgba(255,255,255,0.07)"}`,borderRadius:12,padding:"14px 8px",textAlign:"center",cursor:"pointer",transition:"all 0.2s"}}>
                  <div style={{fontSize:"clamp(1.4rem,3vw,2rem)",marginBottom:6}}>{data.flag}</div>
                  <div style={{fontSize:"clamp(0.65rem,1.5vw,0.75rem)",fontWeight:700}}>{country}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visa type selector */}
          {selCountry && (
            <div style={{padding:"16px clamp(16px,4vw,36px)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:"1.3rem"}}>{COUNTRIES[selCountry].flag}</span>
                <span style={{fontWeight:700,marginRight:4}}>{selCountry}</span>
                {[{k:"study",l:"📚 Study",c:"#10b981"},{k:"work",l:"💼 Work",c:"#4f8ef7"},{k:"visit",l:"✈️ Visit",c:"#f59e0b"}].map(vt=>(
                  <button key={vt.k} onClick={()=>setSelVisa(v=>v===vt.k?null:vt.k)}
                    style={{padding:"7px 18px",borderRadius:30,border:`1px solid ${selVisa===vt.k?vt.c:"rgba(255,255,255,0.07)"}`,background:selVisa===vt.k?`${vt.c}18`:"rgba(255,255,255,0.04)",color:selVisa===vt.k?vt.c:"#8b91a8",fontFamily:"inherit",fontSize:"0.82rem",fontWeight:500,cursor:"pointer",transition:"all 0.2s"}}>
                    {vt.l}
                  </button>
                ))}
                <button onClick={()=>onOpenChat({country:selCountry,visa:selVisa})}
                  style={{marginLeft:"auto",padding:"8px 16px",borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.8rem",fontWeight:600,cursor:"pointer"}}>
                  Ask AI →
                </button>
              </div>
            </div>
          )}

          {/* Visa info */}
          {loading && <div style={{textAlign:"center",padding:40,color:"#8b91a8"}}>Loading…</div>}
          {visaData && !loading && (
            <div style={{padding:"20px clamp(16px,4vw,36px)"}}>
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"clamp(16px,3vw,28px)",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:18,borderBottom:"1px solid rgba(255,255,255,0.06)",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:"clamp(1rem,2.5vw,1.25rem)",fontWeight:700,marginBottom:4}}>{visaData.name}</div>
                    <div style={{fontSize:"0.78rem",color:"#8b91a8"}}>{COUNTRIES[selCountry].flag} {selCountry} · {selVisa?.charAt(0).toUpperCase()+selVisa?.slice(1)} Visa</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[["⏱",visaData.time],["💳",visaData.cost]].map(([i,v])=>(
                      <div key={i} style={{padding:"5px 12px",borderRadius:20,fontSize:"0.73rem",fontWeight:600,background:"#21242f",border:"1px solid rgba(255,255,255,0.07)",color:"#8b91a8"}}>
                        {i} <strong style={{color:"#e8eaf0",marginLeft:3}}>{v}</strong>
                      </div>
                    ))}
                    {visaData.official_url&&<a href={visaData.official_url} target="_blank" rel="noreferrer" style={{padding:"5px 12px",borderRadius:20,fontSize:"0.73rem",fontWeight:600,background:"rgba(79,142,247,0.07)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7",textDecoration:"none"}}>🔗 Official</a>}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:24}}>
                  <div>
                    <div style={{fontSize:"0.63rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginBottom:10}}>Requirements</div>
                    {visaData.requirements?.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:9,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:"0.82rem",color:"#8b91a8",lineHeight:1.5}}>
                        <span style={{color:"#4ade80",fontWeight:700,flexShrink:0}}>✓</span>{r}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{fontSize:"0.63rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginBottom:10}}>Process</div>
                    {visaData.process?.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                        <div style={{width:20,height:20,borderRadius:"50%",background:"#4f8ef7",color:"white",fontSize:"0.62rem",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>{i+1}</div>
                        <div style={{fontSize:"0.82rem",color:"#8b91a8",lineHeight:1.5}}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {visaData.tips&&<div style={{marginTop:18,padding:"13px 16px",background:"rgba(79,142,247,0.06)",border:"1px solid rgba(79,142,247,0.15)",borderRadius:10}}>
                  <div style={{fontSize:"0.62rem",fontWeight:700,color:"#4f8ef7",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>💡 Expert Tips</div>
                  <div style={{fontSize:"0.81rem",color:"#8b91a8",lineHeight:1.6}}>{visaData.tips}</div>
                </div>}
                <button onClick={()=>onOpenChat({country:selCountry,visa:selVisa})} style={{width:"100%",padding:12,borderRadius:10,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.86rem",fontWeight:600,cursor:"pointer",marginTop:16}}>
                  💬 Ask AI about this visa →
                </button>
              </div>

              {/* Checklist */}
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"clamp(16px,3vw,24px)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <span style={{fontSize:"0.95rem",fontWeight:700}}>📋 Document Checklist</span>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:"0.73rem",fontWeight:600,background:"rgba(79,142,247,0.1)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7"}}>{done}/{total}</span>
                </div>
                {visaData.requirements?.map((req,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                    <input type="checkbox" id={`c${i}`} checked={!!checklist[i]} onChange={()=>toggleCheck(i)} style={{marginTop:3,cursor:"pointer",accentColor:"#4f8ef7",flexShrink:0}}/>
                    <label htmlFor={`c${i}`} style={{fontSize:"0.82rem",color:checklist[i]?"#3d4263":"#8b91a8",cursor:"pointer",lineHeight:1.5,textDecoration:checklist[i]?"line-through":"none"}}>{req}</label>
                  </div>
                ))}
                <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2,marginTop:12,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"linear-gradient(90deg,#4f8ef7,#4ade80)",width:`${pct}%`,transition:"width 0.4s ease"}}/>
                </div>
                <div style={{fontSize:"0.71rem",color:"#8b91a8",marginTop:5}}>{pct}% complete</div>
              </div>
            </div>
          )}

          {/* Sample questions */}
          {!selCountry && (
            <div style={{padding:"24px clamp(16px,4vw,36px)"}}>
              <div style={{fontWeight:700,marginBottom:16,fontSize:"0.95rem"}}>💡 Popular Questions</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
                {[
                  {icon:"🇨🇦",label:"Canada Study Permit",hint:"Requirements, SOP, work rights",q:"What are all requirements for Canada Study Permit?"},
                  {icon:"🇬🇧",label:"UK Skilled Worker",hint:"Sponsorship, salary, ILR path",q:"Explain UK Skilled Worker visa process."},
                  {icon:"🇩🇪",label:"Germany Free Study",hint:"APS cert, blocked account",q:"How can I study in Germany for free?"},
                  {icon:"🇦🇺",label:"Australia PR Path",hint:"Points, 485 visa",q:"What is the fastest pathway to Australian PR?"},
                  {icon:"🇺🇸",label:"US F-1 Interview",hint:"214(b), ties to home country",q:"Tips for passing US F-1 visa interview as Pakistani applicant."},
                  {icon:"🇦🇪",label:"UAE Golden Visa",hint:"Eligibility, 10-year visa",q:"How do I qualify for UAE Golden Visa?"},
                ].map((s,i)=>(
                  <button key={i} onClick={()=>onOpenChat({prefill:s.q})}
                    style={{padding:16,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all 0.2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.12)";e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                    <span style={{fontSize:"1.3rem",display:"block",marginBottom:7}}>{s.icon}</span>
                    <div style={{fontSize:"0.82rem",fontWeight:600,color:"#e8eaf0",marginBottom:3}}>{s.label}</div>
                    <div style={{fontSize:"0.71rem",color:"#8b91a8",lineHeight:1.4}}>{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {showProfile && <ProfileModal user={user} onClose={()=>setShowProfile(false)}/>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @media(max-width:768px){
          .mobile-nav{display:flex!important}
          .desktop-sidebar{display:none!important}
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CHAT PAGE
// ══════════════════════════════════════════════════════════════════════════
function ChatPage({ user, context, onBack }) {
  const [msgs, setMsgs]         = useState([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [canStop, setCanStop]   = useState(false);
  const [sid, setSid]           = useState(context?.sessionId||null);
  const [sessions, setSessions] = useState([]);
  const [stream, setStream]     = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveSearch, setLiveSearch]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [lastModel, setLastModel]     = useState("⚡ Flash");
  const stopRef   = useRef(false);
  const bottomRef = useRef(null);
  const taRef     = useRef(null);
  const fired     = useRef(false);

  const country = context?.country||null;
  const visa    = context?.visa||null;
  const name    = user.displayName||user.email?.split("@")[0]||"User";
  const init    = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  useEffect(()=>{ api.get("/api/sessions",user).then(d=>setSessions(d||[])).catch(()=>{}); },[]);
  useEffect(()=>{ sid?api.get(`/api/sessions/${sid}/messages`,user).then(d=>setMsgs(d||[])).catch(()=>{}):setMsgs([]); },[sid]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,stream,busy]);
  useEffect(()=>{
    if(context?.prefill&&!fired.current){fired.current=true;setTimeout(()=>send(context.prefill),400);}
  },[]);

  const delSession=async(id,e)=>{
    e.stopPropagation();
    await api.del(`/api/sessions/${id}`,user).catch(()=>{});
    setSessions(p=>p.filter(s=>s.id!==id));
    if(sid===id){setSid(null);setMsgs([]);}
  };

  const stopGeneration=()=>{ stopRef.current=true; };

  const send=useCallback(async(txt)=>{
    const msg=(txt||input).trim();
    if(!msg||busy)return;
    setInput(""); setBusy(true); setCanStop(true); setStream(""); stopRef.current=false;
    if(taRef.current)taRef.current.style.height="auto";
    const history=msgs.map(m=>({role:m.role,content:m.content}));
    setMsgs(p=>[...p,{role:"user",content:msg,timestamp:new Date().toISOString()}]);
    let full="",newSid=sid;
    try {
      await api.stream(
        {message:msg,session_id:sid,country,visa_type:visa,use_search:liveSearch,history},
        user,
        chunk=>{
          if(stopRef.current)return;
          full+=chunk; setStream(full);
        },
        (id, modelLabel)=>{ if(id)newSid=id; if(modelLabel)setLastModel(modelLabel); },
        async()=>{
          if(!stopRef.current){
            try{
              const d=await api.post("/api/chat/simple",{message:msg,session_id:sid,country,visa_type:visa,use_search:liveSearch,history},user);
              full=d.response; newSid=d.session_id;
            }catch{ full="⚠️ Connection error. Please try again."; }
          }
        }
      );
    }catch(e){ full="⚠️ "+e.message; }
    if(!stopRef.current||full){
      setStream(""); setSid(newSid);
      setMsgs(p=>[...p,{role:"assistant",content:full||stream,timestamp:new Date().toISOString(),model:lastModel}]);
    }
    setBusy(false); setCanStop(false); stopRef.current=false;
    api.get("/api/sessions",user).then(d=>setSessions(d||[])).catch(()=>{});
  },[input,busy,sid,country,visa,liveSearch,msgs,stream]);

  const onKey=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};

  const suggestions=country?[
    `What documents do I need for ${country} ${visa||"study"} visa?`,
    `Cost and processing time for ${country} ${visa||"study"} visa?`,
    `Common rejection reasons for ${country}?`,
    `Explain ${country} ${visa||"study"} visa process in detail`,
  ]:[
    "Requirements for Canada Study Permit from Pakistan?",
    "How does UK Skilled Worker visa work?",
    "How to study in Germany for free?",
    "How to qualify for UAE Golden Visa?",
  ];

  const SidebarContent=()=>(
    <>
      <div style={{padding:"20px 16px 12px"}}>
        <div style={{fontSize:"1.15rem",fontWeight:800,letterSpacing:-0.5,marginBottom:16}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
        <button onClick={()=>{setSid(null);setMsgs([]);setStream("");setInput("");setMobileOpen(false);}}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"9px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.82rem",fontWeight:500,cursor:"pointer"}}>
          + New chat
        </button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
        <div style={{fontSize:"0.62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",padding:"6px 8px"}}>Conversations</div>
        {sessions.length===0&&<p style={{fontSize:"0.73rem",color:"#3d4263",padding:"8px"}}>No conversations yet</p>}
        {sessions.map(s=>(
          <div key={s.id} onClick={()=>{setSid(s.id);setMobileOpen(false);}}
            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 8px",borderRadius:9,cursor:"pointer",marginBottom:2,position:"relative",background:s.id===sid?"rgba(79,142,247,0.1)":"transparent",border:s.id===sid?"1px solid rgba(79,142,247,0.15)":"1px solid transparent"}}
            onMouseEnter={e=>{if(s.id!==sid)e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.querySelector(".sdx").style.opacity="1";}}
            onMouseLeave={e=>{if(s.id!==sid)e.currentTarget.style.background="transparent";e.currentTarget.querySelector(".sdx").style.opacity="0";}}>
            <span style={{fontSize:"0.95rem",flexShrink:0}}>{COUNTRIES[s.country]?.flag||"💬"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"0.77rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||s.country||"General Chat"}</div>
              <div style={{fontSize:"0.66rem",color:"#3d4263",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(s.last_message||"").slice(0,24)}…</div>
            </div>
            <button className="sdx" onClick={e=>delSession(s.id,e)} style={{opacity:0,background:"none",border:"none",color:"#ef4444",cursor:"pointer",padding:3,fontSize:"0.72rem",flexShrink:0,transition:"opacity 0.15s"}}>✕</button>
          </div>
        ))}
      </div>
      <div style={{padding:"12px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,cursor:"pointer"}}
          onClick={()=>setShowProfile(true)}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.68rem",fontWeight:700,color:"white",flexShrink:0}}>{init}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"0.78rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
            <div style={{fontSize:"0.66rem",color:"#3d4263"}}>View profile</div>
          </div>
          <span style={{color:"#3d4263",fontSize:"0.72rem"}}>⋯</span>
        </div>
      </div>
    </>
  );

  return (
    <div style={{display:"flex",height:"100vh",background:"#0f1117",color:"#e8eaf0",fontFamily:"Inter,-apple-system,sans-serif",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        .md p{margin-bottom:10px;line-height:1.75;color:#c8d3e8;font-size:0.9rem}
        .md p:last-child{margin-bottom:0}
        .md h1{font-size:1.1rem;font-weight:700;color:#e8eaf0;margin:16px 0 8px;padding-bottom:7px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .md h2{font-size:1rem;font-weight:700;color:#e8eaf0;margin:14px 0 7px}
        .md h3{font-size:0.92rem;font-weight:600;color:#8b91a8;margin:12px 0 5px}
        .md ul{list-style:none;padding:0;margin:10px 0}
        .md li{display:flex;gap:9px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.87rem;color:#8b91a8;line-height:1.6}
        .md li::before{content:'›';color:#4f8ef7;font-weight:700;flex-shrink:0;font-size:1rem}
        .md strong{font-weight:600;color:#e8eaf0}
        .md em{color:#8b91a8;font-style:italic}
        .md code{font-family:monospace;background:rgba(79,142,247,0.1);color:#93c5fd;padding:2px 6px;border-radius:4px;font-size:0.82rem}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);background:#3d4263}30%{transform:translateY(-6px);background:#4f8ef7}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .chat-sidebar-desktop{display:none!important}
          .chat-msg{padding:4px 14px!important}
          .chat-bubble{max-width:88%!important}
          .chat-input-wrap{padding:8px 12px 14px!important}
          .chat-suggestions{grid-template-columns:1fr!important}
          .chat-ctx-chip{display:none!important}
        }
      `}</style>

      {/* Desktop sidebar */}
      {sidebarOpen && (
        <aside className="chat-sidebar-desktop" style={{width:256,flexShrink:0,background:"#13161f",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column"}}>
          <SidebarContent/>
        </aside>
      )}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}} onClick={()=>setMobileOpen(false)}>
          <aside style={{width:260,height:"100%",background:"#13161f",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
            <SidebarContent/>
          </aside>
          <div style={{flex:1,background:"rgba(0,0,0,0.6)"}}/>
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* Header */}
        <header style={{display:"flex",alignItems:"center",gap:10,padding:"0 14px",height:52,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,17,23,0.9)",backdropFilter:"blur(12px)"}}>
          <button onClick={()=>{setSidebarOpen(p=>!p);setMobileOpen(p=>!p);}}
            style={{width:32,height:32,borderRadius:8,border:"none",background:"transparent",color:"#8b91a8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>
            ☰
          </button>
          {country&&<div className="chat-ctx-chip" style={{padding:"3px 10px",borderRadius:20,fontSize:"0.72rem",fontWeight:600,background:"rgba(79,142,247,0.1)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7"}}>{COUNTRIES[country]?.flag||"🌍"} {country}{visa?` · ${visa}`:""}</div>}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={liveSearch} onChange={e=>setLiveSearch(e.target.checked)} style={{display:"none"}}/>
              <div style={{width:32,height:17,borderRadius:9,background:liveSearch?"#4f8ef7":"rgba(255,255,255,0.1)",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:2,width:13,height:13,borderRadius:"50%",background:"white",transition:"transform 0.2s",transform:liveSearch?"translateX(15px)":"none"}}/>
              </div>
              <span style={{fontSize:"0.7rem",color:"#8b91a8"}}>{liveSearch?"🔍 Live":"⚡ Fast"}</span>
            </label>
            <button onClick={()=>setShowProfile(true)}
              style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",border:"none",color:"white",fontSize:"0.66rem",fontWeight:700,cursor:"pointer"}}>
              {init}
            </button>
            <button onClick={onBack}
              style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.08)",background:"transparent",color:"#8b91a8",cursor:"pointer",fontSize:"0.75rem"}}>
              ⊞
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"24px 0",display:"flex",flexDirection:"column",gap:2}}>
          {/* Welcome */}
          {msgs.length===0&&!busy&&(
            <div style={{maxWidth:600,margin:"auto",padding:"0 20px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1}}>
              <div style={{width:54,height:54,borderRadius:16,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",margin:"0 auto 14px"}}>✈</div>
              <h2 style={{fontSize:"clamp(1.2rem,4vw,1.6rem)",fontWeight:700,letterSpacing:-0.5,marginBottom:8}}>
                {country?`${country} Visa Expert`:"VisaPath AI"}
              </h2>
              <p style={{fontSize:"0.86rem",color:"#8b91a8",lineHeight:1.7,marginBottom:24,maxWidth:420}}>
                Ask me anything — quick answers for simple questions, detailed guides when you need depth.
              </p>
              <div className="chat-suggestions" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",textAlign:"left"}}>
                {suggestions.map((q,i)=>(
                  <button key={i} onClick={()=>send(q)}
                    style={{padding:"12px 14px",borderRadius:12,textAlign:"left",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",color:"#8b91a8",fontFamily:"inherit",fontSize:"0.78rem",cursor:"pointer",transition:"all 0.2s",lineHeight:1.5}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#4f8ef7";e.currentTarget.style.color="#e8eaf0";e.currentTarget.style.background="rgba(79,142,247,0.06)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.color="#8b91a8";e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages — USER RIGHT, AI LEFT */}
          {msgs.map((m,i)=>(
            <div key={i} className="chat-msg" style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 22px",maxWidth:880,width:"100%",margin:"0 auto",flexDirection:m.role==="user"?"row-reverse":"row"}}>
              <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:m.role==="user"?"linear-gradient(135deg,#10b981,#3b82f6)":"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:m.role==="user"?"0.66rem":"0.82rem",fontWeight:700,color:"white",marginTop:4}}>
                {m.role==="user"?init:"✈"}
              </div>
              <div className="chat-bubble" style={{maxWidth:"76%",borderRadius:m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px",padding:m.role==="user"?"11px 16px":"8px 4px",fontSize:"0.9rem",lineHeight:1.75,wordBreak:"break-word",background:m.role==="user"?"#1e3a5f":"transparent",color:m.role==="user"?"#e2eeff":"#e8eaf0"}}>
                {m.role==="assistant"?<>
                {m.model&&<div style={{fontSize:"0.63rem",color:"#4f8ef7",marginBottom:4,fontWeight:600}}>{m.model}</div>}
                <MD text={m.content}/>
              </>:m.content}
              </div>
            </div>
          ))}

          {/* Streaming */}
          {stream&&(
            <div className="chat-msg" style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 22px",maxWidth:880,width:"100%",margin:"0 auto"}}>
              <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.82rem",color:"white",marginTop:4}}>✈</div>
              <div style={{maxWidth:"76%",padding:"8px 4px",fontSize:"0.9rem",lineHeight:1.75}}>
                <div style={{fontSize:"0.65rem",color:"#4f8ef7",marginBottom:4,fontWeight:600}}>{lastModel}</div>
                <MD text={stream}/>
                <span style={{display:"inline-block",width:2,height:15,background:"#4f8ef7",marginLeft:2,verticalAlign:"middle",animation:"blink 0.8s step-end infinite"}}/>
              </div>
            </div>
          )}

          {/* Typing dots */}
          {busy&&!stream&&(
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 22px",maxWidth:880,width:"100%",margin:"0 auto"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",marginTop:4}}>✈</div>
              <div style={{display:"flex",gap:5,padding:"13px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"4px 16px 16px 16px"}}>
                {[0,0.15,0.3].map((d,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",animation:`bounce 1.2s ${d}s infinite`}}/>)}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Stop button */}
        {canStop && (
          <div style={{display:"flex",justifyContent:"center",padding:"4px 0"}}>
            <button onClick={stopGeneration}
              style={{padding:"6px 18px",borderRadius:20,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontFamily:"inherit",fontSize:"0.78rem",fontWeight:600,cursor:"pointer"}}>
              ⏹ Stop generating
            </button>
          </div>
        )}

        {/* Input */}
        <div className="chat-input-wrap" style={{padding:"10px 22px 18px",flexShrink:0,background:"linear-gradient(to top,#0f1117 85%,transparent)"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,background:"#1a1d27",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"10px 10px 10px 16px",maxWidth:860,margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,0.25)",transition:"border-color 0.2s"}}
            onFocus={e=>e.currentTarget.style.borderColor="rgba(79,142,247,0.4)"}
            onBlur={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}>
            <textarea ref={taRef} rows={1} disabled={busy}
              placeholder={country?`Ask about ${country}${visa?" "+visa:""} visa…`:"Ask anything about visas, immigration, study abroad…"}
              value={input}
              onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,150)+"px";}}
              onKeyDown={onKey}
              style={{flex:1,background:"none",border:"none",outline:"none",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.9rem",resize:"none",minHeight:24,maxHeight:150,lineHeight:1.6,paddingTop:2}}/>
            <button onClick={()=>send()} disabled={!input.trim()||busy}
              style={{width:36,height:36,borderRadius:9,flexShrink:0,background:(!input.trim()||busy)?"rgba(255,255,255,0.06)":"#4f8ef7",border:"none",color:(!input.trim()||busy)?"#3d4263":"white",cursor:(!input.trim()||busy)?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
              {busy
                ?<div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:"white",animation:"spin 0.7s linear infinite"}}/>
                :<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              }
            </button>
          </div>
          <p style={{textAlign:"center",fontSize:"0.64rem",color:"#3d4263",marginTop:7,maxWidth:860,marginLeft:"auto",marginRight:"auto"}}>
            VisaPath AI · Enter to send · Shift+Enter for new line{liveSearch?" · 🔍 Live search ON":""}
          </p>
        </div>
      </div>

      {showProfile&&<ProfileModal user={user} onClose={()=>setShowProfile(false)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage]   = useState("dashboard");
  const [ctx, setCtx]     = useState(null);

  useEffect(()=>{ return onAuthStateChanged(auth,u=>{setUser(u);setReady(true);}); },[]);

  if (!ready) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f1117",flexDirection:"column",gap:16}}>
      <div style={{fontSize:"1.8rem",fontWeight:800,color:"#e8eaf0",letterSpacing:-1}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
      <div style={{width:26,height:26,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.1)",borderTopColor:"#4f8ef7",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <AuthPage/>;

  return page==="dashboard"
    ?<Dashboard user={user} onOpenChat={c=>{setCtx(c);setPage("chat");}}/>
    :<ChatPage  user={user} auth={auth} context={ctx} onBack={()=>setPage("dashboard")}/>;
}

// ── Styles ────────────────────────────────────────────────────────────────
const authWrap = {minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1117",backgroundImage:"radial-gradient(ellipse 80% 50% at 50% -5%,rgba(79,142,247,0.12),transparent)",padding:16,fontFamily:"Inter,-apple-system,sans-serif"};
const authCard = {width:"100%",maxWidth:400,padding:"clamp(24px,5vw,40px)",background:"#1a1d27",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20};
const primaryBtn = {width:"100%",padding:12,borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.88rem",fontWeight:600,cursor:"pointer"};
const googleBtn = {width:"100%",padding:11,borderRadius:10,background:"#21242f",border:"1px solid rgba(255,255,255,0.08)",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.87rem",fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10};
const inputStyle = {width:"100%",padding:"11px 14px",borderRadius:10,background:"#21242f",border:"1px solid rgba(255,255,255,0.08)",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.88rem",outline:"none"};
const linkBtnStyle = {background:"none",border:"none",color:"#4f8ef7",cursor:"pointer",fontWeight:600,fontSize:"0.8rem",fontFamily:"inherit"};
const errorBox = {color:"#ef4444",fontSize:"0.8rem",padding:"10px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.15)"};
const infoBox = {color:"#4ade80",fontSize:"0.8rem",padding:"10px 12px",background:"rgba(74,222,128,0.08)",borderRadius:8,border:"1px solid rgba(74,222,128,0.15)"};
