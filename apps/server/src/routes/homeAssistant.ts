import type { FastifyInstance } from "fastify";
import { homeAssistantStatus, syncHomeAssistant } from "../services/homeAssistant.js";

export async function registerHomeAssistant(app: FastifyInstance): Promise<void> {
  app.get("/home-assistant", async () => ({ data: homeAssistantStatus() }));
  app.post("/home-assistant/sync", async () => {
    const result = await syncHomeAssistant();
    return { data: { ...homeAssistantStatus(), ...result } };
  });
}
