import { NavLink, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import Today from "./pages/Today";
import Inventory from "./pages/Inventory";
import AddItem from "./pages/AddItem";
import ReceiptImport from "./pages/ReceiptImport";
import ProductDetail from "./pages/ProductDetail";
import QrRedirect from "./pages/QrRedirect";
import Settings from "./pages/Settings";
import { IconHome, IconList, IconPlus } from "./ui/icons";

function BottomNav() {
  const on = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : undefined);
  return (
    <nav className="botnav">
      <NavLink to="/" end className={on}>
        <IconHome />
        Today
      </NavLink>
      <NavLink to="/add" className="add" aria-label="Add item">
        <IconPlus />
      </NavLink>
      <NavLink to="/food" className={on}>
        <IconList />
        Food
      </NavLink>
    </nav>
  );
}

// Screens not yet ported to the new language still need padding + nav clearance.
const wrap = (el: ReactNode) => <div className="screen">{el}</div>;

export default function App() {
  return (
    <div className="eatme">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/food" element={<Inventory />} />
        <Route path="/add" element={wrap(<AddItem />)} />
        <Route path="/receipt" element={wrap(<ReceiptImport />)} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/i/:qrUid" element={wrap(<QrRedirect />)} />
        <Route path="/settings" element={wrap(<Settings />)} />
      </Routes>
      <BottomNav />
    </div>
  );
}
