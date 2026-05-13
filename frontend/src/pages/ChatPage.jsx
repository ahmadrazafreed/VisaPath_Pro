import { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "firebase/auth";
import { api } from "../api";

const FLAGS = {
  "Canada":"🇨🇦","United Kingdom":"🇬🇧","United States":"🇺🇸",
  "Germany":"🇩🇪","Australia":"🇦🇺","UAE":"🇦🇪","New Zealand":"🇳🇿"
};

const STARTERS = [
  "What documents do I need?",
  "How long does processing take?",
  "What are the costs?",
  "Can I work on this visa?",
  "Common rejection reasons?",
  "Path to permanent residency?",
];

// ── Markdown renderer ────────────────────────────────────────────────────
function Markdown({ text }) {
  const html = text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/^\d+\. (.+)$/gm,"<li class='num'>$1</li>")
    .replace(/^[-•✓] (.+)$/gm,"<li>$1</li>")
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,m=>`<ul>${m}</ul>`)
    .replace(/\n\n+/g,"</p><p>")
    .replace(/\n/g,"<br/>")
    .trim();
  return <div className="md" dangerouslySetInnerHTML={{__html:`<p>${html}</p>`}}/>;
}

// ── Typing indicator ─────────────────────────────────────────────────────
function Dots() {
  return (
    <div className="msg ai-msg">
      <div className="ai-avatar">V</div>
      <div className="dots-wrap"><span/><span/><span/></div>
    </div>
  );
}

export default function ChatPage({ user, auth, context, onBack }) {
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [sid, setSid]         = useState(context?.sessionId || null);
  const [sessions, setSessions] = useState([]);
  const [stream, setStream]   = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveSearch, setLiveSearch]   = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const bottomRef = useRef(null);
  const taRef     = useRef(null);
  const fired     = useRef(false);

  const country = context?.country || null;
  const visa    = context?.visa    || null;

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { sid ? loadMsgs(sid) : setMsgs([]); }, [sid]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, stream, busy]);
  useEffect(() => {
    if (context?.prefill && !fired.current) {
      fired.current = true;
      setTimeout(() => send(context.prefill), 400);
    }
  }, []);

  const loadSessions = async () => {
    try { setSessions(await api.get("/api/sessions", user) || []); } catch {}
  };
  const loadMsgs = async (id) => {
    try { setMsgs(await api.get(`/api/sessions/${id}/messages`, user) || []); } catch {}
  };
  const delSession = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/sessions/${id}`, user);
      setSessions(p => p.filter(s => s.id !== id));
      if (sid === id) { setSid(null); setMsgs([]); }
    } catch {}
  };
  const newChat = () => { setSid(null); setMsgs([]); setStream(""); setInput(""); };

  const send = useCallback(async (txt) => {
    const msg = (txt || input).trim();
    if (!msg || busy) return;
    setInput(""); setBusy(true); setStream("");
    if (taRef.current) taRef.current.style.height = "auto";

    // Add user message immediately
    const userMsg = { role:"user", content:msg, timestamp: new Date().toISOString() };
    setMsgs(p => [...p, userMsg]);

    // Build conversation history for memory
    const history = msgs.map(m => ({ role: m.role, content: m.content }));

    let full = "", newSid = sid;
    try {
      await api.stream(
        { message:msg, session_id:sid, country, visa_type:visa, use_search:liveSearch, history },
        user,
        chunk => { full += chunk; setStream(full); },
        id => { if (id) newSid = id; },
        async () => {
          try {
            const d = await api.post("/api/chat/simple",
              { message:msg, session_id:sid, country, visa_type:visa, use_search:liveSearch, history }, user);
            full = d.response; newSid = d.session_id;
          } catch { full = "⚠️ Connection error. Please try again."; }
        }
      );
    } catch (e) { full = "⚠️ " + e.message; }

    setStream(""); setSid(newSid);
    setMsgs(p => [...p, { role:"assistant", content:full, timestamp: new Date().toISOString() }]);
    setBusy(false); loadSessions();
  }, [input, busy, sid, country, visa, liveSearch, msgs]);

  const onKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials    = displayName.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
  const contextLabel = country
    ? `${FLAGS[country]||"🌍"} ${country}${visa ? " · "+visa.charAt(0).toUpperCase()+visa.slice(1) : ""}`
    : "Global Visa Consultant";

  return (
    <div className="vp-chat">
      {/* ══ SIDEBAR ══ */}
      <aside className={`vp-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="vp-sidebar-top">
          <div className="vp-logo">Visa<span>Path</span></div>
          <button className="vp-new-btn" onClick={newChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New chat
          </button>
        </div>

        <div className="vp-sessions">
          {sessions.length === 0 && (
            <p className="vp-no-sessions">No conversations yet</p>
          )}
          {sessions.map(s => (
            <div key={s.id}
              className={`vp-sess${s.id===sid?" active":""}`}
              onClick={() => setSid(s.id)}>
              <span className="vp-sess-icon">{FLAGS[s.country]||"💬"}</span>
              <div className="vp-sess-text">
                <div className="vp-sess-title">{s.title || s.country || "General Chat"}</div>
                <div className="vp-sess-sub">{(s.last_message||"").slice(0,28)}…</div>
              </div>
              <button className="vp-sess-del" onClick={e=>delSession(s.id,e)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>

        {/* User section at bottom */}
        <div className="vp-sidebar-bottom">
          <div className="vp-user-row">
            <div className="vp-user-avatar">{initials}</div>
            <div className="vp-user-name">{displayName}</div>
            <button className="vp-signout-btn" onClick={() => signOut(auth)} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div className="vp-main">
        {/* Header */}
        <header className="vp-header">
          <button className="vp-icon-btn" onClick={() => setSidebarOpen(p=>!p)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          {country && <div className="vp-ctx-chip">{FLAGS[country]||"🌍"} {country}{visa?` · ${visa}`:""}</div>}
          <div className="vp-header-right">
            <label className="vp-toggle" title="Toggle real-time web search">
              <input type="checkbox" checked={liveSearch} onChange={e=>setLiveSearch(e.target.checked)}/>
              <div className="vp-toggle-track"><div className="vp-toggle-thumb"/></div>
              <span>{liveSearch?"🔍 Live":"⚡ Fast"}</span>
            </label>
            <button className="vp-icon-btn" onClick={onBack} title="Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="vp-messages">
          {/* Welcome screen */}
          {msgs.length === 0 && !busy && (
            <div className="vp-welcome">
              <div className="vp-welcome-logo">
                <div className="vp-welcome-icon">✈</div>
                <h1>VisaPath <span>AI</span></h1>
              </div>
              <p className="vp-welcome-sub">
                {country
                  ? `Expert guidance for ${country}${visa?" "+visa:""} visa — ask me anything`
                  : "Your expert immigration consultant. Ask me about study, work, or visit visas for any country."}
              </p>
              <div className="vp-starters">
                {(country ? [
                  `What documents do I need for ${country} ${visa||"study"} visa?`,
                  `What is the cost and processing time for ${country}?`,
                  `Common rejection reasons for ${country} ${visa||"visa"}?`,
                  `Explain the ${country} ${visa||"study"} visa process step by step`,
                ] : [
                  "What are the requirements for Canada Study Permit?",
                  "How does UK Skilled Worker visa work?",
                  "How to study in Germany for free?",
                  "How to qualify for UAE Golden Visa?",
                ]).map((q,i) => (
                  <button key={i} className="vp-starter" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {/* Message list — USER RIGHT, AI LEFT */}
          {msgs.map((m,i) => (
            <div key={i} className={`msg ${m.role==="user"?"user-msg":"ai-msg"}`}>
              {m.role === "assistant" && <div className="ai-avatar">V</div>}
              <div className={`bubble ${m.role==="user"?"user-bubble":"ai-bubble"}`}>
                {m.role === "assistant"
                  ? <Markdown text={m.content}/>
                  : m.content
                }
              </div>
              {m.role === "user" && <div className="user-avatar">{initials}</div>}
            </div>
          ))}

          {/* Streaming */}
          {stream && (
            <div className="msg ai-msg">
              <div className="ai-avatar">V</div>
              <div className="bubble ai-bubble streaming">
                <Markdown text={stream}/>
                <span className="blink-cursor"/>
              </div>
            </div>
          )}

          {busy && !stream && <Dots/>}
          <div ref={bottomRef}/>
        </div>

        {/* Quick starters when no messages */}
        {msgs.length === 0 && (country || visa) && (
          <div className="vp-quick-row">
            {STARTERS.map((q,i) => (
              <button key={i} className="vp-quick-chip"
                onClick={() => send(q + (country?` for ${country}${visa?" "+visa+" visa":""}`:""))}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="vp-input-wrap">
          <div className="vp-input-box">
            <textarea
              ref={taRef}
              className="vp-textarea"
              rows={1}
              disabled={busy}
              placeholder={country
                ? `Ask about ${country}${visa?" "+visa:""} visa…`
                : "Ask anything about visas, immigration, study abroad…"}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160)+"px";
              }}
              onKeyDown={onKey}
            />
            <button
              className={`vp-send${(!input.trim()||busy)?" off":""}`}
              onClick={() => send()}
              disabled={!input.trim()||busy}
            >
              {busy
                ? <div className="spin"/>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              }
            </button>
          </div>
          <p className="vp-input-hint">VisaPath AI · Enter to send · Shift+Enter for new line{liveSearch?" · 🔍 Real-time search ON":""}</p>
        </div>
      </div>
    </div>
  );
}
