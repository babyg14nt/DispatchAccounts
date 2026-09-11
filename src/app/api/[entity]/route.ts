/**
 * Generic CRUD — collection route.
 *   GET  /api/{entity}          list rows (with joins when configured)
 *   POST /api/{entity}          validate + insert
 */
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { REGISTRY } from "@/lib/registry";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { entity } = await ctx.params;
  const def = REGISTRY[entity];
  if (!def) return jsonError(`Unknown entity "${entity}"`, 404);
  try {
    const rows = def.list
      ? await def.list()
      : await db.select().from(def.table as any).orderBy(desc((def.table as any).createdAt));
    return Response.json(rows);
  } catch (e) {
    console.error(`GET /api/${entity}`, e);
    return jsonError("Failed to load records", 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { entity } = await ctx.params;
  const def = REGISTRY[entity];
  if (!def) return jsonError(`Unknown entity "${entity}"`, 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const parsed = def.schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first ? `${first.path.join(".")}: ${first.message}` : "Validation failed");
  }
  try {
    const t = def.table as any;
    const rows = (await db.insert(t).values(parsed.data).returning()) as unknown as any[];
    return Response.json(rows[0] ?? null, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return jsonError("Duplicate value — that record already exists.", 409);
    if (code === "23503") return jsonError("Referenced record does not exist.", 409);
    console.error(`POST /api/${entity}`, e);
    return jsonError("Failed to create record", 500);
  }
}
