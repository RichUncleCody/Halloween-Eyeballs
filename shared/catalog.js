// Shared between the server (director) and the browser (renderer).
// Everything the show can do is listed here so the server can schedule it,
// the API can trigger it, and the control panel can show a button for it.

export const EYES = ['L', 'C', 'R'];

// Horizontal position of each monitor, in "monitor widths" from the centre.
export const EYE_INDEX = { L: -1, C: 0, R: 1 };

// How far ahead of "now" the server schedules events so every screen
// receives them before they're due and can start them at the same instant.
export const LEAD_MS = 350;

// ---------------------------------------------------------------------------
// Big "special" events. Roughly one every five minutes (configurable).
//   dur      seconds the effect runs
//   weight   relative chance of being picked by the auto director
//   noBlink  ambient blinking is suppressed while it runs (the effect blinks itself)
//   tags     used by the control panel for grouping / filtering
// ---------------------------------------------------------------------------
export const SPECIALS = [
  { id: 'demon',     title: 'Demon Awakens',        emoji: '😈', dur: 24, weight: 1.2, noBlink: true,  tags: ['scary'] },
  { id: 'hellfire',  title: 'Hellfire',             emoji: '🔥', dur: 26, weight: 1.2,                 tags: ['fire'] },
  { id: 'soulfire',  title: 'Soulfire',             emoji: '💙', dur: 24, weight: 1.0,                 tags: ['fire'] },
  { id: 'witchbrew', title: "Witch's Brew",         emoji: '🧪', dur: 24, weight: 1.0,                 tags: ['fire'] },
  { id: 'cat',       title: 'Black Cat',            emoji: '🐈‍⬛', dur: 22, weight: 1.0, noBlink: true,  tags: ['creature'] },
  { id: 'possessed', title: 'Possessed',            emoji: '👁️', dur: 15, weight: 1.0, noBlink: true,  tags: ['scary'] },
  { id: 'hypnosis',  title: 'Hypnosis',             emoji: '🌀', dur: 20, weight: 1.0, noBlink: true,  tags: ['trippy'] },
  { id: 'void',      title: 'The Void',             emoji: '⚫', dur: 18, weight: 1.0, noBlink: true,  tags: ['scary'] },
  { id: 'cosmic',    title: 'Cosmic Eye',           emoji: '🌌', dur: 26, weight: 1.0,                 tags: ['trippy'] },
  { id: 'eclipse',   title: 'Eclipse',              emoji: '🌑', dur: 18, weight: 0.9, noBlink: true,  tags: ['trippy'] },
  { id: 'undead',    title: 'Undead',               emoji: '🧟', dur: 22, weight: 1.0, noBlink: true,  tags: ['creature'] },
  { id: 'frozen',    title: 'Frozen Solid',         emoji: '🧊', dur: 22, weight: 0.9, noBlink: true,  tags: ['weather'] },
  { id: 'storm',     title: 'Thunderstorm',         emoji: '⛈️', dur: 18, weight: 1.0,                 tags: ['weather'] },
  { id: 'bats',      title: 'Bat Swarm',            emoji: '🦇', dur: 14, weight: 1.2,                 tags: ['creature', 'across'] },
  { id: 'spider',    title: 'Spider Drop',          emoji: '🕷️', dur: 22, weight: 1.0,                 tags: ['creature', 'across'] },
  { id: 'ghost',     title: 'Ghost Passing',        emoji: '👻', dur: 17, weight: 1.1,                 tags: ['across'] },
  { id: 'manyeyes',  title: 'Many Eyes',            emoji: '🫣', dur: 18, weight: 1.0, noBlink: true,  tags: ['scary'] },
  { id: 'message',   title: 'Writing on the Wall',  emoji: '🩸', dur: 13, weight: 1.1, noBlink: true,  tags: ['across'] },
  { id: 'glitch',    title: 'Signal Lost',          emoji: '📺', dur: 10, weight: 0.9,                 tags: ['trippy'] },
  { id: 'googly',    title: 'Googly Eyes',          emoji: '🤪', dur: 16, weight: 0.8, noBlink: true,  tags: ['silly'] },
  { id: 'pumpkin',   title: "Jack-o'-Lantern",      emoji: '🎃', dur: 17, weight: 1.1, noBlink: true,  tags: ['across'] },
  { id: 'skull',     title: 'Skull',                emoji: '💀', dur: 16, weight: 1.0, noBlink: true,  tags: ['across', 'scary'] },
  { id: 'dizzy',     title: 'Dizzy',                emoji: '😵‍💫', dur: 11, weight: 0.8, noBlink: true,  tags: ['silly'] },
  { id: 'domino',    title: 'Pass the Glance',      emoji: '👀', dur: 13, weight: 0.9,                 tags: ['silly', 'across'] },
  { id: 'stare',     title: 'The Stare',            emoji: '🫵', dur: 15, weight: 1.0, noBlink: true,  tags: ['scary'] },
  { id: 'weeping',   title: 'Weeping Blood',        emoji: '🩸', dur: 20, weight: 0.9,                 tags: ['scary'] },
  { id: 'overload',  title: 'Electric Overload',    emoji: '⚡', dur: 13, weight: 0.9, noBlink: true,  tags: ['trippy', 'across'] },
  { id: 'fever',     title: 'Fever Dream',          emoji: '🌈', dur: 18, weight: 0.8,                 tags: ['trippy'] },
  { id: 'drowsy',    title: 'Drowsy',               emoji: '😴', dur: 16, weight: 0.9, noBlink: true,  tags: ['silly'] },
  { id: 'darkness',  title: 'Something in the Dark', emoji: '🌚', dur: 16, weight: 1.0, noBlink: true, tags: ['scary', 'across'] },
  { id: 'tentacles', title: 'From the Deep',        emoji: '🐙', dur: 20, weight: 0.9,                 tags: ['creature'] },
  { id: 'candle',    title: 'Candlelight',          emoji: '🕯️', dur: 26, weight: 0.8,                 tags: ['calm'] },
  { id: 'werewolf',  title: 'Full Moon',            emoji: '🐺', dur: 22, weight: 1.0,                 tags: ['creature', 'across'] },
  { id: 'fog',       title: 'Fog Rolls In',         emoji: '🌫️', dur: 26, weight: 0.9,                 tags: ['weather', 'across'] },
];

// Phrases for "Writing on the Wall": one word per monitor (L, C, R).
export const MESSAGES = [
  { words: ['I', 'SEE', 'YOU'], weight: 3 },
  { words: ['TRICK', 'OR', 'TREAT'], weight: 2 },
  { words: ['WE', 'ARE', 'WATCHING'], weight: 2 },
  { words: ["DON'T", 'LOOK', 'BEHIND'], weight: 2 },
  { words: ['HAPPY', 'HALLOW', 'EEN'], weight: 2 },
  { words: ['BOO', 'BOO', 'BOO'], weight: 1 },
  { words: ['GET', 'OUT', 'NOW'], weight: 1 },
  { words: ['NEVER', 'STOP', 'EATING'], weight: 1 },
  { words: ['EAT', 'YOUR', 'VEGGIES'], weight: 1 },
  { words: ['SAVE', 'ME', 'DESSERT'], weight: 1 },
  { words: ['MORE', 'WINE', 'PLEASE'], weight: 1 },
  { words: ['ONE', 'OF', 'US'], weight: 1 },
  { words: ['IT', 'IS', 'HERE'], weight: 1 },
  { words: ['NO', 'ONE', 'LEAVES'], weight: 1 },
];

// ---------------------------------------------------------------------------
// Small "quirks": short bits of personality, every ~45 s on average.
// kind 'server' = choreographed by the director with gaze/blink/lid commands.
// kind 'fx'     = the screens render it themselves (sprites, flashes, shakes).
// ---------------------------------------------------------------------------
export const QUIRKS = [
  { id: 'wink',        title: 'Wink',            emoji: '😉', kind: 'server', dur: 2.5, weight: 1.0 },
  { id: 'doubletake',  title: 'Double Take',     emoji: '😳', kind: 'server', dur: 4,   weight: 1.0 },
  { id: 'neighbor',    title: 'Glance at Neighbour', emoji: '👉', kind: 'server', dur: 5, weight: 1.2 },
  { id: 'squint',      title: 'Suspicious Squint', emoji: '🤨', kind: 'server', dur: 5, weight: 1.0 },
  { id: 'widen',       title: 'Surprise',        emoji: '😮', kind: 'server', dur: 3,   weight: 0.9 },
  { id: 'pupils',      title: 'Pupil Bloom',     emoji: '🖤', kind: 'server', dur: 4,   weight: 0.8 },
  { id: 'cascade',     title: 'Blink Wave',      emoji: '🌊', kind: 'server', dur: 2.5, weight: 1.0 },
  { id: 'crosseyed',   title: 'Cross-Eyed',      emoji: '🥴', kind: 'server', dur: 3.5, weight: 0.6 },
  { id: 'tabletop',    title: "What's for Dinner?", emoji: '🍽️', kind: 'server', dur: 6, weight: 1.0 },
  { id: 'startle',     title: 'Startle',         emoji: '⚠️', kind: 'server', dur: 3,   weight: 0.9 },
  { id: 'slowblink',   title: 'Slow Blink',      emoji: '😌', kind: 'server', dur: 3,   weight: 0.8 },
  { id: 'sideeye',     title: 'Side-Eye',        emoji: '🙄', kind: 'server', dur: 5,   weight: 1.0 },
  { id: 'scan',        title: 'Searchlight Scan', emoji: '🔦', kind: 'server', dur: 9,  weight: 0.9 },
  { id: 'snap',        title: 'Snap to Target',  emoji: '🎯', kind: 'server', dur: 4,   weight: 1.0 },
  { id: 'peekaboo',    title: 'Peekaboo',        emoji: '🙈', kind: 'server', dur: 4,   weight: 0.7 },
  { id: 'eyeroll',     title: 'Eye Roll',        emoji: '🙄', kind: 'fx', dur: 2.6, weight: 0.8 },
  { id: 'critter',     title: 'Fly-by',          emoji: '🪰', kind: 'fx', dur: 8,   weight: 1.1 },
  { id: 'twitch',      title: 'Twitch',          emoji: '⚡', kind: 'fx', dur: 2.2, weight: 0.8 },
  { id: 'glint',       title: 'Demon Glint',     emoji: '🔴', kind: 'fx', dur: 2.2, weight: 1.0 },
  { id: 'heartbeat',   title: 'Heartbeat',       emoji: '❤️', kind: 'fx', dur: 4,   weight: 0.9 },
  { id: 'shadow',      title: 'Shadow Passes',   emoji: '🌑', kind: 'fx', dur: 3.5, weight: 1.0 },
  { id: 'shiver',      title: 'Shiver',          emoji: '🥶', kind: 'fx', dur: 1.8, weight: 0.7 },
];

// Ambient gaze "modes" the director rotates through.
export const MODES = [
  { id: 'together',     title: 'Together',      weight: 3.0 },
  { id: 'leader',       title: 'Follow the Leader', weight: 2.5 },
  { id: 'independent',  title: 'Independent',   weight: 1.2 },
  { id: 'conversation', title: 'Conversation',  weight: 1.2 },
  { id: 'sweep',        title: 'Sweep',         weight: 0.8 },
  { id: 'lazy',         title: 'Lazy',          weight: 1.0 },
  { id: 'alert',        title: 'Alert',         weight: 0.8 },
];

// Eyelid presets (eye units: the opening is 2 units wide).
//   upper: height of the upper lid above centre, lower: depth of lower lid,
//   tilt: >0 angry (inner corners down), <0 sad.
export const MOODS = {
  neutral:    { upper: 0.40, lower: 0.42, tilt: 0.00 },
  relaxed:    { upper: 0.33, lower: 0.40, tilt: 0.00 },
  wide:       { upper: 0.58, lower: 0.50, tilt: -0.06 },
  suspicious: { upper: 0.20, lower: 0.26, tilt: 0.12 },
  sleepy:     { upper: 0.14, lower: 0.40, tilt: -0.04 },
  angry:      { upper: 0.28, lower: 0.34, tilt: 0.38 },
  sad:        { upper: 0.30, lower: 0.40, tilt: -0.32 },
};

// Base iris / skin palettes. The director changes "chapter" every ~15 min.
export const PALETTES = {
  amber:   { title: 'Amber',   irisA: [0.98, 0.66, 0.18], irisB: [0.45, 0.22, 0.05], skin: [0.20, 0.12, 0.09] },
  emerald: { title: 'Emerald', irisA: [0.88, 0.80, 0.30], irisB: [0.07, 0.42, 0.20], skin: [0.13, 0.13, 0.10] },
  ice:     { title: 'Ice',     irisA: [0.72, 0.90, 1.00], irisB: [0.10, 0.30, 0.60], skin: [0.13, 0.12, 0.15] },
  violet:  { title: 'Violet',  irisA: [0.88, 0.58, 0.98], irisB: [0.30, 0.08, 0.45], skin: [0.15, 0.10, 0.14] },
  hazel:   { title: 'Hazel',   irisA: [0.82, 0.58, 0.22], irisB: [0.28, 0.33, 0.14], skin: [0.21, 0.13, 0.10] },
  crimson: { title: 'Crimson', irisA: [1.00, 0.38, 0.16], irisB: [0.42, 0.03, 0.04], skin: [0.18, 0.08, 0.08], veins: 0.5 },
  storm:   { title: 'Storm',   irisA: [0.78, 0.82, 0.88], irisB: [0.22, 0.27, 0.34], skin: [0.13, 0.13, 0.14] },
  gold:    { title: 'Gold',    irisA: [1.00, 0.86, 0.32], irisB: [0.55, 0.30, 0.03], skin: [0.17, 0.12, 0.08] },
  toxic:   { title: 'Toxic',   irisA: [0.78, 1.00, 0.32], irisB: [0.14, 0.38, 0.05], skin: [0.12, 0.14, 0.09] },
};

export const SPECIAL_MAP = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));
export const QUIRK_MAP = Object.fromEntries(QUIRKS.map((q) => [q.id, q]));
