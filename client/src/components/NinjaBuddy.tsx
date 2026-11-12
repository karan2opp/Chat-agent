// The little ninja that sits on the message box and shows what the assistant is doing.

export type NinjaMood = "idle" | "listening" | "thinking" | "typing" | "oops";

// What the speech bubble says.
const LABELS: Record<Exclude<NinjaMood, "idle">, { text: string; dots: boolean }> = {
  listening: { text: "Listening", dots: true },
  thinking: { text: "Thinking", dots: true },
  typing: { text: "Typing", dots: true },
  oops: { text: "Oops, that failed", dots: false },
};

export default function NinjaBuddy({ mood }: { mood: NinjaMood }) {
  const label = mood === "idle" ? null : LABELS[mood];

  return (
    <div className="ninja" data-mood={mood}>
      <svg className="ninja-art" viewBox="0 0 80 72" aria-hidden="true">
        <defs>
          <clipPath id="ninja-head-clip">
            <circle cx="40" cy="30" r="22" />
          </clipPath>
        </defs>

        {/* Headband tails, behind the head so they flutter out from the knot. */}
        <g className="ninja-tails">
          <path d="M60 21 q9 -3 15 2 q-7 1 -14 2 z" />
          <path d="M60 23 q8 3 12 10 q-6 -4 -12 -6 z" />
        </g>

        <g className="ninja-body">
          <rect x="26" y="45" width="28" height="20" rx="10" className="ninja-suit" />
          <rect x="26" y="55" width="28" height="4" className="ninja-belt" />
          <ellipse cx="25.5" cy="54" rx="4" ry="6.5" className="ninja-suit ninja-arm ninja-arm-left" />
          <ellipse cx="54.5" cy="54" rx="4" ry="6.5" className="ninja-suit ninja-arm ninja-arm-right" />
        </g>

        {/* Sitting cross-legged on the edge of the message box: knees out, feet tucked in. */}
        <g className="ninja-legs">
          <ellipse cx="27" cy="64.5" rx="10.5" ry="5" className="ninja-suit" />
          <ellipse cx="53" cy="64.5" rx="10.5" ry="5" className="ninja-suit" />
          <ellipse cx="36" cy="66.5" rx="5.6" ry="3.2" className="ninja-foot ninja-foot-left" />
          <ellipse cx="44" cy="66.5" rx="5.6" ry="3.2" className="ninja-foot ninja-foot-right" />
        </g>

        <g className="ninja-head">
          <circle cx="40" cy="30" r="22" className="ninja-suit" />
          <rect x="14" y="16" width="52" height="6" clipPath="url(#ninja-head-clip)" className="ninja-band" />
          <circle cx="61.5" cy="21.5" r="2.6" className="ninja-band" />
          <rect x="34.5" y="15.5" width="11" height="8" rx="1.8" className="ninja-plate" />
          <circle cx="40" cy="19.5" r="2" className="ninja-plate-mark" />

          <ellipse cx="40" cy="33" rx="16.5" ry="8.5" className="ninja-face" />
          <ellipse cx="29" cy="37" rx="3" ry="1.6" className="ninja-blush" />
          <ellipse cx="51" cy="37" rx="3" ry="1.6" className="ninja-blush" />

          {mood === "oops" ? (
            <g className="ninja-eyes-oops">
              <path d="M31 30.5 l5 2.2 l-5 2.2" />
              <path d="M49 30.5 l-5 2.2 l5 2.2" />
            </g>
          ) : (
            <g className="ninja-eyes">
              <ellipse cx="34" cy="33" rx="2.7" ry="3.3" />
              <ellipse cx="46" cy="33" rx="2.7" ry="3.3" />
              <circle cx="35" cy="31.6" r="0.95" className="ninja-shine" />
              <circle cx="47" cy="31.6" r="0.95" className="ninja-shine" />
            </g>
          )}
          {mood === "oops" && <path className="ninja-sweat" d="M58 26 q2.5 4 0 5.5 q-2.5 -1.5 0 -5.5 z" />}
        </g>
      </svg>

      {/* Announced to screen readers too, so the status is not only visual. */}
      <div className="ninja-status" role="status" aria-live="polite">
        {label && (
          <div className="ninja-bubble" key={mood}>
            <span className="ninja-bubble-text">
              {label.text}
              {label.dots && (
                <span className="ninja-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// A four-pointed throwing star, used as the brand mark and on the send button.
export function Shuriken({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg className={`shuriken${spinning ? " spinning" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z" />
      <circle cx="12" cy="12" r="2.2" className="shuriken-hole" />
    </svg>
  );
}
