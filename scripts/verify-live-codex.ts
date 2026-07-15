import { applyHumanConfirmations, recordSourceDeskReview } from "../src/lib/human-review";
import { buildExhibit } from "../src/lib/openai-pipeline";
import { nightMarketExhibit } from "../src/lib/sample-exhibits";

async function main() {
  const approvedManifest = recordSourceDeskReview(
    applyHumanConfirmations(
      nightMarketExhibit,
      new Set(["claim-bicycle-owner"]),
    ),
    new Set(),
  );

  const result = await buildExhibit(
    { manifest: approvedManifest, live: true },
    {
      OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5.6",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      CODEX_MODEL: process.env.CODEX_MODEL,
      KEEPSCAPE_ENABLE_CODEX: "1",
    },
  );

  if (result.mode !== "live") {
    throw new Error(`Live Codex verification did not complete: ${result.reason ?? "unknown fallback"}`);
  }

  const codexAgents = result.manifest.buildEvidence.agents.filter((agent) =>
    agent.name.startsWith("Codex"),
  );
  const codexTests = result.manifest.buildEvidence.tests.filter((test) =>
    ["Opaque Codex boundary", "Codex interaction compile", "Hotspot allowlist", "Spatial plan allowlist", "Post-build schema"].includes(test.name),
  );
  if (!result.spatialPlan) throw new Error("Live Codex verification returned no spatial plan receipt.");

  console.log(
    JSON.stringify(
      {
        receiptVersion: "1.2",
        capturedAt: new Date().toISOString(),
        product: "Keepscape",
        codexSdkVersion: "0.144.4",
        mode: result.mode,
        model: result.manifest.buildEvidence.model,
        trace: result.trace,
        interaction: result.manifest.scenes[0].interaction,
        spatialPlan: result.spatialPlan,
        codexAgents,
        codexTests,
        note: "Codex received only opaque enums/tokens and returned no prose. No family media, credentials, visitor prompts, original IDs, or temporary workspace paths are retained.",
      },
      null,
      2,
    ),
  );
}

void main();
