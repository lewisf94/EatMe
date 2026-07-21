import { db } from "../db.js";
import { newId, type Container } from "@eatme/shared";

const COLS = "id, qr_uid, name, product_id, location_id, current_stock_lot_id";

type ContainerRow = {
  id: string;
  qr_uid: string;
  name: string | null;
  product_id: string | null;
  location_id: string | null;
  current_stock_lot_id: string | null;
};

function toContainer(r: ContainerRow): Container {
  return {
    id: r.id,
    qrUid: r.qr_uid,
    name: r.name,
    productId: r.product_id,
    locationId: r.location_id,
    currentStockLotId: r.current_stock_lot_id,
  };
}

export function getContainer(id: string): Container | undefined {
  const r = db.prepare(`SELECT ${COLS} FROM containers WHERE id = ?`).get(id) as
    ContainerRow | undefined;
  return r ? toContainer(r) : undefined;
}

export function getByQrUid(qrUid: string): Container | undefined {
  const r = db.prepare(`SELECT ${COLS} FROM containers WHERE qr_uid = ?`).get(qrUid) as
    ContainerRow | undefined;
  return r ? toContainer(r) : undefined;
}

/** Mint a container with a fresh printable QR uid. Every add gets one so labels
 *  and /i/:qrUid deep-links work; refilling later just repoints current lot. */
export function createContainer(input: {
  name?: string | null;
  productId?: string | null;
  locationId?: string | null;
  currentStockLotId?: string | null;
}): Container {
  const id = newId();
  const qrUid = newId(8);
  db.prepare(`INSERT INTO containers (${COLS}) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    qrUid,
    input.name ?? null,
    input.productId ?? null,
    input.locationId ?? null,
    input.currentStockLotId ?? null,
  );
  return getContainer(id) as Container;
}

/** Repoint a container at a newly-filled lot (a refill) without losing the label. */
export function setCurrentLot(
  id: string,
  lotId: string,
  locationId?: string,
): Container | undefined {
  const info = db
    .prepare(
      "UPDATE containers SET current_stock_lot_id = ?, location_id = COALESCE(?, location_id) WHERE id = ?",
    )
    .run(lotId, locationId ?? null, id);
  return info.changes ? getContainer(id) : undefined;
}
