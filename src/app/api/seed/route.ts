/**
 * POST /api/seed — wipe + reseed the demo dataset.
 * Used by the "Reset demo data" action in the sidebar.
 */
import { resetAndSeed } from "@/lib/seed";

export async function POST() {
  try {
    await resetAndSeed();
    return Response.json({ ok: true });
  } catch (e) {
    console.error("POST /api/seed", e);
    return Response.json({ error: "Failed to seed database" }, { status: 500 });
  }
}
