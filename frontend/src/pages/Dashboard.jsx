import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { api, COUNTRIES } from "../api";

const VISA_TYPES = [
  { key: "study", label: "📚 Study", activeClass: "active-study" },
  { key: "work",  label: "💼 Work",  activeClass: "active-work"  },
  { key: "visit", label: "✈️ Visit", activeClass: "active-visit" },
];

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

export default function Dashboard({ user, auth, onOpenChat }) {
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedVisa, setSelectedVisa] = useState(null);
  const [visaData, setVisaData] = useState(null);
  const [countries, setCountries] = useState({});
  const [checklist, setChecklist] = useState({});
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    loadCountries();
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedCountry && selectedVisa) {
      loadVisaData(selectedCountry, selectedVisa);
      loadChecklist(selectedCountry, selectedVisa);
    }
  }, [selectedCountry, selectedVisa]);

  const loadCountries = async () => {
    try {
      const data = await api.get("/api/countries", user);
      setCountries(data);
    } catch (e) {
      // Use local data as fallback
      setCountries(COUNTRIES);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await api.get("/api/sessions", user);
      setSessions(data || []);
    } catch (e) {}
  };

  const loadVisaData = async (country, visa) => {
    try {
      const data = await api.get(`/api/visa/${encodeURIComponent(country)}/${visa}`, user);
      setVisaData(data);
    } catch (e) {}
  };

  const loadChecklist = async (country, visa) => {
    try {
      const data = await api.get(`/api/checklist/${encodeURIComponent(country)}/${visa}`, user);
      setChecklist(data.items || {});
    } catch (e) {}
  };

  const toggleCheck = async (idx) => {
    const updated = { ...checklist, [idx]: !checklist[idx] };
    setChecklist(updated);
    try {
      await api.post("/api/checklist", { country: selectedCountry, visa_type: selectedVisa, items: updated }, user);
    } catch (e) {}
  };

  const doneCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = visaData?.requirements?.length || 0;
  const pct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 0px)" }}>
      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">Visa<span>Path</span></div>
        <div className="nav-right">
          <span className="badge badge-live">LIVE Data</span>
          <div className="nav-user">
            <div className="nav-avatar">{initials}</div>
            <span>{displayName}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </nav>

      <div className="dashboard">
        {/* SIDEBAR — Chat history */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginBottom: 16 }}
              onClick={() => onOpenChat(selectedCountry && selectedVisa ? { country: selectedCountry, visa: selectedVisa } : null)}
            >
              + New Chat
            </button>

            {sessions.length > 0 && (
              <>
                <div className="sidebar-label">Recent Chats</div>
                {sessions.map(s => (
                  <div
                    key={s.id}
                    className="session-item"
                    onClick={() => onOpenChat({ sessionId: s.id, country: s.country, visa: s.visa_type })}
                  >
                    <div className="session-title">
                      {s.country ? `${COUNTRIES[s.country]?.flag || ""} ${s.country}` : "General Chat"}
                    </div>
                    <div className="session-meta">{s.last_message?.slice(0, 40) || "No messages yet"}...</div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Quick questions */}
          {selectedCountry && selectedVisa && (
            <div className="sidebar-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div className="sidebar-label">Quick Questions</div>
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} className="quick-btn" onClick={() => onOpenChat({ country: selectedCountry, visa: selectedVisa, prefill: q + " for " + selectedCountry + " " + selectedVisa + " visa" })}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main className="main-content">
          {/* HERO */}
          <div className="hero">
            <div className="hero-badge">✈️ &nbsp; AI-Powered Immigration Consultant</div>
            <h1>Get Your Visa to<br /><em>Any Country.</em> Fast.</h1>
            <p>Expert guidance powered by real-time government data and AI. Study, work, and travel visa intelligence across 7 major destinations.</p>

            <div className="stats-row">
              {[["7","Countries"],["21","Visa Categories"],["Live","Processing Times"],["AI","Web Search"]].map(([v,l]) => (
                <div className="stat" key={l}><div className="stat-val">{v}</div><div className="stat-label">{l}</div></div>
              ))}
            </div>
          </div>

          {/* COUNTRY SELECTOR */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">🌍 Select Destination</span>
              <span className="section-sub">Click a country to focus the AI consultant</span>
            </div>
            <div className="country-grid">
              {Object.entries(countries).map(([country, data]) => (
                <div
                  key={country}
                  className={`country-card${selectedCountry === country ? " selected" : ""}`}
                  onClick={() => { setSelectedCountry(country); setSelectedVisa(null); setVisaData(null); }}
                >
                  <span className="country-flag">{data.flag}</span>
                  <div className="country-name">{country}</div>
                </div>
              ))}
            </div>

            {/* VISA TYPE TABS */}
            {selectedCountry && (
              <div>
                <div className="section-header" style={{ marginTop: 8 }}>
                  <span className="section-title">{countries[selectedCountry]?.flag} {selectedCountry}</span>
                  <span className="section-sub">{countries[selectedCountry]?.highlight}</span>
                </div>
                <div className="visa-tabs">
                  {VISA_TYPES.map(vt => (
                    <button
                      key={vt.key}
                      className={`visa-tab ${vt.key}${selectedVisa === vt.key ? " " + vt.activeClass : ""}`}
                      onClick={() => setSelectedVisa(vt.key)}
                    >
                      {vt.label}
                    </button>
                  ))}
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => onOpenChat({ country: selectedCountry, visa: selectedVisa })}
                  >
                    Ask AI Consultant →
                  </button>
                </div>
              </div>
            )}

            {/* VISA INFO PANEL */}
            {visaData && (
              <div className="visa-panel">
                <div className="visa-panel-header">
                  <div>
                    <div className="visa-panel-title">{visaData.name}</div>
                    <div className="visa-panel-sub">{countries[selectedCountry]?.flag} {selectedCountry} · {selectedVisa?.charAt(0).toUpperCase() + selectedVisa?.slice(1)} Visa</div>
                  </div>
                  <div className="visa-meta">
                    <div className="visa-meta-chip">⏱ Processing <strong>{visaData.time}</strong></div>
                    <div className="visa-meta-chip">💳 Cost <strong>{visaData.cost}</strong></div>
                    {visaData.official_url && (
                      <a href={visaData.official_url} target="_blank" rel="noreferrer" className="visa-meta-chip" style={{ textDecoration: "none", cursor: "pointer", color: "var(--accent)" }}>
                        🔗 Official Site
                      </a>
                    )}
                  </div>
                </div>

                <div className="two-col">
                  <div>
                    <div className="col-title">Requirements</div>
                    <ul className="req-list">
                      {visaData.requirements?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="col-title">Step-by-Step Process</div>
                    {visaData.process?.map((s, i) => (
                      <div className="step" key={i}>
                        <div className="step-num">{i + 1}</div>
                        <div className="step-text">{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="tip-box">
                  <div className="tip-label">💡 Expert Tips</div>
                  <div className="tip-text">{visaData.tips}</div>
                </div>
              </div>
            )}

            {/* DOCUMENT CHECKLIST */}
            {visaData && (
              <div className="card" style={{ marginTop: 0 }}>
                <div className="section-header" style={{ marginBottom: 16 }}>
                  <span className="section-title">📋 Document Checklist</span>
                  <span className="badge badge-blue">{doneCount}/{totalCount} ready</span>
                </div>
                {visaData.requirements?.map((req, i) => (
                  <div key={i} className={`checklist-item${checklist[i] ? " checked" : ""}`}>
                    <input type="checkbox" id={`chk_${i}`} checked={!!checklist[i]} onChange={() => toggleCheck(i)} />
                    <label htmlFor={`chk_${i}`}>{req}</label>
                  </div>
                ))}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="progress-label">{pct}% of documents ready</div>
              </div>
            )}

            {/* SAMPLE QUESTIONS (shown when no country selected) */}
            {!selectedCountry && (
              <div>
                <div className="section-header" style={{ marginTop: 8 }}>
                  <span className="section-title">💡 Try asking...</span>
                </div>
                <div className="samples-grid">
                  {[
                    { icon: "🇨🇦", label: "Canada Study Permit", hint: "Requirements, SOP tips, work rights", q: "What are all the requirements for a Canada Study Permit from Pakistan? Give me step-by-step guidance." },
                    { icon: "🇬🇧", label: "UK Skilled Worker Visa", hint: "Sponsorship, salary thresholds, ILR", q: "Explain the UK Skilled Worker visa process. What salary do I need and how does employer sponsorship work?" },
                    { icon: "🇩🇪", label: "Germany Free Tuition", hint: "APS cert, blocked account, process", q: "How can I study in Germany for free? What is the APS certificate and how do I open a blocked account?" },
                    { icon: "🇦🇺", label: "Australia PR Pathway", hint: "Points, 485 visa, skilled migration", q: "What is the fastest pathway from student visa to Permanent Residence in Australia?" },
                    { icon: "🇺🇸", label: "US F-1 Interview Tips", hint: "214(b), ties, financial proof", q: "Give me expert tips for passing the US F-1 student visa interview as a Pakistani applicant." },
                    { icon: "🇦🇪", label: "UAE Golden Visa", hint: "Eligibility, professions, 10-year visa", q: "How do I qualify for UAE Golden Visa? What professions and salary requirements apply?" },
                  ].map((s, i) => (
                    <button key={i} className="sample-card" onClick={() => onOpenChat({ prefill: s.q })}>
                      <span className="sample-icon">{s.icon}</span>
                      <div className="sample-label">{s.label}</div>
                      <div className="sample-hint">{s.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
