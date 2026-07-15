const JSON_MEDIA_TYPE = "application/json";

function rejection(error: string, status: number): Response {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/** Blocks CORS-simple and cross-site browser mutations before they can spend
 * model credits or start a local Codex run. JSON requests also require a CORS
 * preflight, so browsers cannot use an untrusted Origin without server opt-in. */
export function rejectUnsafeMutation(request: Request): Response | null {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== JSON_MEDIA_TYPE) {
    return rejection("The request content type must be application/json.", 415);
  }

  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return rejection("Cross-site mutation requests are not allowed.", 403);
  }

  return null;
}
