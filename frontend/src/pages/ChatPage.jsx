import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";

const QUICK_QUESTIONS = [
  "What documents do I need?",
  "How long does processing take?",
  "What is the cost breakdown?",
  "Can I work on this visa?",
  "Common rejection reasons?",
  "How to write a strong SOP?",
  "What English test is required?",
  "Path to permanent residency?",
];

const FLAGS = {
  "Canada":"🇨🇦","United Kingdom":"🇬🇧","United States":"🇺🇸",
  "Germany":"🇩🇪","Australia":"🇦🇺","UAE":"🇦🇪","New Zealand":"🇳🇿"
};

function parseMarkdown(text) {
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/^\d+\. (.+)$/gm,"<li class='ol'>$1</li>")
    .replace(/^[-•✓] (.+)$/gm,"<li>$1</li>")
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`)
    .replace(/\n\n+/g,"</p><p>")
    .replace(/\n/g,"<br/>")
    .trim();
}

function MsgContent({ text }) {
  return (
    <div
      className="msg-md"
      dangerouslySetInnerHTML={{ __html: `<p>${parseMarkdown(text)}</p>` }}
    />
  );
}

function Typing() {
  return (
    <div className="msg-row ai">
      <div className="msg-icon">✈</div>
      <div className="typing-bubble">
        <span/><span/><span/>
      </div>
    </div>
  );
}

export default function ChatPage({ user, context, onBack }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(context?.sessionId || null);
  const [sessions, setSessions] = useState([]);
  const [stream, setStream] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [liveSearch, setLiveSearch] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const fired = useRef(false);

  const country = context?.country || null;
  const visa = context?.visa || null;
  const flag = FLAGS[country] || "✈️";

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { sid ? loadMsgs(sid) : setMsgs([]); }, [sid]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, stream, busy]);
  useEffect(() => {
    if (context?.prefill && !fired.current) {
      fired.current = true;
      setTimeout(() => send(context.prefill), 500);
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

  const send = useCallback(async (txt) => {
    const msg = (txt || input).trim();
    if (!msg || busy) return;
    setInput(""); setBusy(true); setStream("");
    if (taRef.current) taRef.current.style.height = "auto";
    setMsgs(p => [...p, { role:"user", content:msg, timestamp: new Date().toISOString() }]);

    let full = "", newSid = sid;
    try {
      await api.stream(
        { message:msg, session_id:sid, country, visa_type:visa, use_search:liveSearch },
        user,
        chunk => { full += chunk; setStream(full); },
        id => { if (id) newSid = id; },
        async () => {
          try {
            const d = await api.post("/api/chat/simple",
              { message:msg, session_id:sid, country, visa_type:visa, use_search:liveSearch }, user);
            full = d.response; newSid = d.session_id;
          } catch { full = "⚠️ Connection error. Please try again."; }
        }
      );
    } catch (e) { full = "⚠️ " + e.message; }

    setStream(""); setSid(newSid);
    setMsgs(p => [...p, { role:"assistant", content:full, timestamp: new Date().toISOString() }]);
    setBusy(false); loadSessions();
  }, [input, busy, sid, country, visa, liveSearch]);

  const onKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const newChat = () => { setSid(null); setMsgs([]); setStream(""); setInput(""); };

  const contextLabel = country
    ? `${flag} ${country}${visa ? " · " + visa.charAt(0).toUpperCase() + visa.slice(1) : ""}`
    : "Global Visa Consultant";

  return (
    <div className="cp">
      {/* ── TOP BAR ── */}
      <header className="cp-header">
        <div className="cp-header-l">
          <button className="icon-btn" onClick={onBack} title="Dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div className="cp-brand">Visa<span>Path</span></div>
          {country && <div className="cp-ctx-tag">{flag} {country}{visa ? ` · ${visa}` : ""}</div>}
        </div>
        <div className="cp-header-r">
          <label className="toggle-wrap" title="Enable real-time web search">
            <input type="checkbox" checked={liveSearch} onChange={e => setLiveSearch(e.target.checked)} />
            <div className="toggle-track"><div className="toggle-thumb"/></div>
            <span className="toggle-lbl">{liveSearch ? "🔍 Live" : "⚡ Fast"}</span>
          </label>
          <button className="new-chat-btn" onClick={newChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New Chat
          </button>
          <button className="icon-btn" onClick={() => setSidebar(p => !p)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
          </button>
        </div>
      </header>

      <div className="cp-body">
        {/* ── SIDEBAR ── */}
        {sidebar && (
          <aside className="cp-sidebar">
            <div className="sidebar-inner">
              <div className="sidebar-sec">
                <div className="sidebar-lbl">Conversations</div>
                {sessions.length === 0 && (
                  <p className="sidebar-empty">Your chats will appear here</p>
                )}
                {sessions.map(s => (
                  <div key={s.id}
                    className={`sess-item${s.id === sid ? " active" : ""}`}
                    onClick={() => setSid(s.id)}>
                    <span className="sess-flag">{FLAGS[s.country] || "💬"}</span>
                    <div className="sess-info">
                      <div className="sess-title">{s.title || s.country || "General Chat"}</div>
                      <div className="sess-sub">{(s.last_message||"").slice(0,28)}…</div>
                    </div>
                    <button className="sess-del" onClick={e => delSession(s.id, e)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>

              {(country || visa) && (
                <div className="sidebar-sec" style={{borderTop:"1px solid var(--b)",paddingTop:14}}>
                  <div className="sidebar-lbl">Quick Questions</div>
                  {QUICK_QUESTIONS.map((q,i) => (
                    <button key={i} className="quick-btn" disabled={busy}
                      onClick={() => send(q + (country ? ` for ${country}${visa?" "+visa:""} visa` : ""))}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ── MAIN ── */}
        <main className="cp-main">
          <div className="messages">
            {/* Welcome */}
            {msgs.length === 0 && !busy && (
              <div className="welcome">
                <div className="welcome-emoji">{country ? flag : "✈️"}</div>
                <h2 className="welcome-title">
                  {country ? `${country} Visa Expert` : "Global Visa Consultant"}
                </h2>
                <p className="welcome-sub">
                  Ask me anything — I give quick answers for simple questions and detailed guides when you need them.
                </p>
                <div className="suggestions">
                  {(country ? [
                    `What documents do I need for ${country} ${visa||"study"} visa?`,
                    `What is the cost of ${country} ${visa||"study"} visa?`,
                    `Common rejection reasons for ${country}?`,
                    `Explain ${country} ${visa||"study"} visa process in detail`,
                  ] : [
                    "What are requirements for Canada Study Permit?",
                    "How does UK Skilled Worker visa work?",
                    "How to study in Germany for free?",
                    "How to get UAE Golden Visa?",
                  ]).map((q,i) => (
                    <button key={i} className="suggest-btn" onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {msgs.map((m,i) => (
              <div key={i} className={`msg-row ${m.role}`}>
                {m.role === "assistant" && <div className="msg-icon">✈</div>}
                <div className={`bubble ${m.role}`}>
                  {m.role === "assistant"
                    ? <MsgContent text={m.content} />
                    : <span>{m.content}</span>
                  }
                </div>
                {m.role === "user" && <div className="msg-icon user-icon">
                  {(user.displayName||user.email||"U")[0].toUpperCase()}
                </div>}
              </div>
            ))}

            {/* Streaming */}
            {stream && (
              <div className="msg-row assistant">
                <div className="msg-icon">✈</div>
                <div className="bubble assistant streaming">
                  <MsgContent text={stream} />
                  <span className="cursor"/>
                </div>
              </div>
            )}

            {busy && !stream && <Typing />}
            <div ref={bottomRef}/>
          </div>

          {/* ── INPUT ── */}
          <div className="input-area">
            <div className="input-box">
              <textarea
                ref={taRef}
                className="input-ta"
                rows={1}
                disabled={busy}
                placeholder={country
                  ? `Ask about ${country}${visa?" "+visa:""} visa…`
                  : "Ask anything about visas, requirements, timelines…"}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={onKey}
              />
              <button
                className={`send-btn${(!input.trim()||busy)?" off":""}`}
                onClick={() => send()}
                disabled={!input.trim()||busy}
              >
                {busy
                  ? <div className="send-spin"/>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
                }
              </button>
            </div>
            <div className="input-hint">
              Enter to send · Shift+Enter for new line
              {liveSearch && " · 🔍 Live search ON"}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
