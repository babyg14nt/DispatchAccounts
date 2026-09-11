/**
 * Settlements collection route.
 *   GET  /api/settlements          list all (with itemized lines + driver name)
 *   POST /api/settlements          generate a new settlement for a driver+period
 */
import { z } from "zod";
import { generateSettlement, listSettlements, SettlementError } from "@/lib/settlements";

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const generateSchema = z.object({
  driverId: z.string().min(1, "Select a driver"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
});

export async function GET() {
  try {
    return Response.json(await listSettlements());
  } catch (e) {
    console.error("GET /api/settlements", e);
    return jsonError("Failed to load settlements", 500);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first ? first.message : "Validation failed");
  }
  const { driverId, periodStart, periodEnd } = parsed.data;
  if (periodEnd < periodStart) return jsonError("Period end must be after period start");
  try {
    const settlement = await generateSettlement(driverId, periodStart, periodEnd);
    return Response.json(settlement, { status: 201 });
  } catch (e) {
    if (e instanceof SettlementError) return jsonError(e.message);
    console.error("POST /api/settlements", e);
    return jsonError("Failed to generate settlement", 500);
  }
}
