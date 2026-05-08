// API base URL — change to your deployed backend URL in production
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── API helper ────────────────────────────────────────────────────────────
async function getToken(user) {
  try { return await user.getIdToken(); } catch { return null; }
}

export const api = {
  async get(path, user) {
    const token = await getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  },

  async post(path, body, user) {
    const token = await getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  },

  async delete(path, user) {
    const token = await getToken(user);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  },

  // SSE streaming chat
  async stream(body, user, onChunk, onDone, onError) {
    const token = await getToken(user);
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { onError(data.error); return; }
              if (data.done) { onDone(data.session_id); return; }
              if (data.text) onChunk(data.text);
            } catch {}
          }
        }
      }
    } catch (e) {
      onError(e.message);
    }
  },
};

// ── Local country data (fallback when backend is offline) ─────────────────
export const COUNTRIES = {
  "Canada": {
    flag: "🇨🇦", highlight: "Free healthcare after PR · PGWP · Express Entry",
    visas: {
      study: { name: "Study Permit", cost: "CAD $150", time: "8–12 weeks" },
      work:  { name: "Work Permit (LMIA)", cost: "CAD $155", time: "2–27 weeks" },
      visit: { name: "Temporary Resident Visa", cost: "CAD $100", time: "2–4 weeks" },
    },
  },
  "United Kingdom": {
    flag: "🇬🇧", highlight: "Graduate Visa · NHS via IHS · Points-based",
    visas: {
      study: { name: "Student Visa", cost: "£363 + IHS", time: "3 weeks" },
      work:  { name: "Skilled Worker Visa", cost: "£625–£1,423 + IHS", time: "3 weeks" },
      visit: { name: "Standard Visitor Visa", cost: "£115", time: "3 weeks" },
    },
  },
  "United States": {
    flag: "🇺🇸", highlight: "OPT/STEM OPT · H-1B · Green Card",
    visas: {
      study: { name: "F-1 Student Visa", cost: "SEVIS $350 + MRV $185", time: "Varies" },
      work:  { name: "H-1B / L-1 / O-1", cost: "$730–$4,000+", time: "3–6 months" },
      visit: { name: "B-1/B-2 Visitor Visa", cost: "$185", time: "Days–months" },
    },
  },
  "Germany": {
    flag: "🇩🇪", highlight: "Free tuition · EU Blue Card · Job Seeker Visa",
    visas: {
      study: { name: "National Student Visa", cost: "€75", time: "6–12 weeks" },
      work:  { name: "Skilled Worker / EU Blue Card", cost: "€75–€100", time: "4–12 weeks" },
      visit: { name: "Schengen Visa (Type C)", cost: "€90", time: "15 days" },
    },
  },
  "Australia": {
    flag: "🇦🇺", highlight: "485 Graduate Visa · SkillSelect · Employer 482",
    visas: {
      study: { name: "Student Visa (Subclass 500)", cost: "AUD $710", time: "4–6 weeks" },
      work:  { name: "Skilled Independent 189 / TSS 482", cost: "AUD $4,115", time: "Months–2 yrs" },
      visit: { name: "Visitor Visa (Subclass 600)", cost: "AUD $190", time: "20–30 days" },
    },
  },
  "UAE": {
    flag: "🇦🇪", highlight: "Golden Visa · Tax-free income · Fast processing",
    visas: {
      study: { name: "Student Residence Visa", cost: "AED 3,000–6,000", time: "1–2 weeks" },
      work:  { name: "Employment / Golden Visa", cost: "AED 3,000–5,000", time: "2–4 weeks" },
      visit: { name: "Tourist / Visit Visa", cost: "AED 200–500", time: "24–72 hours" },
    },
  },
  "New Zealand": {
    flag: "🇳🇿", highlight: "Skilled Migrant · AEWV · Quality of life",
    visas: {
      study: { name: "Student Visa", cost: "NZD $375", time: "3–4 weeks" },
      work:  { name: "Accredited Employer Work Visa", cost: "NZD $750–$2,900", time: "Weeks–months" },
      visit: { name: "Visitor Visa", cost: "NZD $211", time: "20 days" },
    },
  },
};

// ── Markdown renderer (simple, no deps) ──────────────────────────────────
export function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])/gm, "")
    .trim();
}
