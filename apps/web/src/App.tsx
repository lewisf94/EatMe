import { NavLink, Routes, Route, useLocation } from "react-router";
import { motion } from "motion/react";
import { lazy, Suspense, type ReactNode } from "react";
import {
  IconHome,
  IconList,
  IconPlus,
  IconLeaf,
  IconCart,
  IconBook,
  IconReceipt,
  IconQr,
  IconClock,
  IconGear,
} from "./ui/icons";
import TokenGate from "./ui/TokenGate";
import WarmTooltip from "./ui/WarmTooltip";

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
      <WarmTooltip content="Add item" side="top">
        <NavLink to="/add" className="add" aria-label="Add item">
          <IconPlus />
        </NavLink>
      </WarmTooltip>
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

// Desktop navigation (≥1024px wide, see index.css). It shows every screen at
// once, so the screens a phone reaches through Settings or a link are one click
// away. The phone keeps the bottom bar above; CSS shows only one of the two.
function SideNav() {
  const on = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : undefined);
  return (
    <aside className="sidenav" aria-label="Main">
      <NavLink to="/" className="sidenav-wm">
        Eat<span className="u">Me</span>
      </NavLink>
      <NavLink to="/add" className="sidenav-add">
        <IconPlus />
        Add item
      </NavLink>
      <nav className="sidenav-group">
        <NavLink to="/" end className={on}>
          <IconHome />
          Today
        </NavLink>
        <NavLink to="/use-it-up" className={on}>
          <IconLeaf />
          Use it up
        </NavLink>
        <NavLink to="/recipes" className={on}>
          <IconBook />
          Recipes
        </NavLink>
        <NavLink to="/food" className={on}>
          <IconList />
          All food
        </NavLink>
        <NavLink to="/shopping" className={on}>
          <IconCart />
          Shopping
        </NavLink>
      </nav>
      <nav className="sidenav-group sidenav-more" aria-label="More">
        <NavLink to="/receipt" className={on}>
          <IconReceipt />
          Scan a receipt
        </NavLink>
        <NavLink to="/labels" className={on}>
          <IconQr />
          Labels
        </NavLink>
        <NavLink to="/history" className={on}>
          <IconClock />
          History
        </NavLink>
        <NavLink to="/settings" className={on}>
          <IconGear />
          Settings
        </NavLink>
      </nav>
    </aside>
  );
}

// Screens not yet ported to the new language still need padding + nav clearance.
const wrap = (el: ReactNode) => <div className="screen">{el}</div>;

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="eatme">
      <SideNav />
      {/* Each screen fades up on arrival; MotionConfig in main.tsx turns this
          off when the phone asks for reduced motion. */}
      <motion.div
        key={pathname}
        className="page"
        data-route={pathname.split("/")[1] || "today"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      >
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
      </motion.div>
      <BottomNav />
      <TokenGate />
    </div>
  );
}
