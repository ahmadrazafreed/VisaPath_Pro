import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from "firebase/auth";

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
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Country data ─────────────────────────────────────────────────────────
const COUNTRIES = {
  "Canada":         { flag:"🇨🇦", code:"CA", highlight:"PGWP · Express Entry · Free Healthcare" },
  "United Kingdom": { flag:"🇬🇧", code:"GB", highlight:"Graduate Visa · NHS · Points-based" },
  "United States":  { flag:"🇺🇸", code:"US", highlight:"OPT · STEM OPT · H-1B · Green Card" },
  "Germany":        { flag:"🇩🇪", code:"DE", highlight:"Free Tuition · EU Blue Card · Job Seeker" },
  "Australia":      { flag:"🇦🇺", code:"AU", highlight:"485 Visa · SkillSelect · Employer 482" },
  "UAE":            { flag:"🇦🇪", code:"AE", highlight:"Golden Visa · Tax-free · Fast Processing" },
  "New Zealand":    { flag:"🇳🇿", code:"NZ", highlight:"AEWV · Skilled Migrant · Quality of Life" },
};

// ── API helper ────────────────────────────────────────────────────────────
const api = {
  async getToken(user) { try { return await user.getIdToken(); } catch { return null; } },
  async get(path, user) {
    const token = await this.getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  },
  async post(path, body, user) {
    const token = await this.getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, {
      method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  },
  async delete(path, user) {
    const token = await this.getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  },
  async stream(body, user, onChunk, onDone, onError) {
    const token = await this.getToken(user);
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify(body)
      });
      const reader = res.body.getReader();
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
              if (d.done) { onDone(d.session_id); return; }
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

// ── Loader ────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f1117",gap:20}}>
      <div style={{fontSize:"1.8rem",fontWeight:800,color:"#e8eaf0",letterSpacing:-1}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
      <div style={{width:28,height:28,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.1)",borderTopColor:"#4f8ef7",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════
function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const err = (e) => {
    const m = { "auth/user-not-found":"No account with this email.", "auth/wrong-password":"Incorrect password.", "auth/email-already-in-use":"Email already registered.", "auth/weak-password":"Password must be 6+ characters.", "auth/invalid-email":"Invalid email." };
    setError(m[e.code] || e.message);
  };

  const handleGoogle = async () => {
    setLoading(true); setError("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e) { err(e); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(""); setMsg("");
    try {
      if (mode==="login") await signInWithEmailAndPassword(auth, email, pass);
      else if (mode==="signup") await createUserWithEmailAndPassword(auth, email, pass);
      else { await sendPasswordResetEmail(auth, email); setMsg("Reset email sent! Check your inbox."); }
    } catch(e) { err(e); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1117",backgroundImage:"radial-gradient(ellipse 80% 50% at 50% -5%,rgba(79,142,247,0.12),transparent)"}}>
      <div style={{width:"100%",maxWidth:400,padding:40,background:"#1a1d27",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20}}>
        <div style={{fontSize:"1.9rem",fontWeight:800,letterSpacing:-1,textAlign:"center",marginBottom:4,color:"#e8eaf0"}}>
          Visa<span style={{color:"#4f8ef7"}}>Path</span> <span style={{fontSize:"0.55em",background:"rgba(79,142,247,0.15)",border:"1px solid rgba(79,142,247,0.3)",color:"#4f8ef7",padding:"2px 8px",borderRadius:6,fontWeight:700}}>PRO</span>
        </div>
        <p style={{textAlign:"center",color:"#8b91a8",fontSize:"0.86rem",marginBottom:28}}>
          {mode==="login"?"Your AI immigration consultant":mode==="signup"?"Create your free account":"Reset your password"}
        </p>

        {mode!=="reset" && (
          <>
            <button onClick={handleGoogle} disabled={loading} style={{width:"100%",padding:11,borderRadius:10,background:"#21242f",border:"1px solid rgba(255,255,255,0.08)",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.87rem",fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all 0.2s"}}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              {loading?"Signing in...":"Continue with Google"}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0"}}>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,0.08)"}}/>
              <span style={{fontSize:"0.73rem",color:"#3d4263"}}>or continue with email</span>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,0.08)"}}/>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:14}}>
          {mode==="signup" && <input style={inputStyle} placeholder="Full Name" required/>}
          <input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required/>
          {mode!=="reset" && <input style={inputStyle} type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} required/>}
          {error && <div style={{color:"#ef4444",fontSize:"0.8rem",padding:"10px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{error}</div>}
          {msg && <div style={{color:"#4ade80",fontSize:"0.8rem",padding:"10px 12px",background:"rgba(74,222,128,0.08)",borderRadius:8}}>{msg}</div>}
          <button type="submit" disabled={loading} style={{padding:12,borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.88rem",fontWeight:600,cursor:"pointer"}}>
            {loading?"Please wait...":mode==="login"?"Sign In":mode==="signup"?"Create Account":"Send Reset Email"}
          </button>
        </form>

        <div style={{textAlign:"center",fontSize:"0.8rem",color:"#8b91a8",marginTop:18}}>
          {mode==="login" && <><span>No account? </span><button onClick={()=>{setMode("signup");setError("");}} style={linkBtn}>Sign up free</button><br/><br/><button onClick={()=>{setMode("reset");setError("");}} style={{...linkBtn,color:"#8b91a8"}}>Forgot password?</button></>}
          {mode==="signup" && <><span>Have account? </span><button onClick={()=>{setMode("login");setError("");}} style={linkBtn}>Sign in</button></>}
          {mode==="reset" && <button onClick={()=>{setMode("login");setError("");}} style={linkBtn}>← Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}
const inputStyle = {width:"100%",padding:"11px 14px",borderRadius:10,background:"#21242f",border:"1px solid rgba(255,255,255,0.08)",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.88rem",outline:"none"};
const linkBtn = {background:"none",border:"none",color:"#4f8ef7",cursor:"pointer",fontWeight:600,fontSize:"0.8rem"};

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

  useEffect(() => {
    api.get("/api/sessions", user).then(d=>setSessions(d||[])).catch(()=>{});
  }, []);

  useEffect(() => {
    if (selCountry && selVisa) {
      setLoading(true); setVisaData(null);
      api.get(`/api/visa/${encodeURIComponent(selCountry)}/${selVisa}`, user)
        .then(d=>{setVisaData(d);setLoading(false);}).catch(()=>setLoading(false));
      api.get(`/api/checklist/${encodeURIComponent(selCountry)}/${selVisa}`, user)
        .then(d=>setChecklist(d?.items||{})).catch(()=>{});
    }
  }, [selCountry, selVisa]);

  const toggleCheck = async (i) => {
    const u = {...checklist,[i]:!checklist[i]};
    setChecklist(u);
    api.post("/api/checklist",{country:selCountry,visa_type:selVisa,items:u},user).catch(()=>{});
  };
  const delSession = async (id,e) => {
    e.stopPropagation();
    await api.delete(`/api/sessions/${id}`,user).catch(()=>{});
    setSessions(p=>p.filter(s=>s.id!==id));
  };

  const done = Object.values(checklist).filter(Boolean).length;
  const total = visaData?.requirements?.length||0;
  const pct = total?Math.round(done/total*100):0;
  const name = user.displayName||user.email?.split("@")[0]||"User";
  const init = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"#0f1117",color:"#e8eaf0",fontFamily:"Inter,-apple-system,sans-serif"}}>
      {/* NAV */}
      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:58,background:"rgba(15,17,23,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.07)",position:"sticky",top:0,zIndex:100}}>
        <div style={{fontSize:"1.2rem",fontWeight:800,letterSpacing:-0.5}}>Visa<span style={{color:"#4f8ef7"}}>Path</span> <span style={{fontSize:"0.55em",background:"rgba(79,142,247,0.15)",border:"1px solid rgba(79,142,247,0.3)",color:"#4f8ef7",padding:"2px 8px",borderRadius:6,fontWeight:700,verticalAlign:"middle"}}>PRO</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:"0.7rem",fontWeight:700,color:"#4ade80"}}>● LIVE</span>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:30,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",fontWeight:700,color:"white"}}>{init}</div>
            <span style={{fontSize:"0.8rem",color:"#8b91a8"}}>{name}</span>
          </div>
          <button onClick={()=>signOut(auth)} style={{padding:"6px 14px",borderRadius:8,background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"#8b91a8",fontFamily:"inherit",fontSize:"0.78rem",cursor:"pointer"}}>Sign out</button>
        </div>
      </nav>

      <div style={{display:"flex",flex:1}}>
        {/* SIDEBAR */}
        <aside style={{width:240,flexShrink:0,background:"#1a1d27",borderRight:"1px solid rgba(255,255,255,0.07)",padding:16,display:"flex",flexDirection:"column",gap:4,overflowY:"auto"}}>
          <button onClick={()=>onOpenChat(selCountry&&selVisa?{country:selCountry,visa:selVisa}:null)}
            style={{width:"100%",padding:11,borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.84rem",fontWeight:600,cursor:"pointer",marginBottom:16}}>
            ✦ New Consultation
          </button>

          <div style={{fontSize:"0.62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginBottom:8}}>Recent Chats</div>
          {sessions.length===0 && <p style={{fontSize:"0.74rem",color:"#3d4263",lineHeight:1.5}}>No chats yet</p>}
          {sessions.slice(0,10).map(s=>(
            <div key={s.id} onClick={()=>onOpenChat({sessionId:s.id,country:s.country,visa:s.visa_type})}
              style={{display:"flex",alignItems:"center",gap:8,padding:"9px 8px",borderRadius:9,cursor:"pointer",marginBottom:2,position:"relative"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.querySelector(".del-btn").style.opacity="1";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.querySelector(".del-btn").style.opacity="0";}}>
              <span style={{fontSize:"1rem",flexShrink:0}}>{COUNTRIES[s.country]?.flag||"💬"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"0.78rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||s.country||"General Chat"}</div>
                <div style={{fontSize:"0.67rem",color:"#3d4263",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(s.last_message||"").slice(0,28)}…</div>
              </div>
              <button className="del-btn" onClick={e=>delSession(s.id,e)} style={{opacity:0,background:"none",border:"none",color:"#ef4444",cursor:"pointer",padding:"3px",borderRadius:4,flexShrink:0,transition:"opacity 0.15s"}}>✕</button>
            </div>
          ))}

          {selCountry&&selVisa&&(
            <>
              <div style={{fontSize:"0.62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginTop:16,marginBottom:8}}>Quick Ask</div>
              {["What documents do I need?","Processing time?","Cost breakdown?","Work rights?","Rejection reasons?"].map((q,i)=>(
                <button key={i} onClick={()=>onOpenChat({country:selCountry,visa:selVisa,prefill:q+` for ${selCountry} ${selVisa} visa`})}
                  style={{width:"100%",textAlign:"left",padding:"7px 8px",borderRadius:7,background:"transparent",border:"none",color:"#8b91a8",fontFamily:"inherit",fontSize:"0.73rem",cursor:"pointer",marginBottom:2,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.target.style.background="rgba(79,142,247,0.08)";e.target.style.color="#e8eaf0";}}
                  onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color="#8b91a8";}}>
                  {q}
                </button>
              ))}
            </>
          )}
        </aside>

        {/* MAIN */}
        <main style={{flex:1,overflowY:"auto"}}>
          {/* HERO */}
          <div style={{padding:"48px 36px 36px",textAlign:"center",backgroundImage:"radial-gradient(ellipse 70% 60% at 50% 0%,rgba(79,142,247,0.08),transparent)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 14px",borderRadius:20,background:"rgba(79,142,247,0.08)",border:"1px solid rgba(79,142,247,0.2)",fontSize:"0.72rem",fontWeight:700,color:"#4f8ef7",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:18}}>✈️ AI-Powered Immigration Consultant</div>
            <h1 style={{fontSize:"clamp(1.8rem,4vw,3rem)",fontWeight:800,letterSpacing:-1.5,marginBottom:12,lineHeight:1.1}}>Your Visa. <em style={{fontStyle:"normal",color:"#4f8ef7"}}>Our Expertise.</em></h1>
            <p style={{fontSize:"0.92rem",color:"#8b91a8",maxWidth:480,margin:"0 auto 28px",lineHeight:1.7}}>Expert guidance for study, work and travel visas across 7 major destinations — powered by real-time AI.</p>
            <div style={{display:"flex",justifyContent:"center",gap:36}}>
              {[["7","Countries"],["21","Visa Types"],["Live","Processing Times"],["AI","Web Search"]].map(([v,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:"1.8rem",fontWeight:800,letterSpacing:-1}}>{v}</div>
                  <div style={{fontSize:"0.72rem",color:"#8b91a8",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* COUNTRY SELECTOR */}
          <div style={{padding:"28px 36px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <span style={{fontSize:"1rem",fontWeight:700}}>🌍 Select Destination</span>
              <span style={{fontSize:"0.8rem",color:"#8b91a8"}}>Click a country to explore visas</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10}}>
              {Object.entries(COUNTRIES).map(([country,data])=>(
                <div key={country}
                  onClick={()=>{setSelCountry(country);setSelVisa(null);setVisaData(null);setChecklist({});}}
                  style={{background:selCountry===country?"rgba(79,142,247,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${selCountry===country?"#4f8ef7":"rgba(255,255,255,0.07)"}`,borderRadius:12,padding:"18px 10px",textAlign:"center",cursor:"pointer",transition:"all 0.2s"}}>
                  <div style={{fontSize:"2rem",marginBottom:7}}>{data.flag}</div>
                  <div style={{fontSize:"0.75rem",fontWeight:700}}>{country}</div>
                  <div style={{fontSize:"0.62rem",color:"#8b91a8",marginTop:3,lineHeight:1.3}}>{data.highlight.split("·")[0].trim()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* VISA TYPE */}
          {selCountry && (
            <div style={{padding:"20px 36px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:"1.5rem"}}>{COUNTRIES[selCountry].flag}</span>
                <span style={{fontWeight:700,marginRight:8}}>{selCountry}</span>
                {[{k:"study",l:"📚 Study",c:"#10b981"},{k:"work",l:"💼 Work",c:"#4f8ef7"},{k:"visit",l:"✈️ Visit",c:"#f59e0b"}].map(vt=>(
                  <button key={vt.k} onClick={()=>setSelVisa(vt.k)}
                    style={{padding:"8px 20px",borderRadius:30,border:`1px solid ${selVisa===vt.k?vt.c:"rgba(255,255,255,0.07)"}`,background:selVisa===vt.k?`${vt.c}18`:"rgba(255,255,255,0.04)",color:selVisa===vt.k?vt.c:"#8b91a8",fontFamily:"inherit",fontSize:"0.84rem",fontWeight:500,cursor:"pointer",transition:"all 0.2s"}}>
                    {vt.l}
                  </button>
                ))}
                <button onClick={()=>onOpenChat({country:selCountry,visa:selVisa})}
                  style={{marginLeft:"auto",padding:"8px 18px",borderRadius:10,background:"#4f8ef7",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.83rem",fontWeight:600,cursor:"pointer"}}>
                  Ask AI Consultant →
                </button>
              </div>
            </div>
          )}

          {/* VISA INFO */}
          {loading && <div style={{textAlign:"center",padding:40,color:"#8b91a8"}}>Loading visa information…</div>}
          {visaData && !loading && (
            <div style={{padding:"24px 36px"}}>
              <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:28,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,paddingBottom:20,borderBottom:"1px solid rgba(255,255,255,0.07)",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:"1.25rem",fontWeight:700,marginBottom:4}}>{visaData.name}</div>
                    <div style={{fontSize:"0.8rem",color:"#8b91a8"}}>{COUNTRIES[selCountry].flag} {selCountry} · {selVisa?.charAt(0).toUpperCase()+selVisa?.slice(1)} Visa</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[["⏱",visaData.time],["💳",visaData.cost]].map(([icon,val])=>(
                      <div key={icon} style={{padding:"6px 14px",borderRadius:20,fontSize:"0.75rem",fontWeight:600,background:"#21242f",border:"1px solid rgba(255,255,255,0.07)",color:"#8b91a8"}}>
                        {icon} <strong style={{color:"#e8eaf0",marginLeft:4}}>{val}</strong>
                      </div>
                    ))}
                    {visaData.official_url&&<a href={visaData.official_url} target="_blank" rel="noreferrer" style={{padding:"6px 14px",borderRadius:20,fontSize:"0.75rem",fontWeight:600,background:"rgba(79,142,247,0.07)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7",textDecoration:"none"}}>🔗 Official</a>}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                  <div>
                    <div style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginBottom:12}}>Requirements</div>
                    {visaData.requirements?.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:"0.83rem",color:"#8b91a8",lineHeight:1.5}}>
                        <span style={{color:"#4ade80",fontWeight:700,flexShrink:0}}>✓</span>{r}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#3d4263",marginBottom:12}}>Process</div>
                    {visaData.process?.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"#4f8ef7",color:"white",fontSize:"0.65rem",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>{i+1}</div>
                        <div style={{fontSize:"0.83rem",color:"#8b91a8",lineHeight:1.5}}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {visaData.tips&&<div style={{marginTop:20,padding:"14px 18px",background:"rgba(79,142,247,0.06)",border:"1px solid rgba(79,142,247,0.15)",borderRadius:10}}>
                  <div style={{fontSize:"0.65rem",fontWeight:700,color:"#4f8ef7",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5}}>💡 Expert Tips</div>
                  <div style={{fontSize:"0.82rem",color:"#8b91a8",lineHeight:1.6}}>{visaData.tips}</div>
                </div>}
                <button onClick={()=>onOpenChat({country:selCountry,visa:selVisa})} style={{width:"100%",padding:12,borderRadius:10,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",border:"none",color:"white",fontFamily:"inherit",fontSize:"0.88rem",fontWeight:600,cursor:"pointer",marginTop:18}}>
                  💬 Ask AI about this visa →
                </button>
              </div>

              {/* CHECKLIST */}
              <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:24}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <span style={{fontSize:"1rem",fontWeight:700}}>📋 Document Checklist</span>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:"0.75rem",fontWeight:600,background:"rgba(79,142,247,0.1)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7"}}>{done}/{total}</span>
                </div>
                {visaData.requirements?.map((req,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                    <input type="checkbox" id={`c${i}`} checked={!!checklist[i]} onChange={()=>toggleCheck(i)} style={{marginTop:3,cursor:"pointer",accentColor:"#4f8ef7",width:14,height:14,flexShrink:0}}/>
                    <label htmlFor={`c${i}`} style={{fontSize:"0.83rem",color:checklist[i]?"#3d4263":"#8b91a8",cursor:"pointer",lineHeight:1.5,textDecoration:checklist[i]?"line-through":"none"}}>{req}</label>
                  </div>
                ))}
                <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2,marginTop:14,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"linear-gradient(90deg,#4f8ef7,#4ade80)",width:`${pct}%`,transition:"width 0.4s ease"}}/>
                </div>
                <div style={{fontSize:"0.72rem",color:"#8b91a8",marginTop:6}}>{pct}% complete</div>
              </div>
            </div>
          )}

          {/* SAMPLE QUESTIONS */}
          {!selCountry && (
            <div style={{padding:"28px 36px"}}>
              <div style={{fontWeight:700,marginBottom:18}}>💡 Popular Questions</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {icon:"🇨🇦",label:"Canada Study Permit",hint:"Requirements, SOP, work rights",q:"What are all requirements for Canada Study Permit from Pakistan?"},
                  {icon:"🇬🇧",label:"UK Skilled Worker",hint:"Sponsorship, salary, ILR",q:"Explain UK Skilled Worker visa process and salary requirements."},
                  {icon:"🇩🇪",label:"Germany Free Study",hint:"APS cert, blocked account",q:"How can I study in Germany for free? What is the APS certificate?"},
                  {icon:"🇦🇺",label:"Australia PR Path",hint:"Points, 485 visa, migration",q:"What is fastest pathway from student visa to Australian PR?"},
                  {icon:"🇺🇸",label:"US F-1 Interview",hint:"214(b), ties, financial proof",q:"Expert tips for passing US F-1 student visa interview as Pakistani."},
                  {icon:"🇦🇪",label:"UAE Golden Visa",hint:"Eligibility, professions, 10yr",q:"How do I qualify for UAE Golden Visa? What professions apply?"},
                ].map((s,i)=>(
                  <button key={i} onClick={()=>onOpenChat({prefill:s.q})}
                    style={{padding:18,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all 0.2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.12)";e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.background="rgba(255,255,255,0.04)";}}>
                    <span style={{fontSize:"1.4rem",display:"block",marginBottom:8}}>{s.icon}</span>
                    <div style={{fontSize:"0.84rem",fontWeight:600,color:"#e8eaf0",marginBottom:3}}>{s.label}</div>
                    <div style={{fontSize:"0.72rem",color:"#8b91a8",lineHeight:1.4}}>{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CHAT PAGE — Gemini-level UI
// ══════════════════════════════════════════════════════════════════════════
function ChatPage({ user, context, onBack }) {
  const [msgs, setMsgs]         = useState([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [sid, setSid]           = useState(context?.sessionId||null);
  const [sessions, setSessions] = useState([]);
  const [stream, setStream]     = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveSearch, setLiveSearch]   = useState(false);
  const bottomRef = useRef(null);
  const taRef     = useRef(null);
  const fired     = useRef(false);

  const country = context?.country||null;
  const visa    = context?.visa||null;
  const name    = user.displayName||user.email?.split("@")[0]||"User";
  const init    = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  useEffect(()=>{api.get("/api/sessions",user).then(d=>setSessions(d||[])).catch(()=>{});},[]);
  useEffect(()=>{sid?api.get(`/api/sessions/${sid}/messages`,user).then(d=>setMsgs(d||[])).catch(()=>{}):setMsgs([]);},[sid]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs,stream,busy]);
  useEffect(()=>{
    if(context?.prefill&&!fired.current){fired.current=true;setTimeout(()=>send(context.prefill),400);}
  },[]);

  const delSession = async(id,e)=>{
    e.stopPropagation();
    await api.delete(`/api/sessions/${id}`,user).catch(()=>{});
    setSessions(p=>p.filter(s=>s.id!==id));
    if(sid===id){setSid(null);setMsgs([]);}
  };

  const send = useCallback(async(txt)=>{
    const msg=(txt||input).trim();
    if(!msg||busy)return;
    setInput("");setBusy(true);setStream("");
    if(taRef.current)taRef.current.style.height="auto";
    const history=msgs.map(m=>({role:m.role,content:m.content}));
    setMsgs(p=>[...p,{role:"user",content:msg,timestamp:new Date().toISOString()}]);
    let full="",newSid=sid;
    try{
      await api.stream(
        {message:msg,session_id:sid,country,visa_type:visa,use_search:liveSearch,history},
        user,
        chunk=>{full+=chunk;setStream(full);},
        id=>{if(id)newSid=id;},
        async()=>{
          try{const d=await api.post("/api/chat/simple",{message:msg,session_id:sid,country,visa_type:visa,use_search:liveSearch,history},user);full=d.response;newSid=d.session_id;}
          catch{full="⚠️ Connection error. Please try again.";}
        }
      );
    }catch(e){full="⚠️ "+e.message;}
    setStream("");setSid(newSid);
    setMsgs(p=>[...p,{role:"assistant",content:full,timestamp:new Date().toISOString()}]);
    setBusy(false);
    api.get("/api/sessions",user).then(d=>setSessions(d||[])).catch(()=>{});
  },[input,busy,sid,country,visa,liveSearch,msgs]);

  const onKey=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};

  const suggestions = country?[
    `What documents do I need for ${country} ${visa||"study"} visa?`,
    `What is the cost of ${country} ${visa||"study"} visa?`,
    `Common rejection reasons for ${country}?`,
    `Explain ${country} ${visa||"study"} visa process in detail`,
  ]:[
    "What are requirements for Canada Study Permit?",
    "How does UK Skilled Worker visa work?",
    "How to study in Germany for free?",
    "How to qualify for UAE Golden Visa?",
  ];

  return (
    <div style={{display:"flex",height:"100vh",background:"#0f1117",color:"#e8eaf0",fontFamily:"Inter,-apple-system,sans-serif",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .md p { margin-bottom: 10px; line-height: 1.75; color: #e8eaf0; font-size: 0.9rem; }
        .md p:last-child { margin-bottom: 0; }
        .md h1 { font-size: 1.1rem; font-weight: 700; color: #e8eaf0; margin: 16px 0 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .md h2 { font-size: 1rem; font-weight: 700; color: #e8eaf0; margin: 14px 0 7px; }
        .md h3 { font-size: 0.92rem; font-weight: 600; color: #8b91a8; margin: 12px 0 6px; }
        .md ul { list-style: none; padding: 0; margin: 10px 0; }
        .md li { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.88rem; color: #8b91a8; line-height: 1.6; }
        .md li::before { content: '›'; color: #4f8ef7; font-weight: 700; flex-shrink: 0; font-size: 1rem; }
        .md strong { font-weight: 600; color: #e8eaf0; }
        .md em { color: #8b91a8; font-style: italic; }
        .md code { font-family: monospace; background: rgba(79,142,247,0.1); color: #93c5fd; padding: 2px 6px; border-radius: 4px; font-size: 0.82rem; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);background:#3d4263} 30%{transform:translateY(-6px);background:#4f8ef7} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin2 { to{transform:rotate(360deg)} }
        @media(max-width:768px){
          .chat-sidebar{display:none!important}
          .chat-msg{padding:4px 14px!important}
          .chat-bubble{max-width:90%!important;font-size:0.86rem!important}
          .chat-input-wrap{padding:8px 12px 16px!important}
          .chat-suggestions{grid-template-columns:1fr!important}
          .chat-header-ctx{display:none!important}
        }
      `}</style>

      {/* ── SIDEBAR ── */}
      {sidebarOpen && (
        <aside className="chat-sidebar" style={{width:260,flexShrink:0,background:"#1a1d27",borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"20px 16px 12px"}}>
            <div style={{fontSize:"1.2rem",fontWeight:800,letterSpacing:-0.5,marginBottom:16}}>Visa<span style={{color:"#4f8ef7"}}>Path</span></div>
            <button onClick={()=>{setSid(null);setMsgs([]);setStream("");setInput("");}}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.84rem",fontWeight:500,cursor:"pointer"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              New chat
            </button>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
            {sessions.length===0&&<p style={{fontSize:"0.74rem",color:"#3d4263",padding:"12px 8px"}}>No conversations yet</p>}
            {sessions.map(s=>(
              <div key={s.id} onClick={()=>setSid(s.id)}
                style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:10,cursor:"pointer",marginBottom:2,position:"relative",background:s.id===sid?"rgba(79,142,247,0.1)":"transparent",border:s.id===sid?"1px solid rgba(79,142,247,0.15)":"1px solid transparent"}}
                onMouseEnter={e=>{if(s.id!==sid)e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.querySelector(".sdel").style.opacity="1";}}
                onMouseLeave={e=>{if(s.id!==sid)e.currentTarget.style.background="transparent";e.currentTarget.querySelector(".sdel").style.opacity="0";}}>
                <span style={{fontSize:"1rem",flexShrink:0}}>{COUNTRIES[s.country]?.flag||"💬"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"0.78rem",fontWeight:600,color:"#e8eaf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||s.country||"General Chat"}</div>
                  <div style={{fontSize:"0.67rem",color:"#3d4263",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(s.last_message||"").slice(0,26)}…</div>
                </div>
                <button className="sdel" onClick={e=>delSession(s.id,e)} style={{opacity:0,background:"none",border:"none",color:"#ef4444",cursor:"pointer",padding:3,borderRadius:4,display:"flex",flexShrink:0,transition:"opacity 0.15s"}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>

          {/* User + signout */}
          <div style={{padding:"12px",borderTop:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem",fontWeight:700,color:"white",flexShrink:0}}>{init}</div>
            <div style={{flex:1,fontSize:"0.82rem",fontWeight:500,color:"#8b91a8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
            <button onClick={()=>signOut(auth)} title="Sign out" style={{background:"none",border:"none",color:"#3d4263",cursor:"pointer",padding:5,borderRadius:6,display:"flex",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.color="#e8eaf0";e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="#3d4263";e.currentTarget.style.background="transparent";}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </aside>
      )}

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* Header */}
        <header style={{display:"flex",alignItems:"center",gap:12,padding:"0 16px",height:52,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,0.07)",background:"rgba(15,17,23,0.8)",backdropFilter:"blur(12px)"}}>
          <button onClick={()=>setSidebarOpen(p=>!p)} style={{width:34,height:34,borderRadius:8,border:"none",background:"transparent",color:"#8b91a8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          {country&&<div className="chat-header-ctx" style={{padding:"4px 12px",borderRadius:20,fontSize:"0.74rem",fontWeight:600,background:"rgba(79,142,247,0.1)",border:"1px solid rgba(79,142,247,0.2)",color:"#4f8ef7"}}>{COUNTRIES[country]?.flag||"🌍"} {country}{visa?` · ${visa}`:""}</div>}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={liveSearch} onChange={e=>setLiveSearch(e.target.checked)} style={{display:"none"}}/>
              <div style={{width:34,height:18,borderRadius:9,background:liveSearch?"#4f8ef7":"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.1)",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:2,width:12,height:12,borderRadius:"50%",background:"white",transition:"transform 0.2s",transform:liveSearch?"translateX(16px)":"translateX(0)"}}/>
              </div>
              <span style={{fontSize:"0.72rem",color:"#8b91a8"}}>{liveSearch?"🔍 Live":"⚡ Fast"}</span>
            </label>
            <button onClick={onBack} style={{width:34,height:34,borderRadius:8,border:"none",background:"transparent",color:"#8b91a8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"32px 0",display:"flex",flexDirection:"column",gap:4,scrollBehavior:"smooth"}}>
          {/* Welcome */}
          {msgs.length===0&&!busy&&(
            <div style={{maxWidth:620,margin:"20px auto 0",padding:"0 24px",textAlign:"center",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.6rem",margin:"0 auto 16px"}}>✈</div>
              <h2 style={{fontSize:"1.6rem",fontWeight:700,letterSpacing:-0.5,marginBottom:10}}>
                {country?`${country} Visa Expert`:"VisaPath AI"}
              </h2>
              <p style={{fontSize:"0.88rem",color:"#8b91a8",lineHeight:1.7,marginBottom:28,maxWidth:440}}>
                {country?`Expert guidance for ${country}${visa?" "+visa:""} visa — ask me anything`:"Your expert immigration consultant. Fast answers for simple questions, detailed guides when you need them."}
              </p>
              <div className="chat-suggestions" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",textAlign:"left"}}>
                {suggestions.map((q,i)=>(
                  <button key={i} onClick={()=>send(q)} style={{padding:"13px 16px",borderRadius:12,textAlign:"left",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",color:"#8b91a8",fontFamily:"inherit",fontSize:"0.8rem",cursor:"pointer",transition:"all 0.2s",lineHeight:1.5}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#4f8ef7";e.currentTarget.style.color="#e8eaf0";e.currentTarget.style.background="rgba(79,142,247,0.06)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.color="#8b91a8";e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list — USER RIGHT, AI LEFT */}
          {msgs.map((m,i)=>(
            <div key={i} className="chat-msg" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"6px 24px",maxWidth:900,width:"100%",margin:"0 auto",flexDirection:m.role==="user"?"row-reverse":"row"}}>
              {/* Avatar */}
              <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:m.role==="user"?"linear-gradient(135deg,#10b981,#3b82f6)":"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:m.role==="user"?"0.7rem":"0.85rem",fontWeight:700,color:"white",marginTop:4}}>
                {m.role==="user"?init:"✈"}
              </div>
              {/* Bubble */}
              <div className="chat-bubble" style={{maxWidth:"75%",borderRadius:m.role==="user"?"18px 18px 4px 18px":"4px 18px 18px 18px",padding:m.role==="user"?"12px 18px":"8px 4px",fontSize:"0.9rem",lineHeight:1.75,wordBreak:"break-word",background:m.role==="user"?"#1e3a5f":"transparent",color:m.role==="user"?"#e2eeff":"#e8eaf0"}}>
                {m.role==="assistant"?<MD text={m.content}/>:m.content}
              </div>
            </div>
          ))}

          {/* Streaming */}
          {stream&&(
            <div className="chat-msg" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"6px 24px",maxWidth:900,width:"100%",margin:"0 auto"}}>
              <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.85rem",fontWeight:700,color:"white",marginTop:4}}>✈</div>
              <div style={{maxWidth:"75%",padding:"8px 4px",fontSize:"0.9rem",lineHeight:1.75}}>
                <MD text={stream}/>
                <span style={{display:"inline-block",width:2,height:16,background:"#4f8ef7",marginLeft:2,verticalAlign:"middle",animation:"blink 0.8s step-end infinite"}}/>
              </div>
            </div>
          )}

          {/* Typing dots */}
          {busy&&!stream&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"6px 24px",maxWidth:900,width:"100%",margin:"0 auto"}}>
              <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#4f8ef7,#7c6ef7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.85rem",color:"white",marginTop:4}}>✈</div>
              <div style={{display:"flex",gap:5,alignItems:"center",padding:"14px 18px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"4px 18px 18px 18px"}}>
                {[0,0.15,0.3].map((d,i)=>(
                  <div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#3d4263",animation:`bounce 1.2s ${d}s infinite`}}/>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Quick chips */}
        {msgs.length===0&&(country||visa)&&(
          <div style={{display:"flex",gap:8,padding:"0 24px 12px",flexWrap:"wrap",maxWidth:900,margin:"0 auto",width:"100%"}}>
            {["What documents do I need?","Processing time?","Cost breakdown?","Work rights?","Rejection reasons?","Path to PR?"].map((q,i)=>(
              <button key={i} onClick={()=>send(q+(country?` for ${country}${visa?" "+visa+" visa":""}` :""))}
                style={{padding:"7px 14px",borderRadius:20,border:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.04)",color:"#8b91a8",fontFamily:"inherit",fontSize:"0.76rem",cursor:"pointer",transition:"all 0.2s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#4f8ef7";e.currentTarget.style.color="#4f8ef7";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.color="#8b91a8";}}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-wrap" style={{padding:"12px 24px 20px",flexShrink:0,background:"linear-gradient(to top,#0f1117 80%,transparent)"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,background:"#1a1d27",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,padding:"12px 12px 12px 18px",transition:"border-color 0.2s, box-shadow 0.2s",maxWidth:860,margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,0.3)"}}
            onFocus={e=>{e.currentTarget.style.borderColor="rgba(79,142,247,0.5)";e.currentTarget.style.boxShadow="0 4px 32px rgba(79,142,247,0.1)";}}
            onBlur={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";e.currentTarget.style.boxShadow="0 4px 24px rgba(0,0,0,0.3)";}}>
            <textarea ref={taRef} rows={1} disabled={busy}
              placeholder={country?`Ask about ${country}${visa?" "+visa:""} visa…`:"Ask anything about visas, immigration, study abroad…"}
              value={input}
              onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";}}
              onKeyDown={onKey}
              style={{flex:1,background:"none",border:"none",outline:"none",color:"#e8eaf0",fontFamily:"inherit",fontSize:"0.92rem",resize:"none",minHeight:26,maxHeight:160,lineHeight:1.6,paddingTop:2}}/>
            <button onClick={()=>send()} disabled={!input.trim()||busy}
              style={{width:38,height:38,borderRadius:10,flexShrink:0,background:(!input.trim()||busy)?"#21242f":"#4f8ef7",border:"none",color:(!input.trim()||busy)?"#3d4263":"white",cursor:(!input.trim()||busy)?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
              {busy
                ?<div style={{width:15,height:15,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",animation:"spin2 0.7s linear infinite"}}/>
                :<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              }
            </button>
          </div>
          <p style={{textAlign:"center",fontSize:"0.67rem",color:"#3d4263",marginTop:8,maxWidth:860,marginLeft:"auto",marginRight:"auto"}}>
            VisaPath AI · Enter to send · Shift+Enter for new line{liveSearch?" · 🔍 Real-time search ON":""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState("dashboard");
  const [chatCtx, setChatCtx] = useState(null);

  useEffect(()=>{
    return onAuthStateChanged(auth, u=>{ setUser(u); setLoading(false); });
  },[]);

  if(loading) return <Loader/>;
  if(!user)   return <AuthPage/>;

  return page==="dashboard"
    ? <Dashboard user={user} onOpenChat={ctx=>{setChatCtx(ctx);setPage("chat");}}/>
    : <ChatPage  user={user} auth={auth} context={chatCtx} onBack={()=>setPage("dashboard")}/>;
}
