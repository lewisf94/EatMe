import { useCallback, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import type { ArchiveReason, InventoryRow } from "@eatme/shared";
import { api } from "../api";
import SwipeRow, { type SwipeAction } from "./SwipeRow";
import SwipeToast from "./SwipeToast";
import { ProductRow } from "./freshness";

const UNDO_MS = 5000;

type Pending = {
  key: number;
  name: string;
  reason: ArchiveReason;
  productId: string;
  lotIds: string[];
};

/** Swipe-to-archive for product rows: hides the row at once, archives every
 *  active pack of the product, and offers Undo (restores those packs) for 5 s. */
export function useSwipeArchive() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (id: string, on: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const archive = useCallback(async (row: InventoryRow, reason: ArchiveReason) => {
    show(row.productId, false);
    setError(null);
    try {
      const { lots } = await api.getProduct(row.productId);
      const active = lots.filter((l) => l.archivedAt == null);
      for (const lot of active) await api.archiveLot(lot.id, reason);
      setUndo({
        key: Date.now(),
        name: row.name,
        reason,
        productId: row.productId,
        lotIds: active.map((l) => l.id),
      });
    } catch (e) {
      show(row.productId, true);
      setError(e instanceof Error ? e.message : "Couldn’t update that item");
    }
  }, []);

  const restore = useCallback(async () => {
    if (!undo) return;
    try {
      for (const id of undo.lotIds) await api.restoreLot(id);
      show(undo.productId, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t undo");
    }
  }, [undo]);

  const dismiss = useCallback(() => setUndo(null), []);

  return { hidden, archive, undo, restore, dismiss, error };
}

const ACTIONS: SwipeAction[] = [
  {
    id: "finished",
    label: "Used up",
    icon: <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={2} />,
  },
  {
    id: "binned",
    label: "Binned",
    icon: <HugeiconsIcon icon={Delete02Icon} size={20} strokeWidth={2} />,
    color: "#c0362a",
    dismiss: true,
  },
];

/** A ProductRow you can swipe left: a full swipe marks it used up; the drawer
 *  also offers "Binned". */
export function SwipeProductRow({
  row,
  locName,
  today,
  onArchive,
}: {
  row: InventoryRow;
  locName: (id: string | null) => string;
  today: string;
  onArchive: (row: InventoryRow, reason: ArchiveReason) => void;
}) {
  return (
    <SwipeRow
      className="swipe-product"
      actions={ACTIONS}
      onCommit={(a) => onArchive(row, a.id as ArchiveReason)}
      actionColor="#5c7742"
      drawerColor="#6a6152"
      rowColor="#f4f1e8"
      textColor="#16130d"
      radius={0}
      actionWidth={80}
      label={row.name}
    >
      <ProductRow row={row} locName={locName} today={today} />
    </SwipeRow>
  );
}

/** The "Used up · Undo" toast above the bottom navigation. Swipe it down to
 *  dismiss it; it closes by itself after 5 s. */
export function UndoBar({ swipe }: { swipe: ReturnType<typeof useSwipeArchive> }) {
  const { undo } = swipe;
  if (!undo) return null;
  return (
    <SwipeToast
      key={undo.key}
      className="undobar"
      title={`${undo.name} ${undo.reason === "binned" ? "binned" : "used up"}`}
      actionLabel="Undo"
      onAction={() => void swipe.restore()}
      onClose={swipe.dismiss}
      background="#16130d"
      color="#f4f1e8"
      fuseColor="#f4b72a"
      width={480}
      duration={UNDO_MS}
    />
  );
}
