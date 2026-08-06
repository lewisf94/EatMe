import { NavLink, Routes, Route } from "react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { IconHome, IconList, IconPlus, IconLeaf, IconCart } from "./ui/icons";

const Today = lazy(() => import("./pages/Today"));
const Inventory = lazy(() => import("./pages/Inventory"));
const AddItem = lazy(() => import("./pages/AddItem"));
const ReceiptImport = lazy(() => import("./pages/ReceiptImport"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const QrRedirect = lazy(() => import("./pages/QrRedirect"));
const Settings = lazy(() => import("./pages/Settings"));
const UseItUp = lazy(() => import("./pages/UseItUp"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Shopping = lazy(() => import("./pages/Shopping"));
const Labels = lazy(() => import("./pages/Labels"));
const History = lazy(() => import("./pages/History"));

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
      <Suspense
        fallback={
          <div className="screen">
            <p className="empty">Loading…</p>
          </div>
        }
      >
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
          <Route path="/history" element={<History />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </div>
  );
}
