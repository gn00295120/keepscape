import { blueprintRequestSchema, createBlueprint } from "@/lib/openai-pipeline";
import { rejectUnsafeMutation } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY_BYTES = 25_000_000;

function invalidRequest(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return Response.json(
    {
      ok: false,
      error: "The source packet is invalid.",
      issues: issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
    },
    { status: 400 },
  );
}

export async function GET() {
  return Response.json(
    { ok: true, liveAnalysisAvailable: Boolean(process.env.OPENAI_API_KEY) },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "The source packet is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "The request body must be valid JSON." }, { status: 400 });
  }

  const parsed = blueprintRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);

  const result = await createBlueprint(parsed.data);
  return Response.json(
    { ok: true, ...result },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
