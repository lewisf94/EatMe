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

type LabelContainerRow = ContainerRow & {
  display_name: string;
  product_name: string | null;
  location_name: string | null;
};

export type LabelContainer = Container & {
  displayName: string;
  productName: string | null;
  locationName: string | null;
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

/** Containers available for printable labels, optionally narrowed to a product.
 *  The current lot is a fallback for containers created before product_id was
 *  populated, so migrated labels remain usable. */
export function listLabelContainers(productId?: string): LabelContainer[] {
  const rows = db
    .prepare(
      `SELECT c.${COLS.replaceAll(", ", ", c.")},
              COALESCE(NULLIF(c.name, ''), p.name, 'Unnamed container') AS display_name,
              p.name AS product_name,
              l.name AS location_name
         FROM containers c
         LEFT JOIN stock_lots sl ON sl.id = c.current_stock_lot_id
         LEFT JOIN products p ON p.id = COALESCE(c.product_id, sl.product_id)
         LEFT JOIN locations l ON l.id = c.location_id
        WHERE (? IS NULL OR COALESCE(c.product_id, sl.product_id) = ?)
        ORDER BY display_name COLLATE NOCASE, c.id`,
    )
    .all(productId ?? null, productId ?? null) as LabelContainerRow[];

  return rows.map((row) => ({
    ...toContainer(row),
    displayName: row.display_name,
    productName: row.product_name,
    locationName: row.location_name,
  }));
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
