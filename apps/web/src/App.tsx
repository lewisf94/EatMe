import { NavLink, Routes, Route, useLocation } from "react-router";
import { motion } from "motion/react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { IconHome, IconList, IconPlus, IconLeaf, IconCart } from "./ui/icons";
import { TOKEN_KEY, UNAUTHORIZED_EVENT } from "./api";

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

/** Shown over the app when the server answers 401: the add-on generates an
 *  access token on first start, so a new device must be given it once. */
function TokenGate() {
  const [locked, setLocked] = useState(false);
  const [token, setToken] = useState("");
  useEffect(() => {
    const lock = () => setLocked(true);
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, []);
  if (!locked) return null;

  const save = () => {
    if (!token.trim()) return;
    try {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } catch {
      // Private mode can refuse storage; the reload then asks again.
    }
    window.location.reload();
  };

  return (
    <div className="screen token-gate" role="dialog" aria-labelledby="token-gate-title">
      <h1 id="token-gate-title">Enter your access token</h1>
      <p className="note left" style={{ marginBottom: 10 }}>
        EatMe needs its access token on each new device. Find it in the EatMe app log in Home
        Assistant (the line that starts &ldquo;generated auth_token&rdquo;), or in the{" "}
        <code>auth_token</code> option if you set one.
      </p>
      <form
        style={{ display: "flex", gap: 8 }}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          className="field"
          type="password"
          autoComplete="current-password"
          aria-label="Access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="btn btn-primary" style={{ flex: "none" }} type="submit">
          Save
        </button>
      </form>
    </div>
  );
}

// Screens not yet ported to the new language still need padding + nav clearance.
const wrap = (el: ReactNode) => <div className="screen">{el}</div>;

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="eatme">
      {/* Each screen fades up on arrival; MotionConfig in main.tsx turns this
          off when the phone asks for reduced motion. */}
      <motion.div
        key={pathname}
        className="page"
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
