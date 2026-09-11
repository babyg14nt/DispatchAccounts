/**
 * Settlement item route.
 *   PATCH  /api/settlements/{id}   mark draft <-> paid
 *   DELETE /api/settlements/{id}   remove + release swept deductions
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deductions, settlementItems, settlements } from "@/db/schema";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ status: z.enum(["draft", "paid"]) });

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid status");
  try {
    const [row] = await db
      .update(settlements)
      .set({ status: parsed.data.status })
      .where(eq(settlements.id, id))
      .returning();
    if (!row) return jsonError("Settlement not found", 404);
    return Response.json(row);
  } catch (e) {
    console.error("PATCH /api/settlements", e);
    return jsonError("Failed to update settlement", 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    /* Release deductions that were swept into this settlement */
    await db
      .update(deductions)
      .set({ settlementId: null })
      .where(eq(deductions.settlementId, id));
    /* Remove line items, then the settlement itself */
    await db.delete(settlementItems).where(eq(settlementItems.settlementId, id));
    const rows = await db
      .delete(settlements)
      .where(eq(settlements.id, id))
      .returning({ id: settlements.id });
    if (!rows.length) return jsonError("Settlement not found", 404);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/settlements", e);
    return jsonError("Failed to delete settlement", 500);
  }
}
