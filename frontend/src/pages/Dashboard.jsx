import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { api, COUNTRIES } from "../api";

const VISA_TYPES = [
  { key: "study", label: "📚 Study", color: "#10b981" },
  { key: "work",  label: "💼 Work",  color: "#3b82f6" },
  { key: "visit", label: "✈️ Visit", color: "#f59e0b" },
];

export default function Dashboard({ user, auth, onOpenChat }) {
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedVisa, setSelectedVisa] = useState(null);
  const [visaData, setVisaData] = useState(null);
  const [countries, setCountries] = useState(COUNTRIES);
  const [checklist, setChecklist] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loadingVisa, setLoadingVisa] = useState(false);

  useEffect(() => {
    api.get("/api/countries", user).then(d => { if (d) setCountries(d); }).catch(() => {});
    api.get("/api/sessions", user).then(d => setSessions(d || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCountry && selectedVisa) {
      setLoadingVisa(true);
      setVisaData(null);
      api.get(`/api/visa/${encodeURIComponent(selectedCountry)}/${selectedVisa}`, user)
        .then(d => { setVisaData(d); setLoadingVisa(false); })
        .catch(() => setLoadingVisa(false));
      api.get(`/api/checklist/${encodeURIComponent(selectedCountry)}/${selectedVisa}`, user)
        .then(d => setChecklist(d?.items || {}))
        .catch(() => {});
    }
  }, [selectedCountry, selectedVisa]);

  const toggleCheck = async (idx) => {
    const updated = { ...checklist, [idx]: !checklist[idx] };
    setChecklist(updated);
    api.post("/api/checklist", { country: selectedCountry, visa_type: selectedVisa, items: updated }, user).catch(() => {});
  };

  const doneCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = visaData?.requirements?.length || 0;
  const pct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="db-root">
      {/* NAV */}
      <nav className="db-nav">
        <div className="db-logo">Visa<span>Path</span> <span className="db-pro-badge">PRO</span></div>
        <div className="db-nav-right">
          <span className="db-live-dot">● LIVE</span>
          <div className="db-user-chip">
            <div className="db-avatar">{initials}</div>
            <span>{displayName}</span>
          </div>
          <button className="db-signout" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </nav>

      <div className="db-layout">
        {/* SIDEBAR */}
        <aside className="db-sidebar">
          <button
            className="db-new-chat-btn"
            onClick={() => onOpenChat(selectedCountry && selectedVisa ? { country: selectedCountry, visa: selectedVisa } : null)}
          >
            ✦ New Consultation
          </button>

          <div className="db-sidebar-section">
              <div className="db-sidebar-label">Recent Chats</div>
              {sessions.length === 0 && (
                <p style={{fontSize:"0.74rem",color:"#3d4f6e",padding:"4px 0",lineHeight:1.5}}>
                  No chats yet — start a consultation
                </p>
              )}
              {sessions.slice(0, 10).map(s => (
                <div key={s.id} className="db-session-item"
                  onClick={() => onOpenChat({ sessionId: s.id, country: s.country, visa: s.visa_type })}>
                  <span className="db-session-flag">{COUNTRIES[s.country]?.flag || "💬"}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="db-session-title">
                      {s.title || (s.country ? s.country : "General Chat")}
                    </div>
                    <div className="db-session-sub">{(s.last_message || "").slice(0, 30)}…</div>
                  </div>
                  <button
                    className="db-session-del"
                    onClick={async e => {
                      e.stopPropagation();
                      try {
                        await api.delete(`/api/sessions/${s.id}`, user);
                        setSessions(p => p.filter(x => x.id !== s.id));
                      } catch {}
                    }}
                  >✕</button>
                </div>
              ))}
            </div>

          {selectedCountry && selectedVisa && (
            <div className="db-sidebar-section">
              <div className="db-sidebar-label">Quick Ask</div>
              {["What documents do I need?","Processing time?","Cost breakdown?","Work rights?","Rejection reasons?"].map((q, i) => (
                <button key={i} className="db-quick-q"
                  onClick={() => onOpenChat({ country: selectedCountry, visa: selectedVisa, prefill: q + ` for ${selectedCountry} ${selectedVisa} visa` })}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main className="db-main">
          {/* HERO */}
          <div className="db-hero">
            <div className="db-hero-badge">✈️ AI-Powered Immigration Consultant</div>
            <h1 className="db-hero-title">Your Visa. <em>Our Expertise.</em></h1>
            <p className="db-hero-sub">Expert guidance for study, work and travel visas across 7 major destinations — powered by real-time AI.</p>
            <div className="db-stats">
              {[["7","Countries"],["21","Visa Types"],["Live","Processing Times"],["AI","Web Search"]].map(([v,l]) => (
                <div key={l} className="db-stat">
                  <div className="db-stat-val">{v}</div>
                  <div className="db-stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* COUNTRY GRID */}
          <div className="db-section">
            <div className="db-section-head">
              <span className="db-section-title">🌍 Select Destination</span>
              <span className="db-section-sub">Choose a country to get started</span>
            </div>
            <div className="db-country-grid">
              {Object.entries(countries).map(([country, data]) => (
                <div
                  key={country}
                  className={`db-country-card${selectedCountry === country ? " selected" : ""}`}
                  onClick={() => { setSelectedCountry(country); setSelectedVisa(null); setVisaData(null); setChecklist({}); }}
                >
                  <div className="db-country-flag">{data.flag}</div>
                  <div className="db-country-name">{country}</div>
                  <div className="db-country-sub">{(data.highlight || "").split("·")[0].trim()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* VISA TYPE SELECTOR */}
          {selectedCountry && (
            <div className="db-section">
              <div className="db-section-head">
                <span className="db-section-title">{countries[selectedCountry]?.flag} {selectedCountry}</span>
                <span className="db-section-sub">{countries[selectedCountry]?.highlight}</span>
              </div>
              <div className="db-visa-tabs">
                {VISA_TYPES.map(vt => (
                  <button
                    key={vt.key}
                    className={`db-visa-tab${selectedVisa === vt.key ? " active" : ""}`}
                    style={selectedVisa === vt.key ? { borderColor: vt.color, color: vt.color, background: vt.color + "15" } : {}}
                    onClick={() => setSelectedVisa(vt.key)}
                  >
                    {vt.label}
                  </button>
                ))}
                <button
                  className="db-ask-ai-btn"
                  onClick={() => onOpenChat({ country: selectedCountry, visa: selectedVisa })}
                >
                  Ask AI Consultant →
                </button>
              </div>
            </div>
          )}

          {/* LOADING */}
          {loadingVisa && (
            <div className="db-section">
              <div className="db-loading">Loading visa information...</div>
            </div>
          )}

          {/* VISA INFO PANEL */}
          {visaData && !loadingVisa && (
            <div className="db-section">
              <div className="db-visa-panel">
                <div className="db-visa-panel-head">
                  <div>
                    <div className="db-visa-name">{visaData.name}</div>
                    <div className="db-visa-sub">{countries[selectedCountry]?.flag} {selectedCountry} · {selectedVisa?.charAt(0).toUpperCase() + selectedVisa?.slice(1)} Visa</div>
                  </div>
                  <div className="db-visa-chips">
                    <div className="db-visa-chip">⏱ <strong>{visaData.time}</strong></div>
                    <div className="db-visa-chip">💳 <strong>{visaData.cost}</strong></div>
                    {visaData.official_url && (
                      <a href={visaData.official_url} target="_blank" rel="noreferrer" className="db-visa-chip db-visa-chip-link">
                        🔗 Official
                      </a>
                    )}
                  </div>
                </div>

                <div className="db-two-col">
                  <div>
                    <div className="db-col-label">Requirements</div>
                    <ul className="db-req-list">
                      {visaData.requirements?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="db-col-label">Step-by-Step Process</div>
                    {visaData.process?.map((s, i) => (
                      <div key={i} className="db-step">
                        <div className="db-step-num">{i + 1}</div>
                        <div className="db-step-text">{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="db-tip-box">
                  <div className="db-tip-label">💡 Expert Tips</div>
                  <div className="db-tip-text">{visaData.tips}</div>
                </div>

                <button className="db-chat-cta" onClick={() => onOpenChat({ country: selectedCountry, visa: selectedVisa })}>
                  💬 Ask AI about this visa →
                </button>
              </div>

              {/* CHECKLIST */}
              <div className="db-checklist-panel">
                <div className="db-checklist-head">
                  <span className="db-section-title">📋 Document Checklist</span>
                  <span className="db-progress-badge">{doneCount}/{totalCount}</span>
                </div>
                {visaData.requirements?.map((req, i) => (
                  <div key={i} className={`db-check-item${checklist[i] ? " done" : ""}`}>
                    <input type="checkbox" id={`c${i}`} checked={!!checklist[i]} onChange={() => toggleCheck(i)} />
                    <label htmlFor={`c${i}`}>{req}</label>
                  </div>
                ))}
                <div className="db-progress-bar">
                  <div className="db-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="db-progress-label">{pct}% complete</div>
              </div>
            </div>
          )}

          {/* SAMPLE QUESTIONS (no country selected) */}
          {!selectedCountry && (
            <div className="db-section">
              <div className="db-section-head">
                <span className="db-section-title">💡 Popular Questions</span>
              </div>
              <div className="db-samples-grid">
                {[
                  { icon:"🇨🇦", label:"Canada Study Permit", hint:"Requirements, SOP, work rights", q:"What are all the requirements for a Canada Study Permit from Pakistan?" },
                  { icon:"🇬🇧", label:"UK Skilled Worker", hint:"Sponsorship, salary thresholds, ILR", q:"Explain the UK Skilled Worker visa process and salary requirements." },
                  { icon:"🇩🇪", label:"Germany Free Study", hint:"APS cert, blocked account, process", q:"How can I study in Germany for free? What is the APS certificate?" },
                  { icon:"🇦🇺", label:"Australia PR Path", hint:"Points, 485 visa, migration", q:"What is the fastest pathway from student visa to Australian PR?" },
                  { icon:"🇺🇸", label:"US F-1 Interview", hint:"214(b), ties, financial proof", q:"Expert tips for passing US F-1 student visa interview as Pakistani applicant." },
                  { icon:"🇦🇪", label:"UAE Golden Visa", hint:"Eligibility, professions, 10yr", q:"How do I qualify for UAE Golden Visa? What professions apply?" },
                ].map((s, i) => (
                  <button key={i} className="db-sample-card" onClick={() => onOpenChat({ prefill: s.q })}>
                    <span className="db-sample-icon">{s.icon}</span>
                    <div className="db-sample-label">{s.label}</div>
                    <div className="db-sample-hint">{s.hint}</div>
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
