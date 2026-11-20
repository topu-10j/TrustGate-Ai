import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout({ theme, setTheme, onLogout }) {
  const [open, setOpen] = useState(false);
  return <div className="app-bg min-h-screen">
    <Sidebar open={open} setOpen={setOpen} onLogout={onLogout}/>
    <div className="min-h-screen lg:pl-[218px]">
      <Topbar setOpen={setOpen} theme={theme} setTheme={setTheme} onLogout={onLogout}/>
      <main className="grid-glow min-h-[calc(100vh-70px)] px-4 py-5 md:px-7 md:py-6">
        <div className="mx-auto w-full max-w-[1600px]"><Outlet/></div>
      </main>
      <footer className="border-t border-ui px-6 py-4 text-center text-[10px] text-subtle lg:ml-0">© 2026 TrustGate · AI Security & Threat Intelligence Platform</footer>
    </div>
  </div>;
}