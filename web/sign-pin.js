// The selected place's marker: the logo's door sign with a pin tail, filled
// with the pin's own bucket colour, carrying a pictogram that says who the
// table is for. Pure string builders, no DOM — app.js owns the one marker
// that shows the result, so this file stays testable under node --test.
//
// Only ever one of these on the map. The ~26k places stay WebGL circles: the
// pictogram needs about 30 px to read, twice a circle's footprint, and the
// play halo and the key glyph already live around and inside the circles.

// Everything is drawn in a 100-unit box. The sign, the pictogram's place
// inside it and the figures are the logo's own geometry (docs/logo/), so the
// marker and the app icon are the same object at two sizes.
const SIGN = "M24 3H76A18 18 0 0 1 94 21V67A18 18 0 0 1 76 85H60.5L52.3 97A2.7 2.7 0 0 1 47.7 97L39.5 85H24A18 18 0 0 1 6 67V21A18 18 0 0 1 24 3Z";
const GLYPH = "translate(6.62 5.84) scale(.72)";

// The white outline is a 5-unit stroke painted under the fill, so 2.5 units
// show. The box is cut 1 unit below the outlined tip (y = 100): anchored
// "bottom", the tip lands on the coordinate instead of floating above it.
export const SIGN_PIN_VIEWBOX = "-4 -4 108 105";
export const SIGN_PIN_ASPECT = 105 / 108;

const line = (d, w) => `<path d="${d}" stroke-width="${w}"/>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

// The baby on the table, one leg up — shared by every kind.
const BABY_LINES = line("M62 62H79", 12) + line("M61 60L52 50", 9) + line("M52 74.5H100", 8);
const BABY_DOTS = dot(95, 60.5, 7.5);

const HEAD = dot(57, 18.5, 9.5);
const ARM = line("M47 36L70 49", 9);

const FIGURES = {
  // The logo's figure: leg and leaning torso in one stroke.
  dad: { lines: line("M24 90V53L45 33", 14) + ARM, dots: HEAD, shapes: "" },
  // One dress silhouette rather than a skirt bolted onto the dad's torso:
  // the back follows the lean to the hip and then hangs, the front follows
  // the body to a waist and then flares. Head and arm are the dad's.
  woman: {
    lines: line("M19 76V91M31 76V91", 6.5) + ARM,
    dots: HEAD + dot(45, 33, 7),
    shapes: `<path d="M41.9 29.7L20.9 49.7L10.5 72.5H38.5L33.5 52L48.1 36.3Z" stroke-width="5" stroke-linejoin="round"/>`,
  },
  // Nobody has said which room: a question mark stands where the parent would.
  ask: {
    lines: line("M13 32A15.5 15.5 0 1 1 37 44.5C31.5 48.5 28.5 52 28.5 59V62", 11),
    dots: dot(28.5, 81, 7.5), shapes: "",
  },
};
// The mama reading of "unknown": probably her room, so she is at the table
// and the question mark shrinks to a footnote above the baby.
FIGURES["woman-ask"] = {
  lines: FIGURES.woman.lines + line("M80.5 14.5A8.5 8.5 0 1 1 93.5 21.5C90.5 24 88.5 26 88.5 30V31.5", 7),
  dots: FIGURES.woman.dots + dot(88.5, 42, 4.6),
  shapes: FIGURES.woman.shapes,
};

export const SIGN_PIN_KINDS = Object.keys(FIGURES);

// Pictogram by fact, colour by reading. The status says which room the table
// is in, and that does not change when the reader flips papa/mama — only the
// colour does. Unknown is the one status whose picture follows the reading.
export function signPinKind(status, mode) {
  if (status === "accessible") return "dad";
  if (status === "female_only") return "woman";
  return mode === "mama" ? "woman-ask" : "ask";
}

// White everywhere except on the amber "maybe", where white drops to 1.9:1.
export function signPinInk(bucket) {
  return bucket === "maybe" ? "#1c2b26" : "#ffffff";
}

export function signPinSvg(kind, color, ink = "#ffffff") {
  const f = FIGURES[kind] || FIGURES.ask;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SIGN_PIN_VIEWBOX}" aria-hidden="true">`
    + `<path d="${SIGN}" fill="${color}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>`
    + `<g transform="${GLYPH}">`
    + `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">${f.lines}${BABY_LINES}</g>`
    + `<g fill="${ink}" stroke="${ink}" stroke-width="0">${f.shapes}${f.dots}${BABY_DOTS}</g>`
    + `</g></svg>`;
}
