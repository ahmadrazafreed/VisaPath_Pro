import { useState, useEffect, useRef } from "react";
import { api, renderMarkdown } from "../api";

const QUICK_QUESTIONS = [
  "What documents do I need?",
  "How long does processing take?",
  "What is the cost breakdown?",
  "Can I work on this visa?",
  "Common rejection reasons?",
  "How to write a strong SOP?",
  "What English test is required?",
  "Pathway to permanent residency?",
];

const COUNTRY_FLAGS = {
  "Canada": "🇨🇦", "United Kingdom": "🇬🇧", "United States": "🇺🇸",
  "Germany": "🇩🇪", "Australia": "🇦🇺", "UAE": "🇦🇪", "New Zealand": "🇳🇿",
};

export default function ChatPage({ user, auth, context, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(context?.sessionId || null);
  const [sessions, setSessions] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const country = context?.country || null;
  const visa = context?.visa || null;

  // Load sessions list
  useEffect(() => {
    loadSessions();
  }, []);

  // Load existing session messages
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Auto-send prefilled question
  useEffect(() => {
    if (context?.prefill && messages.length === 0) {
      setInput(context.prefill);
      setTimeout(() => sendMessage(context.prefill), 300);
    }
  }, []);

  const loadSessions = async () => {
    try {
      const data = await api.get("/api/sessions", user);
      setSessions(data || []);
    } catch {}
  };

  const loadMessages = async (sid) => {
    try {
      const data = await api.get(`/api/sessions/${sid}/messages`, user);
      setMessages(data || []);
    } catch {}
  };

  const deleteSession = async (sid, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/sessions/${sid}`, user);
      setSessions(prev => prev.filter(s => s.id !== sid));
      if (sessionId === sid) {
        setSessionId(null);
        setMessages([]);
      }
    } catch {}
  };

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);
    setStreamingText("");

    const userMsg = { role: "user", content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    // Build history for context
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    let fullResponse = "";
    let newSessionId = sessionId;

    try {
      // Try streaming first
      await api.stream(
        { message: msg, session_id: sessionId, country, visa_type: visa, history },
        user,
        (chunk) => {
          fullResponse += chunk;
          setStreamingText(fullResponse);
        },
        (sid) => {
          if (sid) newSessionId = sid;
        },
        async (err) => {
          // Fallback to simple (non-streaming) if stream fails
          console.warn("Stream failed, falling back:", err);
          try {
            const data = await api.post("/api/chat/simple", {
              message: msg, session_id: sessionId, country, visa_type: visa, history
            }, user);
            fullResponse = data.response;
            newSessionId = data.session_id;
          } catch (e2) {
            fullResponse = "⚠️ Connection error. Make sure the backend is running at " + (import.meta.env.VITE_API_URL || "http://localhost:8000");
          }
        }
      );
    } catch (e) {
      fullResponse = "⚠️ Error: " + e.message;
    }

    setStreamingText("");
    setSessionId(newSessionId);
    setMessages(prev => [...prev, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() }]);
    setLoading(false);

    // Refresh sessions list
    loadSessions();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setStreamingText("");
    setInput("");
  };

  const contextLabel = country
    ? `${COUNTRY_FLAGS[country] || "🌍"} ${country}${visa ? " · " + visa.charAt(0).toUpperCase() + visa.slice(1) + " Visa" : ""}`
    : "General Visa Consultant";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 0px)" }}>
      {/* NAV */}
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onBack} title="Back to dashboard">←</button>
          <div className="nav-logo">Visa<span>Path</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="badge badge-live">LIVE</span>
          <button className="btn btn-ghost btn-sm" onClick={startNewChat}>+ New Chat</button>
        </div>
      </nav>

      <div className="chat-body" style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* SIDEBAR — session history */}
        <aside className="chat-sidebar">
          <div className="sidebar-label" style={{ marginBottom: 10 }}>Chat History</div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", marginBottom: 12, fontSize: "0.8rem", padding: "8px" }}
            onClick={startNewChat}
          >
            + New Chat
          </button>

          {sessions.length === 0 && (
            <div style={{ fontSize: "0.78rem", color: "var(--text3)", lineHeight: 1.5 }}>
              Your conversations will appear here after your first chat.
            </div>
          )}

          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item${s.id === sessionId ? " active" : ""}`}
              onClick={() => setSessionId(s.id)}
            >
              <div className="session-title">
                {s.country ? `${COUNTRY_FLAGS[s.country] || "🌍"} ${s.country}` : "General Chat"}
              </div>
              <div className="session-meta">{(s.last_message || "").slice(0, 38)}...</div>
              <button className="session-delete" onClick={(e) => deleteSession(s.id, e)} title="Delete">✕</button>
            </div>
          ))}

          {/* Quick Q buttons */}
          {(country || visa) && (
            <>
              <div className="sidebar-label" style={{ marginTop: 20, marginBottom: 8 }}>Quick Questions</div>
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="quick-btn"
                  onClick={() => sendMessage(q + (country ? ` for ${country}${visa ? " " + visa : ""} visa` : ""))}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </>
          )}
        </aside>

        {/* MAIN CHAT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Context bar */}
          <div className="chat-topbar">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>✈</div>
            <div className="chat-context-info">
              <div className="chat-context-title">VisaPath AI — {contextLabel}</div>
              <div className="chat-context-sub">Real-time web search · Expert immigration guidance</div>
            </div>
            <span className="badge badge-live">Real-time Search</span>
          </div>

          {/* Messages */}
          <div className="messages-area">

            {/* Welcome message */}
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✈️</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
                  {country ? `Ask me anything about ${country} visas` : "Ask me anything about visas"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", maxWidth: 420, margin: "0 auto 28px" }}>
                  I have real-time access to official embassy websites and can answer detailed questions about requirements, costs, timelines, and application strategies.
                </div>

                {/* Sample prompts */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 500, margin: "0 auto", textAlign: "left" }}>
                  {[
                    country ? `What documents do I need for ${country} ${visa || "study"} visa?` : "What are the requirements for Canada Study Permit?",
                    country ? `What are common rejection reasons for ${country}?` : "How does the UK Skilled Worker visa work?",
                    country ? `How can I strengthen my ${country} visa application?` : "How do I study in Germany for free?",
                    country ? `What is the processing time for ${country} ${visa || "visa"} in 2025?` : "How to get UAE Golden Visa?",
                  ].map((q, i) => (
                    <button key={i} className="quick-btn" style={{ padding: "10px 12px", fontSize: "0.8rem" }} onClick={() => sendMessage(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, i) => (
              <div key={i} className={`msg ${msg.role}`}>
                {msg.role === "assistant" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>✈</div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text3)", fontWeight: 600 }}>VisaPath AI</span>
                    <span className="badge badge-live" style={{ fontSize: "0.62rem", padding: "1px 6px" }}>Live</span>
                  </div>
                )}
                <div
                  className="msg-bubble"
                  dangerouslySetInnerHTML={
                    msg.role === "assistant"
                      ? { __html: renderMarkdown(msg.content) }
                      : undefined
                  }
                >
                  {msg.role === "user" ? msg.content : undefined}
                </div>
                <div className="msg-meta">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
              </div>
            ))}

            {/* Streaming response */}
            {streamingText && (
              <div className="msg assistant">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>✈</div>
                  <span style={{ fontSize: "0.72rem", color: "var(--text3)", fontWeight: 600 }}>VisaPath AI</span>
                </div>
                <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} />
              </div>
            )}

            {/* Typing indicator */}
            {loading && !streamingText && (
              <div className="msg assistant">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>✈</div>
                  <span style={{ fontSize: "0.72rem", color: "var(--text3)", fontWeight: 600 }}>Searching live data...</span>
                </div>
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            <div className="chat-input-wrap">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                placeholder={country ? `Ask about ${country} ${visa ? visa + " visa" : "visas"}...` : "Ask anything about visas, requirements, timelines, tips..."}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />
              <button
                className="chat-send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                title="Send (Enter)"
              >
                ➤
              </button>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text3)", marginTop: 6, textAlign: "center" }}>
              Press Enter to send · Shift+Enter for new line · Real-time web search enabled
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
