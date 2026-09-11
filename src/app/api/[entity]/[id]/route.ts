/**
 * Generic CRUD — item route.
 *   PATCH  /api/{entity}/{id}   validate (partial) + update
 *   DELETE /api/{entity}/{id}   remove (FK-safe error handling)
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { REGISTRY } from "@/lib/registry";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const def = REGISTRY[entity];
  if (!def) return jsonError(`Unknown entity "${entity}"`, 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const parsed = def.schema.partial().safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first ? `${first.path.join(".")}: ${first.message}` : "Validation failed");
  }
  try {
    const t = def.table as any;
    const rows = (await db.update(t).set(parsed.data).where(eq(t.id, id)).returning()) as unknown as any[];
    if (!rows.length) return jsonError("Record not found", 404);
    return Response.json(rows[0]);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return jsonError("Duplicate value — that record already exists.", 409);
    console.error(`PATCH /api/${entity}/${id}`, e);
    return jsonError("Failed to update record", 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const def = REGISTRY[entity];
  if (!def) return jsonError(`Unknown entity "${entity}"`, 404);
  try {
    const t = def.table as any;
    const rows = (await db.delete(t).where(eq(t.id, id)).returning({ id: t.id })) as unknown as any[];
    if (!rows.length) return jsonError("Record not found", 404);
    return Response.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23503")
      return jsonError("Cannot delete — this record is referenced by other records.", 409);
    console.error(`DELETE /api/${entity}/${id}`, e);
    return jsonError("Failed to delete record", 500);
  }
}
