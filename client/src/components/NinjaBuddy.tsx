import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

// The little ninja that sits on the message box and shows what the assistant is doing.

export type NinjaMood = "idle" | "listening" | "thinking" | "typing" | "oops";

// What the speech bubble says.
const LABELS: Record<Exclude<NinjaMood, "idle">, { text: string; dots: boolean }> = {
  listening: { text: "Listening", dots: true },
  thinking: { text: "Thinking", dots: true },
  typing: { text: "Typing", dots: true },
  oops: { text: "Oops, that failed", dots: false },
};

// Something the ninja does on his own while nobody is typing. Walking and vanishing take him to
// the other end of the message box, where he stays.
type Trick = "walk" | "yawn" | "throw" | "vanish";
type Act = "none" | "walk" | "yawn" | "throw" | "vanish-out" | "vanish-in" | "sleep";
type Side = "left" | "right";

const TRICKS: Trick[] = ["walk", "yawn", "throw", "vanish"];
const TRAVELS = new Set<Trick>(["walk", "vanish"]);

// Animation lengths; they must match the CSS.
const YAWN_MS = 2400;
const THROW_MS = 1400;
const VANISH_OUT_MS = 800;
const VANISH_IN_MS = 900;
// Walking takes as long as the distance needs.
const WALK_PX_PER_SECOND = 70;
// Too narrow a box (a small phone) and he stays put: only the tricks done on the spot.
const MIN_TRAVEL_PX = 60;

// Tricks are kept rare so they stay fun rather than distracting.
const FIRST_TRICK_MS = [12_000, 20_000];
const BETWEEN_TRICKS_MS = [20_000, 40_000];
// After this long with nothing happening he dozes off, until someone starts typing.
const SLEEP_AFTER_MS = 90_000;

// The drawing's width in pixels, and the gap he keeps from the ends of the message box.
const ART_WIDTH = 76;
const EDGE_GAP = 10;

const between = ([min, max]: number[]) => min + Math.random() * (max - min);
const other = (side: Side): Side => (side === "left" ? "right" : "left");

// Where the two ends of the message box are, kept up to date when the window resizes.
function useEdges(ref: RefObject<HTMLDivElement>) {
  const [edges, setEdges] = useState<{ left: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    const input = box?.querySelector<HTMLElement>(".composer-box");
    if (!box || !input) return;
    const measure = () => {
      const left = input.offsetLeft + EDGE_GAP;
      setEdges({ left, right: Math.max(left, input.offsetLeft + input.offsetWidth - ART_WIDTH - EDGE_GAP) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref]);

  return edges;
}

// Decides what the ninja is doing and which end of the box he is at. Anything other than idle
// (the user typing, a reply coming in) stops a trick done on the spot at once. A trip to the other
// end is allowed to finish, so he never stops halfway or stays invisible.
function useNinjaLife(idle: boolean, distance: () => number) {
  const [act, setAct] = useState<Act>("none");
  const [side, setSide] = useState<Side>("left");
  // How long the current walk to the other end takes.
  const [walkMs, setWalkMs] = useState(0);
  const sideRef = useRef<Side>("left");
  const travelling = useRef(false);
  const tripTimers = useRef<number[]>([]);

  useEffect(() => () => tripTimers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!travelling.current) setAct("none");
    if (!idle) return;

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    // Timers that finish a trip; they are not cancelled when the user starts typing.
    const finish = (ms: number, fn: () => void) => tripTimers.current.push(window.setTimeout(fn, ms));
    const moveTo = (to: Side) => {
      sideRef.current = to;
      setSide(to);
    };
    const quietSince = Date.now();
    let last: Trick | undefined;

    // For people who asked their system for less motion: no tricks, he only falls asleep.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      later(SLEEP_AFTER_MS, () => setAct("sleep"));
      return () => timers.forEach(clearTimeout);
    }

    // Starts a trick and returns how long it lasts.
    const perform = (trick: Trick): number => {
      if (trick === "yawn" || trick === "throw") {
        const ms = trick === "yawn" ? YAWN_MS : THROW_MS;
        setAct(trick);
        later(ms, () => setAct("none"));
        return ms;
      }

      const to = other(sideRef.current);
      const dist = distance();
      travelling.current = true;
      const arrive = (ms: number) =>
        finish(ms, () => {
          travelling.current = false;
          setAct("none");
        });

      if (trick === "vanish") {
        setAct("vanish-out");
        finish(VANISH_OUT_MS, () => {
          moveTo(to);
          setAct("vanish-in");
        });
        arrive(VANISH_OUT_MS + VANISH_IN_MS);
        return VANISH_OUT_MS + VANISH_IN_MS;
      }

      const ms = Math.round((dist / WALK_PX_PER_SECOND) * 1000);
      setWalkMs(ms);
      setAct("walk");
      moveTo(to);
      arrive(ms);
      return ms;
    };

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
        const roomToTravel = distance() >= MIN_TRAVEL_PX;
        const options = TRICKS.filter((t) => t !== last && (roomToTravel || !TRAVELS.has(t)));
        const trick = options[Math.floor(Math.random() * options.length)];
        last = trick;
        later(perform(trick), () => next(between(BETWEEN_TRICKS_MS)));
      });

    next(between(FIRST_TRICK_MS));
    return () => timers.forEach(clearTimeout);
    // `distance` reads the latest measurement through a ref, so it does not restart the schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle]);

  return { act, side, walkMs };
}

// Smoke puffs of the vanishing trick: where each starts, how far it drifts, how big and how grey.
const PUFFS = [
  { cx: 40, cy: 44, r: 13, dx: 0, dy: -4, shade: "#d4d7e1", delay: 0 },
  { cx: 28, cy: 48, r: 11, dx: -14, dy: 2, shade: "#bfc3d0", delay: 40 },
  { cx: 52, cy: 48, r: 11, dx: 14, dy: 2, shade: "#bfc3d0", delay: 40 },
  { cx: 33, cy: 34, r: 10, dx: -10, dy: -12, shade: "#e2e4ec", delay: 80 },
  { cx: 47, cy: 34, r: 10, dx: 10, dy: -12, shade: "#e2e4ec", delay: 80 },
  { cx: 40, cy: 60, r: 10, dx: 0, dy: 6, shade: "#aeb2c0", delay: 60 },
  { cx: 40, cy: 26, r: 9, dx: 0, dy: -16, shade: "#eceef4", delay: 120 },
];

// Leaves that scatter as he vanishes and swirl in as he appears.
const LEAVES = [
  { lx: -26, ly: -18, lr: -220, delay: 60 },
  { lx: 24, ly: -22, lr: 260, delay: 100 },
  { lx: -20, ly: 14, lr: 180, delay: 140 },
  { lx: 28, ly: 10, lr: -200, delay: 80 },
];

const vars = (v: Record<string, string>) => v as CSSProperties;

// The ninja seen from the side, facing right, for walking (flipped to walk left). The far arm and
// leg are drawn behind the body in a darker shade; arms and legs swing in opposite pairs.
function SideView() {
  return (
    <g className="ninja-figure ninja-side">
      <g className="ninja-tails">
        <path d="M20 21 q-9 -3 -15 2 q7 1 14 2 z" />
        <path d="M20 23 q-8 3 -12 10 q6 -4 12 -6 z" />
      </g>

      <ellipse cx="40.5" cy="55" rx="3.2" ry="7" className="ninja-far ninja-arm-far" />
      <g className="ninja-far ninja-leg-far">
        <rect x="37.2" y="58" width="6.5" height="11" rx="3.2" />
        <ellipse cx="42" cy="69.5" rx="4.6" ry="2.4" />
      </g>

      <rect x="32.5" y="45" width="16" height="17" rx="8" className="ninja-suit" />
      <rect x="32.5" y="54" width="16" height="3.5" className="ninja-belt" />

      <g className="ninja-leg-near">
        <rect x="37.2" y="58" width="6.5" height="11" rx="3.2" className="ninja-suit" />
        <ellipse cx="42" cy="69.5" rx="4.6" ry="2.4" className="ninja-foot" />
      </g>

      <g className="ninja-head">
        <circle cx="40" cy="30" r="22" className="ninja-suit" />
        <rect x="14" y="16" width="52" height="6" clipPath="url(#ninja-head-clip)" className="ninja-band" />
        <circle cx="18.5" cy="21.5" r="2.6" className="ninja-band" />
        <rect x="48" y="15.5" width="9" height="8" rx="1.8" className="ninja-plate" />
        <circle cx="52.5" cy="19.5" r="1.8" className="ninja-plate-mark" />
        <ellipse cx="52" cy="33" rx="12" ry="8.5" clipPath="url(#ninja-head-clip)" className="ninja-face" />
        <ellipse cx="57" cy="37.5" rx="2.6" ry="1.4" className="ninja-blush" />
        <g className="ninja-eyes">
          <ellipse cx="54.5" cy="33" rx="2.6" ry="3.2" />
          <circle cx="55.4" cy="31.7" r="0.9" className="ninja-shine" />
        </g>
      </g>

      <ellipse cx="40.5" cy="55" rx="3.4" ry="7" className="ninja-suit ninja-arm-near" />
    </g>
  );
}

export default function NinjaBuddy({ mood }: { mood: NinjaMood }) {
  const ref = useRef<HTMLDivElement>(null);
  const edges = useEdges(ref);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const { act, side, walkMs } = useNinjaLife(mood === "idle", () =>
    edgesRef.current ? edgesRef.current.right - edgesRef.current.left : 0,
  );

  const label = mood === "idle" ? null : LABELS[mood];
  const eyesClosed = act === "sleep" || act === "yawn";
  const vanishing = act === "vanish-out" || act === "vanish-in";

  // Position along the box. Walking moves at an even pace; appearing at the other end after
  // vanishing is instant.
  const x = edges ? edges[side] : 30;
  const glide = act === "walk" ? `transform ${walkMs}ms linear` : "none";

  return (
    <div
      ref={ref}
      className="ninja"
      data-mood={mood}
      data-act={act}
      data-side={side}
      style={{
        transform: `translateX(${x}px)`,
        transition: glide,
      }}
    >
      {/* Flips to face the way he walks. */}
      <div className="ninja-mover">
        <svg className="ninja-art" viewBox="0 0 80 72" aria-hidden="true">
          <defs>
            <clipPath id="ninja-head-clip">
              <circle cx="40" cy="30" r="22" />
            </clipPath>
            {/* Softens the smoke puffs so they read as one cloud. */}
            <filter id="ninja-smoke-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </defs>

          {act === "walk" ? (
            <SideView />
          ) : (
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
          )}

          {act === "throw" && (
            // Thrown with the hand nearer the middle of the box, so it never flies at the send button.
            <g transform={side === "right" ? "translate(-36 0)" : undefined}>
              <path
                className="ninja-thrown"
                d="M58 46 l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4 l3.6 -1.4 z"
              />
            </g>
          )}

          {vanishing && (
            // Keyed by phase so the puff plays again where he reappears.
            <g className="ninja-smoke" key={act}>
              <g filter="url(#ninja-smoke-blur)">
                {PUFFS.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.cx}
                    cy={p.cy}
                    r={p.r}
                    fill={p.shade}
                    style={vars({ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--delay": `${p.delay}ms` })}
                  />
                ))}
              </g>
              {LEAVES.map((l, i) => (
                <g key={i} transform="translate(38 44)">
                  <path
                    className="ninja-leaf"
                    d="M0 0 q4 -4.5 9 0 q-4 4.5 -9 0 z"
                    style={vars({ "--lx": `${l.lx}px`, "--ly": `${l.ly}px`, "--lr": `${l.lr}deg`, "--delay": `${l.delay}ms` })}
                  />
                </g>
              ))}
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
