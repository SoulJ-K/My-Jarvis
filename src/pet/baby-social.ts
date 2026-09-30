/** Prototype tuning only: no growth, personality learning or authority changes. */
export const SOCIAL_TIMING = Object.freeze({ emotion: 6000, touchWindow: 10_000, distance: 120_000,
  recovery: 600_000, bond: 600_000, praise: 30_000, reunion: 1_800_000, play: 6000, playGap: 300_000 });
export type Emotion = 'quiet' | 'joy' | 'discomfort' | 'curiosity';
export type Play = 'cursor' | 'orb';
export interface BabySocial {
  elapsedMs: number; familiarity: number; strain: number; recoveryAt: number;
  lastBond: number | null; lastTouch: number | null; touches: number;
  lastPraise: number | null; reunionPending: boolean;
  emotion: Emotion; emotionUntil: number; distanceUntil: number;
  play: Play | null; playUntil: number; nextPlay: number;
  /** Optional so existing v5 snapshots remain readable. Autonomous play never advances it. */
  nextRequestedPlay?: number;
}
export type SocialCommand = { type: 'tick'; active?: boolean; cursorNear?: boolean } |
  { type: 'touch' } | { type: 'greet' } | { type: 'praise' } | { type: 'orb' } | { type: 'stop' };
export type SocialExperience = 'praise' | 'reunion' | 'repeated_touch' | 'cursor_play' | 'orb_play';
export function initialBabySocial(elapsedMs = 0): BabySocial {
  return { elapsedMs, familiarity: 0, strain: 0, recoveryAt: elapsedMs, lastBond: null,
    lastTouch: null, touches: 0, lastPraise: null, reunionPending: false,
    emotion: 'quiet', emotionUntil: 0, distanceUntil: 0, play: null, playUntil: 0,
    nextPlay: elapsedMs, nextRequestedPlay: elapsedMs };
}
export function validateBabySocial(s: BabySocial): void {
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  if (!s || ![s.elapsedMs, s.familiarity, s.strain, s.recoveryAt, s.touches, s.emotionUntil,
    s.distanceUntil, s.playUntil, s.nextPlay].every(integer) ||
    s.nextRequestedPlay !== undefined && !integer(s.nextRequestedPlay) ||
    s.familiarity > 12 || s.strain > 3 || s.touches > 3 ||
    s.recoveryAt > s.elapsedMs || ![s.lastBond, s.lastTouch, s.lastPraise].every(n => n === null || integer(n) && n <= s.elapsedMs) ||
    typeof s.reunionPending !== 'boolean' || !['quiet', 'joy', 'discomfort', 'curiosity'].includes(s.emotion) || ![null, 'cursor', 'orb'].includes(s.play)) throw new Error('SOCIAL_STATE_INVALID');
}
/** Only exact short utterances; never forwards unknown text to a tool. */
export function parseBabyInput(input: unknown): SocialCommand | null {
  if (typeof input !== 'string' || input.length > 80) throw new Error('BABY_INPUT_INVALID');
  const text = input.trim();
  if (text === '안녕') return { type: 'greet' };
  if (text === '잘했어') return { type: 'praise' };
  if (text === '구슬 놀이') return { type: 'orb' };
  if (text === '그만') return { type: 'stop' };
  return null;
}
/** Body readiness is supplied by the life policy. Hunger never selects an emotion. */
export function advanceBabySocial(before: BabySocial, elapsedMs: number, resting: boolean, command: SocialCommand,
  sleepEndsAt?: number) {
  validateBabySocial(before);
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < before.elapsedMs) throw new Error('SOCIAL_CLOCK_INVALID');
  const s = { ...before, elapsedMs };
  const events: SocialExperience[] = [];
  const T = SOCIAL_TIMING;
  if (elapsedMs - before.elapsedMs >= T.reunion) s.reunionPending = true;
  const recovered = Math.floor((elapsedMs - s.recoveryAt) / T.recovery);
  if (recovered) { s.strain = Math.max(0, s.strain - recovered); s.recoveryAt += recovered * T.recovery; }
  if (elapsedMs >= s.emotionUntil) s.emotion = 'quiet';
  if (s.lastTouch !== null && elapsedMs - s.lastTouch > T.touchWindow) s.touches = 0;
  if (s.play && (elapsedMs >= s.playUntil || !resting || command.type === 'stop' || command.type === 'touch' ||
    command.type === 'tick' && (!command.active || s.play === 'cursor' && !command.cursorNear))) {
    s.play = null; s.emotion = 'quiet'; s.emotionUntil = elapsedMs;
  }
  const mood = (emotion: Emotion) => { s.emotion = emotion; s.emotionUntil = elapsedMs + T.emotion; };
  const bond = () => {
    if (s.lastBond === null || elapsedMs - s.lastBond >= T.bond) {
      s.familiarity = Math.min(12, s.familiarity + 1); s.lastBond = elapsedMs;
    }
  };
  if (command.type === 'touch') {
    s.touches = Math.min(3, s.touches + 1); s.lastTouch = elapsedMs;
    if (s.touches >= 3 && elapsedMs >= s.distanceUntil) {
      mood('discomfort');
      // A sleeping baby cannot show distance yet. Keep the same finite interval
      // available after the next wake, including across app restarts.
      s.distanceUntil = Math.max(elapsedMs, sleepEndsAt ?? elapsedMs) + T.distance;
      s.strain = Math.min(3, s.strain + 1); s.recoveryAt = elapsedMs;
      events.push('repeated_touch');
    } else if (s.touches < 3 && elapsedMs >= s.distanceUntil && resting) { mood('curiosity'); bond(); }
  }
  const available = resting && elapsedMs >= s.distanceUntil;
  if (command.type === 'greet') {
    if (available) mood('joy');
    if (s.reunionPending) { events.push('reunion'); s.reunionPending = false; }
    if (available) bond();
  }
  if (command.type === 'praise' && (s.lastPraise === null || elapsedMs - s.lastPraise >= T.praise)) {
    events.push('praise'); s.lastPraise = elapsedMs;
    if (available) { mood('joy'); bond(); }
  }
  // Give an explicit request its own quiet gap. Autonomous play must not consume
  // the only instant at which the user's request would otherwise be allowed.
  const requestedOrb = command.type === 'orb' && elapsedMs >= (s.nextRequestedPlay ?? 0);
  const autonomousPlay = command.type === 'tick' && command.active && elapsedMs >= s.nextPlay &&
    (command.cursorNear || elapsedMs >= T.playGap);
  if (available && (requestedOrb || !s.play && autonomousPlay)) {
    s.play = command.type === 'tick' && command.cursorNear ? 'cursor' : 'orb';
    s.playUntil = elapsedMs + T.play; s.nextPlay = elapsedMs + T.playGap;
    if (requestedOrb) s.nextRequestedPlay = elapsedMs + T.playGap;
    mood('curiosity'); events.push(s.play === 'cursor' ? 'cursor_play' : 'orb_play');
    if (s.play === 'cursor' || command.type === 'orb') bond();
  }
  if (command.type === 'stop') { s.play = null; s.emotion = 'quiet'; s.emotionUntil = elapsedMs;
    s.nextPlay = elapsedMs + T.playGap; s.nextRequestedPlay = elapsedMs + T.playGap; }
  validateBabySocial(s);
  return { state: s, events };
}
export function socialView(s: BabySocial, orbId: string, resting: boolean, drowsy = false) {
  const distancing = s.elapsedMs < s.distanceUntil;
  const emotion = resting ? s.emotion : 'quiet';
  return { emotion, motion: distancing && (resting || drowsy) ? 'away' : !resting ? 'still' : s.play === 'cursor' ? 'chase' :
    s.play === 'orb' ? 'play-orb' : emotion === 'joy' ? 'bounce' : emotion === 'curiosity' ? 'tilt' :
    s.familiarity - s.strain >= 3 ? 'near' : 'still',
    orb: resting && !distancing && (emotion !== 'quiet' || s.play === 'orb') ? { id: orbId, expression: emotion } : null,
    caption: distancing && (resting || drowsy) ? '잠깐 쉴래…' : !resting ? '' : s.play === 'cursor' ? '뭐지?' : s.play === 'orb' ? '데굴데굴' :
      emotion === 'joy' ? '좋아!' : emotion === 'curiosity' ? '응?' : '' };
}
export type BabySocialView = ReturnType<typeof socialView>;
