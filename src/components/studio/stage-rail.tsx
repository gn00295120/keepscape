import { Check } from "lucide-react";

export type StudioStage = "choose" | "review" | "build" | "play";

const stages: Array<{ id: StudioStage; number: string; label: string }> = [
  { id: "choose", number: "01", label: "Source" },
  { id: "review", number: "02", label: "Ground" },
  { id: "build", number: "03", label: "Build" },
  { id: "play", number: "04", label: "Enter" },
];

const stageIndex = (stage: StudioStage) => stages.findIndex((item) => item.id === stage);

export function StageRail({ stage }: { stage: StudioStage }) {
  const currentIndex = stageIndex(stage);

  return (
    <nav className="stage-rail" aria-label="Exhibit creation progress">
      <ol>
        {stages.map((item, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;

          return (
            <li
              className={isCurrent ? "is-current" : isComplete ? "is-complete" : undefined}
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="stage-rail__number" aria-hidden="true">
                {isComplete ? <Check size={13} strokeWidth={2.6} /> : item.number}
              </span>
              <span>{item.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
