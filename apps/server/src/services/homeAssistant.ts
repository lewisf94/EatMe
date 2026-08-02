import { byUrgency, civilToday } from "@eatme/shared";
import { listInventory } from "../repo/inventory.js";
import { getSetting, setSetting, timezone } from "../repo/settings.js";

const token = () => process.env.SUPERVISOR_TOKEN?.trim() ?? "";
const baseUrl = () =>
  (process.env.HOME_ASSISTANT_API_URL ?? "http://supervisor/core/api").replace(/\/+$/, "");

export function homeAssistantAvailable(): boolean {
  return Boolean(token());
}

async function call(path: string, body: unknown): Promise<void> {
  if (!homeAssistantAvailable()) throw new Error("Home Assistant API is unavailable");
  const response = await fetch(baseUrl() + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Home Assistant returned HTTP ${response.status}`);
}

/** Publish small native states for dashboards and automations. State writes are
 * repeated periodically because ad-hoc REST states do not survive an HA restart. */
export async function syncHomeAssistant(): Promise<{ available: boolean; synced: boolean }> {
  if (!homeAssistantAvailable()) return { available: false, synced: false };
  const rows = listInventory({}, civilToday(timezone())).sort(byUrgency);
  const expiring = rows.filter((row) => row.status !== "ok");
  const low = rows.filter(
    (row) => row.totalCount <= 1 && row.fractionLeft != null && row.fractionLeft <= 0.25,
  );
  try {
    await Promise.all([
      call("/states/sensor.eatme_expiring_soon", {
        state: String(expiring.length),
        attributes: {
          friendly_name: "EatMe expiring soon",
          icon: "mdi:food-apple-outline",
          unit_of_measurement: "items",
          products: expiring.slice(0, 20).map((row) => row.name),
        },
      }),
      call("/states/sensor.eatme_low_stock", {
        state: String(low.length),
        attributes: {
          friendly_name: "EatMe low stock",
          icon: "mdi:cart-outline",
          unit_of_measurement: "items",
          products: low.slice(0, 20).map((row) => row.name),
        },
      }),
    ]);
    setSetting("ha_last_sync", new Date().toISOString());
    setSetting("ha_last_error", "");
    return { available: true, synced: true };
  } catch (error) {
    setSetting(
      "ha_last_error",
      error instanceof Error ? error.message.slice(0, 200) : "sync failed",
    );
    return { available: true, synced: false };
  }
}

type ShoppingAction = "add_item" | "complete_item" | "incomplete_item" | "remove_item";

/** Optional one-way mirror into HA's built-in shopping list. EatMe remains the
 * source of truth, so a temporary HA outage can never reject a cupboard edit. */
export async function mirrorShopping(action: ShoppingAction, name: string): Promise<boolean> {
  if (getSetting("ha_shopping_sync", "false") !== "true" || !homeAssistantAvailable()) return false;
  try {
    await call(`/services/shopping_list/${action}`, { name });
    return true;
  } catch (error) {
    setSetting(
      "ha_last_error",
      error instanceof Error ? error.message.slice(0, 200) : "sync failed",
    );
    return false;
  }
}

export function homeAssistantStatus() {
  return {
    available: homeAssistantAvailable(),
    shoppingSyncEnabled: getSetting("ha_shopping_sync", "false") === "true",
    lastSync: getSetting("ha_last_sync", "") || null,
    lastError: getSetting("ha_last_error", "") || null,
  };
}
