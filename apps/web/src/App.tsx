import { NavLink, Routes, Route } from "react-router-dom";
import Inventory from "./pages/Inventory";
import AddItem from "./pages/AddItem";
import ReceiptImport from "./pages/ReceiptImport";
import ProductDetail from "./pages/ProductDetail";
import QrRedirect from "./pages/QrRedirect";
import Settings from "./pages/Settings";

function TabLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
          isActive ? "text-emerald-600" : "text-slate-500"
        }`
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">
          <span aria-hidden>🫙</span> EatMe
        </h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Routes>
          <Route path="/" element={<Inventory />} />
          <Route path="/add" element={<AddItem />} />
          <Route path="/receipt" element={<ReceiptImport />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/i/:qrUid" element={<QrRedirect />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-xl border-t border-slate-200 bg-white">
        <TabLink to="/" label="Cupboard" icon="🗄️" />
        <TabLink to="/add" label="Add" icon="➕" />
        <TabLink to="/settings" label="Settings" icon="⚙️" />
      </nav>
    </div>
  );
}
