import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import "./App.css";

// 🔴 REPLACE with your Firebase config from Firebase Console
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard"); // dashboard | chat
  const [chatContext, setChatContext] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const openChat = (context = null) => {
    setChatContext(context);
    setPage("chat");
  };

  if (loading) return <Loader />;
  if (!user) return <AuthPage auth={auth} />;

  return (
    <div className="app-root">
      {page === "dashboard" && (
        <Dashboard user={user} auth={auth} onOpenChat={openChat} />
      )}
      {page === "chat" && (
        <ChatPage
          user={user}
          auth={auth}
          context={chatContext}
          onBack={() => setPage("dashboard")}
        />
      )}
    </div>
  );
}

function Loader() {
  return (
    <div className="loader-screen">
      <div className="loader-logo">Visa<span>Path</span></div>
      <div className="loader-spinner" />
    </div>
  );
}
