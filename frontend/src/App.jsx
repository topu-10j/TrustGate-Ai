import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LiveMonitor from "./pages/LiveMonitor";
import AIAnalysis from "./pages/AIAnalysis";
import SecureChat from "./pages/SecureChat";
import FirewallLogs from "./pages/FirewallLogs";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import AdminVault from "./pages/AdminVault";
import Documents from "./pages/Documents";
import { AuthWorkspace, useWorkspace } from "./state/AuthWorkspace";
import { canAccessRoute } from "./utils/exportUtils";

function AppRoutes({ theme, setTheme }) {
  const { role, authLoading, signOut } = useWorkspace();
  const logout = async () => { await signOut(); };
  if (authLoading) return <div className="min-h-screen grid place-items-center app-bg"><p className="text-sm text-muted">Restoring secure session…</p></div>;
  return <Routes>
    <Route path="/login" element={role ? <Navigate to="/" replace/> : <Login/>}/>
    <Route path="/*" element={role ? <Layout theme={theme} setTheme={setTheme} onLogout={logout}/> : <Navigate to="/login" replace/>}>
      <Route index element={<Dashboard/>}/>
      <Route path="monitor" element={<LiveMonitor/>}/>
      <Route path="analysis" element={<AIAnalysis/>}/>
      <Route path="chat" element={<SecureChat/>}/>
      <Route path="documents" element={<Documents/>}/>
      <Route path="logs" element={canAccessRoute(role, "/logs") ? <FirewallLogs/> : <Navigate to="/" replace/>}/>
      <Route path="analytics" element={canAccessRoute(role, "/analytics") ? <Analytics/> : <Navigate to="/" replace/>}/>
      <Route path="vault" element={canAccessRoute(role, "/vault") ? <AdminVault/> : <Navigate to="/" replace/>}/>
      <Route path="settings" element={<Settings theme={theme} setTheme={setTheme}/>}/>
    </Route>
    <Route path="*" element={<Navigate to={role ? "/" : "/login"} replace/>}/>
  </Routes>;
}
export default function App() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("trustgate-theme") || "dark"; } catch { return "dark"; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("trustgate-theme", theme); } catch { /* storage unavailable */ } document.title = "TrustGate AI | Security Platform"; }, [theme]);
  return <AuthWorkspace><AppRoutes theme={theme} setTheme={setTheme}/></AuthWorkspace>;
}
