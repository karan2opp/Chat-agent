import { useEffect, useState } from "react";

// The little ninja that sits on the message box and shows what the assistant is doing.

export type NinjaMood = "idle" | "listening" | "thinking" | "typing" | "oops";

// What the speech bubble says.
const LABELS: Record<Exclude<NinjaMood, "idle">, { text: string; dots: boolean }> = {
  listening: { text: "Listening", dots: true },
  thinking: { text: "Thinking", dots: true },
  typing: { text: "Typing", dots: true },
  oops: { text: "Oops, that failed", dots: false },
};

// Something the ninja does on his own while nobody is typing.
type Trick = "walk" | "yawn" | "cartwheel" | "throw" | "vanish";
type Act = "none" | Trick | "sleep";

// How long each trick's animation runs; must match the CSS.
const TRICK_MS: Record<Trick, number> = { walk: 5200, yawn: 2400, cartwheel: 1800, throw: 1400, vanish: 1800 };
const TRICKS = Object.keys(TRICK_MS) as Trick[];

// Tricks are kept rare so they stay fun rather than distracting.
const FIRST_TRICK_MS = [12_000, 20_000];
const BETWEEN_TRICKS_MS = [20_000, 40_000];
// After this long with nothing happening he dozes off, until someone starts typing.
const SLEEP_AFTER_MS = 90_000;

const between = ([min, max]: number[]) => min + Math.random() * (max - min);

// Picks what the ninja is doing right now. Anything other than idle (the user typing, a reply
// coming in) cancels it at once and starts the quiet time over.
function useIdleAct(idle: boolean): Act {
  const [act, setAct] = useState<Act>("none");

  useEffect(() => {
    setAct("none");
    if (!idle) return;

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const quietSince = Date.now();
    let last: Trick | undefined;

    // For people who asked their system for less motion: no tricks, he only falls asleep.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      later(SLEEP_AFTER_MS, () => setAct("sleep"));
      return () => timers.forEach(clearTimeout);
    }

    const next = (wait: number) =>
      later(wait, () => {
        if (Date.now() - quietSince >= SLEEP_AFTER_MS) {
          setAct("sleep");
          return;
        }
        // Nobody is watching a hidden tab; try again later.
        if (document.hidden) {
          next(between(BETWEEN_TRICKS_MS));
          return;
        }
        const options = TRICKS.filter((t) => t !== last);
        const trick = options[Math.floor(Math.random() * options.length)];
        last = trick;
        setAct(trick);
        later(TRICK_MS[trick], () => {
          setAct("none");
          next(between(BETWEEN_TRICKS_MS));
        });
      });

    next(between(FIRST_TRICK_MS));
    return () => timers.forEach(clearTimeout);
  }, [idle]);

  return act;
}

export default function NinjaBuddy({ mood }: { mood: NinjaMood }) {
  const act = useIdleAct(mood === "idle");
  const label = mood === "idle" ? null : LABELS[mood];
  const standing = act === "walk" || act === "cartwheel";
  const eyesClosed = act === "sleep" || act === "yawn";

  return (
    <div className="ninja" data-mood={mood} data-act={act}>
      {/* Moves sideways for walking and cartwheels; the drawing inside flips, bobs and spins. */}
      <div className="ninja-mover">
        <svg className="ninja-art" viewBox="0 0 80 72" aria-hidden="true">
          <defs>
            <clipPath id="ninja-head-clip">
              <circle cx="40" cy="30" r="22" />
            </clipPath>
          </defs>

          <g className="ninja-figure">
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

            {standing ? (
              // On his feet, for walking and cartwheels.
              <g className="ninja-legs-standing">
                <g className="ninja-step ninja-step-left">
                  <rect x="31.5" y="62" width="6.5" height="7" rx="3.2" className="ninja-suit" />
                  <ellipse cx="34" cy="69.5" rx="4.4" ry="2.4" className="ninja-foot" />
                </g>
                <g className="ninja-step ninja-step-right">
                  <rect x="42" y="62" width="6.5" height="7" rx="3.2" className="ninja-suit" />
                  <ellipse cx="46" cy="69.5" rx="4.4" ry="2.4" className="ninja-foot" />
                </g>
              </g>
            ) : (
              // Sitting cross-legged on the edge of the message box: knees out, feet tucked in.
              <g className="ninja-legs">
                <ellipse cx="27" cy="64.5" rx="10.5" ry="5" className="ninja-suit" />
                <ellipse cx="53" cy="64.5" rx="10.5" ry="5" className="ninja-suit" />
                <ellipse cx="36" cy="66.5" rx="5.6" ry="3.2" className="ninja-foot ninja-foot-left" />
                <ellipse cx="44" cy="66.5" rx="5.6" ry="3.2" className="ninja-foot ninja-foot-right" />
              </g>
            )}

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
              ) : eyesClosed ? (
                <g className="ninja-eyes-closed">
                  <path d="M31 33 q3 2.4 6 0" />
                  <path d="M43 33 q3 2.4 6 0" />
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
              {act === "yawn" && <ellipse cx="40" cy="44.5" rx="3.2" ry="3.6" className="ninja-mouth" />}
            </g>
          </g>

          {act === "throw" && (
            <g className="ninja-thrown">
              <path d="M58 46 l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4 l3.6 -1.4 z" />
            </g>
          )}

          {act === "vanish" && (
            <g className="ninja-smoke">
              <circle cx="30" cy="44" r="14" />
              <circle cx="50" cy="40" r="15" />
              <circle cx="40" cy="56" r="14" />
              <circle cx="40" cy="28" r="13" />
            </g>
          )}

          {act === "sleep" && (
            <g className="ninja-zzz">
              <text x="60" y="14">z</text>
              <text x="66" y="7">z</text>
              <text x="72" y="0">z</text>
            </g>
          )}
        </svg>
      </div>

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
