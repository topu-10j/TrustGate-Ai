import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import LiveMonitor from "./pages/LiveMonitor";
import AIAnalysis from "./pages/AIAnalysis";
import SecureChat from "./pages/SecureChat";
import FirewallLogs from "./pages/FirewallLogs";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import { DemoWorkspace } from "./state/DemoWorkspace";

export default function App() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("trustgate-theme") || "dark"; } catch { return "dark"; } });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("trustgate-theme", theme); } catch { /* storage may be unavailable */ }
    document.title = "TrustGate | AI Security Platform";
  }, [theme]);

  return (
    <DemoWorkspace>
      <Routes>
        <Route element={<Layout theme={theme} setTheme={setTheme} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitor" element={<LiveMonitor />} />
          <Route path="/analysis" element={<AIAnalysis />} />
          <Route path="/chat" element={<SecureChat />} />
          <Route path="/logs" element={<FirewallLogs />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings theme={theme} setTheme={setTheme} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DemoWorkspace>
  );
}