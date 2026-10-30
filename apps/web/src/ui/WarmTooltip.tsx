// Adapted from React Bits <WarmTooltip />: a label for icon-only buttons. On
// desktop it opens on hover or keyboard focus; once one label is open, the
// next one in the same group opens at once and glides over. On a phone it
// opens on a long press, and the tap that follows is not sent to the button.
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import "./WarmTooltip.css";

type Side = "top" | "bottom" | "left" | "right";
type Mode = "cold" | "warm" | "instant" | "move";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SIGN: Record<Side, number> = { top: 1, bottom: -1, left: -1, right: 1 };
const ORIGIN: Record<Side, string> = {
  top: "center bottom",
  bottom: "center top",
  left: "right center",
  right: "left center",
};
const SIZES = {
  sm: { font: 11.5, px: 8, py: 5 },
  md: { font: 12.5, px: 10, py: 6 },
  lg: { font: 13.5, px: 12, py: 7 },
};
const MARGIN = 8;
const HOLD_SLOP = 10;
const SWAP = 0.14;
const SWAP_SHIFT = 10;
const RISE = 4;
const GRACE = 80;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const horizontal = (side: Side) => side === "top" || side === "bottom";

const anchorOf = (rect: DOMRect, side: Side, gap: number): [number, number] => {
  if (side === "top") return [rect.left + rect.width / 2, rect.top - gap];
  if (side === "bottom") return [rect.left + rect.width / 2, rect.bottom + gap];
  if (side === "left") return [rect.left - gap, rect.top + rect.height / 2];
  return [rect.right + gap, rect.top + rect.height / 2];
};

const layoutOf = (x: number, y: number, width: number, height: number, side: Side) => {
  if (horizontal(side)) {
    const X = clamp(x - width / 2, MARGIN, Math.max(MARGIN, window.innerWidth - MARGIN - width));
    return { X, Y: side === "top" ? y - height : y };
  }
  const Y = clamp(y - height / 2, MARGIN, Math.max(MARGIN, window.innerHeight - MARGIN - height));
  return { X: side === "left" ? x - width : x, Y };
};

type Swap = { dir: number; across: boolean };
const LAYER = {
  enter: ({ dir, across }: Swap) => ({
    opacity: dir === 0 ? 1 : 0,
    x: across ? 0 : SWAP_SHIFT * dir,
    y: across ? SWAP_SHIFT * dir : 0,
    filter: dir === 0 ? "blur(0px)" : "blur(3px)",
  }),
  show: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
  exit: ({ dir, across }: Swap) => ({
    opacity: 0,
    x: across ? 0 : -SWAP_SHIFT * dir,
    y: across ? -SWAP_SHIFT * dir : 0,
    filter: "blur(3px)",
  }),
};

type Payload = {
  id: string;
  trigger: HTMLElement;
  content: ReactNode;
  side: Side;
  gap: number;
  arrow: boolean;
  radius: number;
  font: number;
  px: number;
  py: number;
  popDuration: number;
  popScale: number;
  popBlur: number;
  warmWindow: number;
};

type Group = {
  id: string;
  delay: number;
  warmWindow: number;
  activeId: string | null;
  isWarm: () => boolean;
  show: (payload: Payload, mode: Mode) => void;
  hide: (tooltipId: string, instant: boolean) => void;
};

const GroupContext = createContext<Group | null>(null);

/** Wrap a row of icon buttons (a header, a toolbar) so they share one label. */
export function WarmTooltipGroup({
  delay = 400,
  warmWindow = 300,
  travel = 320,
  children,
}: {
  delay?: number;
  warmWindow?: number;
  travel?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const [current, setCurrent] = useState<Payload | null>(null);
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const st = useRef({
    state: "closed" as "closed" | "open" | "closing",
    current: null as Payload | null,
    mode: "cold" as Mode,
    instant: false,
    warmUntil: -Infinity,
    swap: { dir: 0, across: false } as Swap,
    closeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    leaveTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  });
  const textRef = useRef<HTMLSpanElement | null>(null);
  const api = useRef({
    show: (_payload: Payload, _mode: Mode) => {},
    hide: (_tooltipId: string, _instant: boolean) => {},
  });

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const presence = useMotionValue(0);

  const sideNow = () => st.current.current?.side ?? "top";
  const place = useTransform([ax, ay, w, h], ([x, y, width, height]: number[]) => {
    const { X, Y } = layoutOf(x, y, width, height, sideNow());
    return `translate(${X}px, ${Y}px)`;
  });
  const arrowAt = useTransform([ax, ay, w, h], ([x, y, width, height]: number[]) => {
    const side = sideNow();
    const { X, Y } = layoutOf(x, y, width, height, side);
    return horizontal(side) ? clamp(x - X, 10, width - 10) : clamp(y - Y, 10, height - 10);
  });
  const pop = useTransform(presence, (p) => {
    const c = st.current.current;
    if (reduce || !c) return "none";
    const side = c.side;
    const scale = c.popScale + (1 - c.popScale) * p;
    const rise = (1 - p) * RISE * SIGN[side] * (side === "left" ? -1 : 1);
    const tx = horizontal(side) ? 0 : rise;
    const ty = horizontal(side) ? rise : 0;
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  });
  const blur = useTransform(presence, (p) => {
    const c = st.current.current;
    return reduce || !c ? "none" : `blur(${c.popBlur * (1 - p)}px)`;
  });

  const isWarm = () => st.current.state !== "closed" || now() < st.current.warmUntil;

  const finishClose = () => {
    st.current.state = "closed";
    st.current.current = null;
    setState("closed");
    setCurrent(null);
  };

  api.current.show = (payload, mode) => {
    clearTimeout(st.current.closeTimer);
    clearTimeout(st.current.leaveTimer);
    const prev = st.current.current;
    const fresh = st.current.state === "closed";
    if (prev && prev.id !== payload.id) {
      const [px, py] = anchorOf(prev.trigger.getBoundingClientRect(), prev.side, prev.gap);
      const [nx, ny] = anchorOf(payload.trigger.getBoundingClientRect(), payload.side, payload.gap);
      const across = !horizontal(payload.side);
      st.current.swap = { dir: Math.sign(across ? ny - py : nx - px) || 1, across };
    } else {
      st.current.swap = { dir: 0, across: !horizontal(payload.side) };
    }
    st.current.mode = fresh ? mode : mode === "instant" ? "instant" : "move";
    st.current.instant = mode === "instant";
    st.current.current = payload;
    st.current.state = "open";
    setCurrent(payload);
    setState("open");
  };

  const beginClose = (instant: boolean) => {
    const c = st.current.current;
    if (!c || st.current.state !== "open") return;
    st.current.state = "closing";
    setState("closing");
    st.current.warmUntil = now() + c.warmWindow;
    if (instant) {
      presence.jump(0);
      finishClose();
      return;
    }
    const closeMs = Math.round(c.popDuration * 0.8);
    animate(presence, 0, { duration: closeMs / 1000, ease: EASE_OUT });
    st.current.closeTimer = setTimeout(finishClose, closeMs);
  };

  api.current.hide = (tooltipId, instant) => {
    const c = st.current.current;
    if (!c || c.id !== tooltipId || st.current.state !== "open") return;
    clearTimeout(st.current.leaveTimer);
    if (instant || st.current.instant) {
      beginClose(true);
      return;
    }
    st.current.leaveTimer = setTimeout(() => beginClose(false), GRACE);
  };

  const group = useMemo<Group>(
    () => ({
      id,
      delay,
      warmWindow,
      activeId: current ? current.id : null,
      isWarm,
      show: (payload, mode) => api.current.show(payload, mode),
      hide: (tooltipId, instant) => api.current.hide(tooltipId, instant),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, delay, warmWindow, current],
  );

  useLayoutEffect(() => {
    const c = st.current.current;
    const text = textRef.current;
    if (!c || !text || state !== "open") return;
    const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
    const tw = text.offsetWidth + c.px * 2;
    const th = text.offsetHeight + c.py * 2;
    const mode = st.current.mode;
    if (mode === "move" && !reduce && travel > 0) {
      const spring = { type: "spring" as const, duration: travel / 1000, bounce: 0.1 };
      animate(ax, tx, spring);
      animate(ay, ty, spring);
      animate(w, tw, spring);
      animate(h, th, spring);
      animate(presence, 1, { duration: 0.12, ease: EASE_OUT });
      return;
    }
    ax.jump(tx);
    ay.jump(ty);
    w.jump(tw);
    h.jump(th);
    if (mode === "cold" && !reduce) {
      presence.jump(0);
      animate(presence, 1, { duration: c.popDuration / 1000, ease: EASE_OUT });
    } else {
      presence.jump(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, state]);

  useEffect(() => {
    if (state === "closed") return undefined;
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const c = st.current.current;
        if (!c) return;
        const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
        ax.jump(tx);
        ay.jump(ty);
      });
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden" && st.current.current)
        api.current.hide(st.current.current.id, true);
    };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
      document.removeEventListener("visibilitychange", onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(
    () => () => {
      clearTimeout(st.current.closeTimer);
      clearTimeout(st.current.leaveTimer);
    },
    [],
  );

  const side = current ? current.side : "top";
  const arrowStyle = horizontal(side) ? { left: arrowAt } : { top: arrowAt };

  return (
    <GroupContext.Provider value={group}>
      {children}
      {state !== "closed" && current && typeof document !== "undefined"
        ? createPortal(
            <motion.span
              id={id}
              role="tooltip"
              className="warm-tooltip"
              data-side={side}
              style={
                {
                  transform: place,
                  width: w,
                  height: h,
                  "--wt-radius": `${current.radius}px`,
                  "--wt-font": `${current.font}px`,
                  "--wt-origin": ORIGIN[side],
                } as unknown as CSSProperties
              }
            >
              <motion.span
                className="warm-tooltip__box"
                style={{ transform: pop, opacity: presence, filter: blur }}
              >
                <AnimatePresence initial={false} custom={st.current.swap}>
                  <motion.span
                    key={current.id}
                    className="warm-tooltip__layer"
                    custom={st.current.swap}
                    variants={LAYER}
                    initial="enter"
                    animate="show"
                    exit="exit"
                    transition={{ duration: reduce ? 0 : SWAP, ease: EASE_OUT }}
                  >
                    <span
                      ref={(el) => {
                        if (el) textRef.current = el;
                      }}
                      className="warm-tooltip__text"
                    >
                      {current.content}
                    </span>
                  </motion.span>
                </AnimatePresence>
                {current.arrow ? (
                  <motion.span
                    className="warm-tooltip__arrow"
                    data-side={side}
                    style={arrowStyle}
                    aria-hidden="true"
                  />
                ) : null}
              </motion.span>
            </motion.span>,
            document.body,
          )
        : null}
    </GroupContext.Provider>
  );
}

type TipProps = {
  content: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: Side;
  delay?: number;
  warmWindow?: number;
  size?: keyof typeof SIZES;
  radius?: number;
  gap?: number;
  arrow?: boolean;
  popDuration?: number;
  popScale?: number;
  popBlur?: number;
  longPress?: number;
  disabled?: boolean;
  className?: string;
};

function Trigger({
  content,
  children,
  side = "bottom",
  delay,
  warmWindow,
  size = "md",
  radius = 8,
  gap = 8,
  arrow = true,
  popDuration = 160,
  popScale = 0.94,
  popBlur = 4,
  longPress = 500,
  disabled = false,
  className = "",
}: TipProps) {
  const group = useContext(GroupContext)!;
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pressing, setPressing] = useState(false);
  const t = useRef({
    open: undefined as ReturnType<typeof setTimeout> | undefined,
    press: undefined as ReturnType<typeof setTimeout> | undefined,
    press0: null as { x: number; y: number; id: number } | null,
    suppressClick: false,
  });
  const preset = SIZES[size] ?? SIZES.md;
  const coldDelay = delay ?? group.delay;
  const active = group.activeId === id;

  const payload = (): Payload => ({
    id,
    trigger: triggerRef.current!,
    content,
    side,
    gap,
    arrow,
    radius,
    font: preset.font,
    px: preset.px,
    py: preset.py,
    popDuration,
    popScale,
    popBlur,
    warmWindow: warmWindow ?? group.warmWindow,
  });

  const hide = (instant: boolean) => {
    clearTimeout(t.current.open);
    group.hide(id, instant);
  };

  const arm = () => {
    if (group.isWarm()) {
      group.show(payload(), "warm");
      return;
    }
    t.current.open = setTimeout(() => group.show(payload(), "cold"), coldDelay);
  };

  const cancelPress = () => {
    clearTimeout(t.current.press);
    if (!t.current.press0) return;
    t.current.press0 = null;
    setPressing(false);
  };

  useEffect(() => {
    if (disabled) {
      cancelPress();
      hide(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    if (!active) return undefined;
    const onOutside = (e: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) hide(false);
    };
    document.addEventListener("pointerdown", onOutside, true);
    return () => document.removeEventListener("pointerdown", onOutside, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(
    () => () => {
      clearTimeout(t.current.open);
      clearTimeout(t.current.press);
      group.hide(id, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlers = disabled
    ? {}
    : {
        onPointerEnter: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (e.pointerType !== "touch" && e.buttons === 0) arm();
        },
        onPointerLeave: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (e.pointerType !== "touch") hide(false);
        },
        onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (e.pointerType === "mouse") {
            hide(false);
            return;
          }
          t.current.press0 = { x: e.clientX, y: e.clientY, id: e.pointerId };
          setPressing(true);
          t.current.press = setTimeout(() => {
            t.current.suppressClick = true;
            t.current.press0 = null;
            setPressing(false);
            group.show(payload(), "cold");
          }, longPress);
        },
        onPointerMove: (e: ReactPointerEvent<HTMLSpanElement>) => {
          const p = t.current.press0;
          if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP)
            cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (e: ReactMouseEvent<HTMLSpanElement>) => {
          if (t.current.press0 || t.current.suppressClick) e.preventDefault();
        },
        onClickCapture: (e: ReactMouseEvent<HTMLSpanElement>) => {
          if (!t.current.suppressClick) return;
          t.current.suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
        },
        onFocus: (e: ReactFocusEvent<HTMLSpanElement>) => {
          if ((e.target as HTMLElement).matches?.(":focus-visible"))
            group.show(payload(), "instant");
        },
        onBlur: () => hide(true),
        onKeyDown: (e: ReactKeyboardEvent<HTMLSpanElement>) => {
          if (e.key === "Escape") hide(true);
        },
      };

  const described = children.props["aria-describedby"];

  return (
    <span
      ref={triggerRef}
      className={`warm-tooltip__trigger${className ? ` ${className}` : ""}`}
      data-pressing={pressing ? "" : undefined}
      {...handlers}
    >
      {cloneElement(children, { "aria-describedby": active ? group.id : described })}
    </span>
  );
}

/** A label for an icon-only control. Put several inside one WarmTooltipGroup. */
export default function WarmTooltip(props: TipProps) {
  const context = useContext(GroupContext);
  if (context) return <Trigger {...props} />;
  return (
    <WarmTooltipGroup delay={props.delay} warmWindow={props.warmWindow}>
      <Trigger {...props} />
    </WarmTooltipGroup>
  );
}
