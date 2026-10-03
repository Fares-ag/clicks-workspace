let sharedAudioContext = null;

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctx();
  return sharedAudioContext;
}

/** Call once after login / first user gesture so autoplay policies allow alerts. */
export function unlockNotificationSound() {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function playFallbackChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const startAt = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(880, startAt);
  osc.frequency.exponentialRampToValueAtTime(660, startAt + 0.12);
  osc.frequency.exponentialRampToValueAtTime(988, startAt + 0.28);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.45);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + 0.5);
}

/**
 * Play dispatch alert sound — tries bundled mp3 first, then Web Audio chime.
 */
export function playNotificationSound() {
  unlockNotificationSound();

  const audio = new Audio("/notification.mp3");
  audio.volume = 0.85;
  audio.play().catch(() => {
    playFallbackChime();
  });
}
