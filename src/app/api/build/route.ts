import { buildExhibit, buildRequestSchema } from "@/lib/openai-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY_BYTES = 25_000_000;

function invalidRequest(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return Response.json(
    {
      ok: false,
      error: "The exhibit manifest is invalid.",
      issues: issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "The exhibit manifest is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "The request body must be valid JSON." }, { status: 400 });
  }

  const parsed = buildRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);

  const result = await buildExhibit(parsed.data);
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
