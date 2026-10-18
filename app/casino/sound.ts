// Tiny synthesized sound kit — no audio files.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function out(gain: number) {
  if (!ctx || muted) return null;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  return g;
}

// Short filtered noise burst: ball ticks, dice knocks, reel clicks.
export function tick(freq = 3200, gain = 0.08, dur = 0.025) {
  const dest = out(gain);
  if (!ctx || !dest) return;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.4;
  src.connect(f).connect(dest);
  src.start();
}

function tone(freq: number, at: number, dur: number, gain: number) {
  const dest = out(0);
  if (!ctx || !dest) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  dest.gain.setValueAtTime(0, t);
  dest.gain.linearRampToValueAtTime(gain, t + 0.01);
  dest.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function chime(win: boolean) {
  if (win) {
    tone(659.25, 0, 0.9, 0.08);
    tone(987.77, 0.09, 1.1, 0.06);
    tone(1318.5, 0.18, 1.4, 0.04);
  } else {
    tone(196, 0, 0.5, 0.05);
  }
}

export function chip() {
  tick(5200, 0.06, 0.018);
  setTimeout(() => tick(4400, 0.04, 0.015), 40);
}
