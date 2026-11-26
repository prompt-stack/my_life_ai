#!/usr/bin/env python3
"""Generate MyLife AI's five original alarm sounds (pure standard library).

Usage:  python3 scripts/alarm-sounds/generate.py [--only sunrise,chimes]

Outputs (relative to this directory):
  out/<id>.wav          44.1 kHz mono 16-bit masters
  out/android/alarm_<id>.wav   32 kHz mono 16-bit (smaller; copied into res/raw by the config plugin)

Every sound is a short original motif repeated 3-4 times. Notes are mixed into the
buffer with modulo (wrap-around) indexing, so tails that run past the end flow back
into the start: the loop is seamless by construction (no baked fade-out, no click).
All five are RMS-normalised to the same level with a soft peak limiter (<= -1 dBFS).
Fully deterministic (fixed RNG seed). Original work, owned by MyLife AI.
"""
import argparse
import array
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
MASTER_SR = 44100
ANDROID_SR = 32000
TARGET_RMS = 0.12          # about -18.4 dBFS RMS
PEAK_CEILING = 0.89        # about -1 dBFS


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


class Buf:
    """Looping mix buffer: writes past the end wrap to the start."""

    def __init__(self, sr, seconds):
        self.sr = sr
        self.n = int(round(sr * seconds))
        self.data = [0.0] * self.n

    def add(self, start_s, samples):
        i0 = int(round(start_s * self.sr))
        n = self.n
        d = self.data
        for k, v in enumerate(samples):
            d[(i0 + k) % n] += v


def env_ad(i, sr, attack, tau):
    t = i / sr
    a = min(1.0, t / attack) if attack > 0 else 1.0
    return a * math.exp(-t / tau)


def additive_note(sr, f, dur, partials, attack, rng=None, vel=1.0, detune=0.0):
    """partials: list of (ratio, amp, tau). Returns samples for dur seconds."""
    n = int(dur * sr)
    out = [0.0] * n
    for ratio, amp, tau in partials:
        fr = f * ratio
        if fr > sr * 0.45:
            continue
        w = 2 * math.pi * fr / sr
        w2 = 2 * math.pi * fr * (1 + detune) / sr
        for i in range(n):
            e = env_ad(i, sr, attack, tau)
            if e < 1e-4 and i / sr > attack:
                break
            v = math.sin(w * i)
            if detune:
                v = 0.5 * (v + math.sin(w2 * i))
            out[i] += amp * e * v
    return [s * vel for s in out]


def bell(sr, f, dur, vel=1.0):
    parts = [(1.0, 1.0, 2.6), (2.0, 0.55, 1.9), (2.76, 0.45, 1.3), (4.07, 0.25, 0.9),
             (5.4, 0.18, 0.6), (8.93, 0.07, 0.35)]
    return additive_note(sr, f, dur, parts, 0.004, vel=vel, detune=0.0015)


def marimba(sr, f, dur, vel=1.0):
    parts = [(1.0, 1.0, 0.45), (4.0, 0.45, 0.12), (9.9, 0.12, 0.04)]
    return additive_note(sr, f, dur, parts, 0.003, vel=vel)


def piano(sr, f, dur, rng, vel=1.0):
    # inharmonic partials, higher partials decay faster, tiny noisy hammer thump
    parts = []
    base_tau = 1.6 if f > 400 else 2.4
    for k in range(1, 9):
        ratio = k * math.sqrt(1 + 0.0004 * k * k)
        parts.append((ratio, 1.0 / (k ** 1.15), base_tau / (1 + 0.45 * (k - 1))))
    note = additive_note(sr, f, dur, parts, 0.006, vel=vel, detune=0.0012)
    # hammer: short low-passed noise burst
    lp = 0.0
    for i in range(min(len(note), int(0.025 * sr))):
        lp += 0.25 * (rng.uniform(-1, 1) - lp)
        note[i] += 0.12 * vel * lp * (1 - i / (0.025 * sr))
    return note


def pluck(sr, f, dur, rng, vel=1.0):
    """Karplus-Strong string."""
    period = max(2, int(round(sr / f)))
    line = [rng.uniform(-1, 1) for _ in range(period)]
    # soften the excitation (one-pole low-pass) for a warmer pluck
    lp = 0.0
    for i in range(period):
        lp += 0.6 * (line[i] - lp)
        line[i] = lp
    n = int(dur * sr)
    out = [0.0] * n
    idx = 0
    decay = 0.9965
    for i in range(n):
        a = line[idx]
        b = line[(idx + 1) % period]
        new = decay * 0.5 * (a + b)
        out[i] = a
        line[idx] = new
        idx = (idx + 1) % period
    # 8 ms attack to avoid a click from the noise start, 40 ms release at the tail
    att = int(0.008 * sr)
    for i in range(min(att, n)):
        out[i] *= i / att
    rel = int(0.04 * sr)
    for i in range(min(rel, n)):
        out[n - 1 - i] *= i / rel
    return [s * vel * 1.4 for s in out]


def pad(sr, freqs, seconds, period, amp):
    """Warm pad whose swell repeats every `period` seconds (periodic crescendo)."""
    n = int(seconds * sr)
    out = [0.0] * n
    for f in freqs:
        for det in (0.997, 1.003):
            w = 2 * math.pi * f * det / sr
            w3 = 3 * w
            for i in range(n):
                swell = math.sin(math.pi * (i / sr % period) / period) ** 2
                out[i] += amp * swell * (math.sin(w * i) + 0.25 * math.sin(w3 * i))
    return out


# ---- motifs (start seconds, midi, duration, velocity) -------------------------------

def render_sunrise(sr, rng):
    period, reps = 5.0, 4
    b = Buf(sr, period * reps)
    # C major add9 rising arpeggio, velocity grows through the motif
    motif = [(0.00, 72, 2.2, 0.35), (0.50, 76, 2.2, 0.42), (1.00, 79, 2.2, 0.50),
             (1.50, 84, 2.2, 0.60), (2.00, 88, 2.4, 0.70), (2.50, 86, 2.0, 0.60),
             (3.00, 84, 2.0, 0.65), (3.50, 91, 2.6, 0.75)]
    for r in range(reps):
        for t, m, d, v in motif:
            b.add(r * period + t, additive_note(
                sr, hz(m), d, [(1, 1.0, 1.1), (2, 0.3, 0.6), (3, 0.12, 0.4)], 0.06, vel=v, detune=0.002))
    p = pad(sr, [hz(60), hz(64), hz(67), hz(74)], period * reps, period, 0.05)
    for i, v in enumerate(p):
        b.data[i] += v
    return b.data


def render_chimes(sr, rng):
    period, reps = 6.0, 3
    b = Buf(sr, period * reps)
    # D major pentatonic wind-chime shimmer
    motif = [(0.0, 86, 3.5, 0.7), (0.45, 90, 3.2, 0.55), (0.9, 93, 3.0, 0.6), (1.5, 98, 3.0, 0.45),
             (2.2, 95, 3.2, 0.6), (2.7, 90, 3.2, 0.5), (3.4, 86, 3.4, 0.65), (4.1, 93, 3.2, 0.55),
             (4.6, 98, 3.0, 0.45)]
    for r in range(reps):
        for t, m, d, v in motif:
            b.add(r * period + t, bell(sr, hz(m - 12), d, v))
    return b.data


def render_marimba(sr, rng):
    period, reps = 5.0, 4
    b = Buf(sr, period * reps)
    # bouncy original figure in G major
    seq = [79, 83, 86, 83, 79, 83, 88, 86, 83, 86, 91, 88, 86, 83, 79, 83]
    step = 0.25
    for r in range(reps):
        for k, m in enumerate(seq):
            t = r * period + k * step
            v = 0.85 if k % 4 == 0 else 0.6
            b.add(t, marimba(sr, hz(m), 0.9, v))
        # held pair at the end of the bar
        b.add(r * period + 4.0 - 0.001, marimba(sr, hz(91), 0.9, 0.7))
        b.add(r * period + 4.25, marimba(sr, hz(95), 0.9, 0.7))
    return b.data


def render_piano(sr, rng):
    period, reps = 6.0, 3
    b = Buf(sr, period * reps)
    # gentle original phrase in F major: question and answer
    motif = [(0.0, 77, 2.2, 0.7), (0.6, 81, 2.2, 0.55), (1.2, 84, 2.4, 0.6), (1.8, 89, 3.0, 0.75),
             (3.0, 88, 2.0, 0.55), (3.6, 84, 2.2, 0.6), (4.2, 81, 2.2, 0.55), (4.8, 84, 3.0, 0.7),
             (0.0, 65, 3.0, 0.45), (3.0, 60, 3.0, 0.45)]
    for r in range(reps):
        for t, m, d, v in motif:
            b.add(r * period + t, piano(sr, hz(m), d, rng, v))
    return b.data


def render_guitar(sr, rng):
    period, reps = 6.0, 3
    b = Buf(sr, period * reps)
    # fingerpicked A-minor / C arpeggio (original)
    pattern = [69, 72, 76, 72, 69, 72, 76, 79, 76, 72, 71, 74, 79, 74, 71, 67]
    step = period / len(pattern) * 0.5
    for r in range(reps):
        for k, m in enumerate(pattern):
            t = r * period + k * step
            b.add(t, pluck(sr, hz(m), 1.8, rng, 0.8 if k % 4 == 0 else 0.6))
        for k, m in enumerate([76, 79, 84, 79, 76, 72, 74, 79]):
            t = r * period + (len(pattern) * step) + k * step
            b.add(t, pluck(sr, hz(m), 2.2, rng, 0.7))
    return b.data


SOUNDS = {
    "sunrise": render_sunrise,
    "chimes": render_chimes,
    "marimba": render_marimba,
    "piano": render_piano,
    "guitar": render_guitar,
}


def soft_limit(x):
    knee = 0.70
    a = abs(x)
    if a <= knee:
        return x
    y = knee + (PEAK_CEILING - knee) * math.tanh((a - knee) / (PEAK_CEILING - knee))
    return math.copysign(y, x)


def rms(xs):
    return math.sqrt(sum(v * v for v in xs) / len(xs))


def normalise(data):
    mean = sum(data) / len(data)
    data = [v - mean for v in data]
    lo, hi = 0.01, 200.0
    for _ in range(40):  # bisect gain so the limited signal hits TARGET_RMS
        g = math.sqrt(lo * hi)
        r = rms([soft_limit(v * g) for v in data])
        if r < TARGET_RMS:
            lo = g
        else:
            hi = g
    g = math.sqrt(lo * hi)
    return [soft_limit(v * g) for v in data]


def write_wav(path, sr, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = array.array("h", [max(-32767, min(32767, int(round(v * 32767)))) for v in data])
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<%dh" % len(pcm), *pcm))


def report(name, sr, data):
    peak = max(abs(v) for v in data)
    seam = abs(data[0] - data[-1])
    typical = sum(abs(data[i + 1] - data[i]) for i in range(0, len(data) - 1, 97)) / (len(data) // 97)
    print("%-8s %5.1fs  rms %.1f dBFS  peak %.1f dBFS  seam step %.5f (typical step %.5f)" % (
        name, len(data) / sr, 20 * math.log10(rms(data)), 20 * math.log10(peak), seam, typical))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    ids = [s for s in args.only.split(",") if s] or list(SOUNDS)
    for name in ids:
        for sr, path in ((MASTER_SR, os.path.join(OUT, name + ".wav")),
                         (ANDROID_SR, os.path.join(OUT, "android", "alarm_%s.wav" % name))):
            rng = random.Random(hash_seed(name))
            data = normalise(SOUNDS[name](sr, rng))
            write_wav(path, sr, data)
            report(name + "@%d" % sr, sr, data)


def hash_seed(name):
    return sum(ord(c) * (i + 1) for i, c in enumerate(name)) * 7919


if __name__ == "__main__":
    main()
