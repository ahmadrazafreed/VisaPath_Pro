import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";

export default function AuthPage({ auth }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const clearError = () => { setError(""); setMessage(""); };

  const handleGoogle = async () => {
    setLoading(true); clearError();
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); clearError();
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setMessage("Password reset email sent! Check your inbox.");
      }
    } catch (e) {
      const msgs = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password. Try again.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
      };
      setError(msgs[e.code] || e.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Visa<span>Path</span> <span style={{fontSize:'0.6em',background:'rgba(59,130,246,0.15)',padding:'2px 8px',borderRadius:'8px',color:'var(--accent)',fontWeight:700}}>PRO</span></div>
        <p className="auth-sub">
          {mode === "login" && "Your AI-powered immigration consultant"}
          {mode === "signup" && "Create your free account"}
          {mode === "reset" && "Reset your password"}
        </p>

        {mode !== "reset" && (
          <>
            <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {loading ? "Signing in..." : "Continue with Google"}
            </button>

            <div className="auth-divider"><span>or continue with email</span></div>
          </>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div>
              <label className="input-label">Full Name</label>
              <input className="input" type="text" placeholder="Ahmad Hassan" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="input-label">Email Address</label>
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {mode !== "reset" && (
            <div>
              <label className="input-label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {message && <div style={{color:'var(--success)',fontSize:'0.82rem',padding:'10px',background:'rgba(16,185,129,0.08)',borderRadius:'8px'}}>{message}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',justifyContent:'center',padding:'12px'}}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Email"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" && (
            <>
              Don't have an account? <button onClick={() => { setMode("signup"); clearError(); }}>Sign up free</button>
              <br /><br />
              <button onClick={() => { setMode("reset"); clearError(); }} style={{color:'var(--text2)'}}>Forgot password?</button>
            </>
          )}
          {mode === "signup" && (
            <>Already have an account? <button onClick={() => { setMode("login"); clearError(); }}>Sign in</button></>
          )}
          {mode === "reset" && (
            <button onClick={() => { setMode("login"); clearError(); }}>← Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
