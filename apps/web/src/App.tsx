import { NavLink, Routes, Route } from "react-router";
import type { ReactNode } from "react";
import Today from "./pages/Today";
import Inventory from "./pages/Inventory";
import AddItem from "./pages/AddItem";
import ReceiptImport from "./pages/ReceiptImport";
import ProductDetail from "./pages/ProductDetail";
import QrRedirect from "./pages/QrRedirect";
import Settings from "./pages/Settings";
import UseItUp from "./pages/UseItUp";
import Recipes from "./pages/Recipes";
import Shopping from "./pages/Shopping";
import Labels from "./pages/Labels";
import { IconHome, IconList, IconPlus, IconLeaf, IconCart } from "./ui/icons";

function BottomNav() {
  const on = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : undefined);
  return (
    <nav className="botnav">
      <NavLink to="/" end className={on}>
        <IconHome />
        Today
      </NavLink>
      <NavLink to="/use-it-up" className={on}>
        <IconLeaf />
        Cook
      </NavLink>
      <NavLink to="/add" className="add" aria-label="Add item">
        <IconPlus />
      </NavLink>
      <NavLink to="/food" className={on}>
        <IconList />
        Food
      </NavLink>
      <NavLink to="/shopping" className={on}>
        <IconCart />
        Shop
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
        <Route path="/use-it-up" element={<UseItUp />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/add" element={<AddItem />} />
        <Route path="/receipt" element={<ReceiptImport />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/i/:qrUid" element={wrap(<QrRedirect />)} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/labels" element={<Labels />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
