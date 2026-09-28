"""Score and sound design for It Couldn't Be Done.

Everything is synthesized. Hits come from out/sfx.json, which the page
exports from its own timeline, so sound and picture share one clock.
Usage: python3 audio.py  ->  out/audio.wav
"""
import json
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 78.0
N = int(SR * DUR)
BEAT = 60 / 138.4615
T_S1, T_S2, T_S3 = 3.4, 26.3, 48.4
T_FINAL = 69.2 + 2 * BEAT
rng = np.random.default_rng(7)


def tt(d):
    return np.arange(int(SR * d)) / SR


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def noise(d):
    return rng.standard_normal(int(SR * d))


def env_exp(d, k):
    return np.exp(-tt(d) * k)


def sweep(f0, f1, d, curve=4.0):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def glide(f0, f1, d):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def moving_band(d, f0, f1, shape):
    """Noise whose brightness moves from f0 to f1, amplitude shape(t in 0..1)."""
    n = noise(d)
    bands = np.geomspace(150, 9000, 9)
    t = np.linspace(0, 1, len(n))
    centre = np.log(f0) + (np.log(f1) - np.log(f0)) * t
    out = np.zeros_like(n)
    for i in range(len(bands) - 1):
        b = filt(n, 'bandpass', [bands[i], bands[i + 1]])
        c = (np.log(bands[i]) + np.log(bands[i + 1])) / 2
        out += b * np.exp(-((c - centre) ** 2) / 0.5)
    return out * shape(t)


def mono(x, g=1.0, pan=0.0):
    l = x * g * np.sqrt(0.5 * (1 - pan))
    r = x * g * np.sqrt(0.5 * (1 + pan))
    return np.stack([l, r])


# ------------------------------------------------------------------ sfx
def s_slam():
    body = sweep(150, 42, 0.5, 9) * env_exp(0.5, 7)
    crack = filt(noise(0.08), 'lowpass', 3000) * env_exp(0.08, 55)
    click = filt(noise(0.01), 'highpass', 2000) * env_exp(0.01, 400)
    x = np.zeros(int(SR * 0.5))
    x += 0.9 * body
    x[: len(crack)] += 0.5 * crack
    x[: len(click)] += 0.3 * click
    return mono(x)


def s_boom():
    d = 1.6
    kick = sweep(190, 38, d, 7) * env_exp(d, 3.2)
    sub = np.sin(2 * np.pi * 43 * tt(d)) * env_exp(d, 2.2)
    tail = filt(noise(d), 'bandpass', [80, 1500]) * env_exp(d, 4)
    x = 0.8 * kick + 0.45 * sub + 0.25 * tail
    return np.stack([x, x * 0.98])


def s_final():
    d = 3.0
    b = s_boom()[0]
    x = np.zeros(int(SR * d))
    x[: len(b)] += 1.1 * b
    x += filt(noise(d), 'bandpass', [200, 5000]) * env_exp(d, 2.5) * 0.35
    return np.stack([x, x])


def s_whoosh(d=0.45, f0=300, f1=4000):
    x = moving_band(d, f0, f1, lambda t: np.sin(np.pi * t) ** 2)
    return np.stack([x * 0.9, np.roll(x, 90)]) * 0.7


def s_swish():
    return s_whoosh(0.26, 1200, 7000) * 0.8


def s_tick(f=3200):
    d = 0.05
    x = np.sin(2 * np.pi * f * tt(d)) * env_exp(d, 140) + 0.3 * filt(noise(d), 'highpass', 4000) * env_exp(d, 250)
    return mono(x, 0.6)


def s_click():
    d = 0.3
    x = np.zeros(int(SR * d))
    for off, f in [(0.0, 2600), (0.028, 1900)]:
        c = s_tick(f)[0]
        i = int(off * SR)
        x[i:i + len(c)] += c * 1.4
    x += 0.7 * sweep(220, 70, d, 20) * env_exp(d, 18)
    return mono(x)


def s_strike():
    d = 0.24
    n = filt(noise(d), 'bandpass', [1800, 7000])
    grit = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 70 * tt(d)))
    shape = np.minimum(1, tt(d) / 0.02) * env_exp(d, 9)
    return mono(n * grit * shape, 0.9, 0.2)


def s_drop():
    d = 0.7
    x = sweep(700, 70, d, 3) * env_exp(d, 3) * 0.6
    x += moving_band(d, 4000, 300, lambda t: np.sin(np.pi * t) ** 2) * 0.5
    return mono(x)


def s_tremble():
    d = 1.0
    t = tt(d)
    x = np.sin(2 * np.pi * 58 * t + 0.3 * np.sin(2 * np.pi * 31 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * t))
    x = filt(np.tanh(3 * x), 'lowpass', 900) * np.sin(np.pi * t / d) ** 0.5
    return mono(x, 0.45)


def s_swipe():
    w = s_whoosh(0.3, 500, 6000)
    th = s_slam() * 0.6
    x = np.zeros((2, int(SR * 0.8)))
    x[:, : w.shape[1]] += w
    i = int(0.28 * SR)
    x[:, i:i + th.shape[1]] += th
    return x


def s_riser(d=1.0):
    t = tt(d)
    x = moving_band(d, 200, 7000, lambda u: u ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(220 * 4 ** (t / d)) / SR) * (t / d) ** 2
    return mono(0.8 * x + 0.25 * tone)


def s_rise():
    return s_riser(2.4) * 0.6


def note(f, d, bright=1.0, vib=0.0):
    t = tt(d)
    ph = 2 * np.pi * f * t + vib * np.sin(2 * np.pi * 5.5 * t)
    x = np.sin(ph) + 0.35 * bright * np.sin(2 * ph) + 0.15 * bright * np.sin(3 * ph)
    return x * np.minimum(1, t / 0.01) * env_exp(d, 3.5)


def s_sing():
    # a rising, lilting phrase that rides with the wave
    d = 1.6
    x = np.zeros(int(SR * d))
    for i, (off, f) in enumerate([(0, 587.3), (0.18, 740), (0.36, 880), (0.6, 1174.7), (0.9, 880), (1.1, 1174.7)]):
        n = note(f, 0.7, 0.6, vib=0.25)
        j = int(off * SR)
        m = min(len(n), len(x) - j)
        x[j:j + m] += n[:m] * (0.9 if i < 4 else 0.6)
    return np.stack([x * 0.8, np.roll(x, 240) * 0.8]) * 0.5


def s_shatter():
    d = 1.0
    x = filt(noise(d), 'highpass', 1500) * env_exp(d, 7) * 0.6
    for _ in range(14):
        f = rng.uniform(2500, 7000)
        j = int(rng.uniform(0, 0.25) * SR)
        p = np.sin(2 * np.pi * f * tt(0.3)) * env_exp(0.3, 20) * 0.25
        x[j:j + len(p)] += p
    out = np.stack([x, np.roll(x, 150)])
    out[:, : int(SR * 0.5)] += s_slam() * 0.7
    return out


def s_multiply():
    d = 1.0
    x = np.zeros(int(SR * d))
    n = 26
    for i in range(n):
        u = i / n
        off = 0.75 * (1 - (1 - u) ** 1.6)
        c = s_tick(1200 + 2400 * u)[0]
        j = int(off * SR)
        x[j:j + len(c)] += c * (0.5 + 0.5 * u)
    return np.stack([x, np.roll(x, 60)])


def s_sag():
    d = 0.8
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(420 * 0.45 ** (t / d)) / SR) + 0.6 * np.sin(2 * np.pi * np.cumsum(426 * 0.45 ** (t / d)) / SR)
    return mono(x * env_exp(d, 3) * 0.35)


def s_pop():
    d = 0.12
    x = sweep(900, 420, d, 40) * env_exp(d, 30)
    return mono(x, 0.8)


def s_lift():
    d = 0.4
    return mono(glide(300, 1100, d) * np.sin(np.pi * tt(d) / d) * 0.45)


def s_dust():
    d = 1.0
    x = np.zeros(int(SR * d))
    for _ in range(60):
        j = int(rng.uniform(0, 0.9) * SR)
        c = filt(noise(0.02), 'highpass', 5000) * env_exp(0.02, 200) * rng.uniform(0.1, 0.4)
        x[j:j + len(c)] += c * (1 - j / len(x))
    x += moving_band(d, 3000, 8000, lambda t: np.sin(np.pi * t) ** 2) * 0.25
    return np.stack([x, np.roll(x, 400)])


SFX = {
    'slam': s_slam, 'boom': s_boom, 'final': s_final, 'whoosh': s_whoosh, 'swish': s_swish,
    'tick': s_tick, 'click': s_click, 'strike': s_strike, 'drop': s_drop, 'tremble': s_tremble,
    'swipe': s_swipe, 'riser': s_riser, 'rise': s_rise, 'sing': s_sing, 'shatter': s_shatter,
    'multiply': s_multiply, 'sag': s_sag, 'pop': s_pop, 'lift': s_lift, 'dust': s_dust,
}
# whooshes and risers lead into their moment
LEAD = {'whoosh': 0.2, 'swish': 0.12, 'riser': 0.0, 'rise': 0.0}


def add(buf, x, t, g=1.0):
    i = int(round(t * SR))
    if i < 0:
        x = x[:, -i:]
        i = 0
    m = min(x.shape[1], buf.shape[1] - i)
    if m > 0:
        buf[:, i:i + m] += x[:, :m] * g


# ------------------------------------------------------------------ music
def saw_pad(freqs, d, cutoff=1400, attack=0.8, release=1.2):
    t = tt(d)
    x = np.zeros(len(t))
    for f in freqs:
        for det in (-0.12, 0.12):
            for h in range(1, 9):
                x += np.sin(2 * np.pi * f * h * t * (1 + det / 100) + h) / h
    x = filt(x, 'lowpass', cutoff)
    e = np.minimum(1, t / attack) * np.minimum(1, (d - t) / release)
    return x * np.clip(e, 0, 1) / (len(freqs) * 6)


def kick(g=1.0):
    d = 0.45
    return (sweep(160, 45, d, 18) * env_exp(d, 7)) * g


def snare():
    d = 0.25
    n = filt(noise(d), 'bandpass', [900, 6000]) * env_exp(d, 18)
    body = np.sin(2 * np.pi * 190 * tt(d)) * env_exp(d, 30)
    return 0.7 * n + 0.4 * body


def hat(d=0.05):
    return filt(noise(d), 'highpass', 7000) * env_exp(d, 90)


def bass_note(f, d):
    t = tt(d)
    x = sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, 7))
    x = filt(x, 'lowpass', 520)
    return x * np.minimum(1, t / 0.005) * np.exp(-t * 3) * np.minimum(1, (d - t) / 0.02).clip(0, 1)


def music():
    mus = np.zeros((2, N))
    D2, A2, D3 = 73.42, 110.0, 146.83

    # intro + S1: cold drone, clock ticks
    d = T_S2 + 0.3
    t = tt(d)
    drone = 0.16 * np.sin(2 * np.pi * D2 * t) + 0.1 * np.sin(2 * np.pi * (D2 + 0.35) * t) + 0.06 * np.sin(2 * np.pi * A2 * t)
    drone += 0.012 * (np.sin(2 * np.pi * 587.3 * t) + np.sin(2 * np.pi * 622.3 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t))
    wind = filt(noise(d), 'bandpass', [120, 700]) * 0.05 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t))
    shape = np.minimum(1, t / 3.0) * np.clip((d - t) / 0.4, 0, 1)
    x = (drone + wind) * shape
    add(mus, np.stack([x, np.roll(x, 300)]), 0.0, 0.9)
    tick_t = T_S1
    k = 0
    while tick_t < 20.3:
        add(mus, s_tick(2300 if k % 2 == 0 else 1700), tick_t, 0.22)
        tick_t += BEAT * 2
        k += 1
    # refrain 1: the drone opens up to a fifth-stacked chord
    add(mus, mono(saw_pad([D3, A2 * 2, 293.66], 26.3 - 20.3, 1100, 1.5, 0.3)), 20.3, 1.0)

    # S2: warm pad progression, heartbeat from line 12
    prog = [[146.83, 185.0, 220.0], [123.47, 146.83, 185.0], [98.0, 123.47, 146.83], [110.0, 138.59, 164.81]]
    cl = BEAT * 8
    tpos, i = T_S2, 0
    while tpos < T_S3 - 0.1:
        dd = min(cl + 0.8, T_S3 + 0.4 - tpos)
        freqs = prog[i % 4]
        add(mus, mono(saw_pad(freqs + [f * 2 for f in freqs[:1]], dd, 1500 if tpos < 42.7 else 2600, 0.9, 0.7)), tpos, 1.1)
        bass = filt(np.sin(2 * np.pi * freqs[0] / 2 * tt(dd)), 'lowpass', 200) * np.minimum(1, tt(dd) / 0.5) * np.clip((dd - tt(dd)) / 0.5, 0, 1)
        add(mus, mono(bass, 0.22), tpos)
        tpos += cl
        i += 1
    hb = 35.0
    while hb < T_S3 - 0.3:
        g = 0.35 + 0.35 * (hb - 35.0) / (T_S3 - 35.0)
        add(mus, mono(kick(g)), hb)
        add(mus, mono(kick(g * 0.5)), hb + 0.2)
        hb += BEAT * 2
    # refrain 2 sparkle arpeggio
    arp = [587.3, 740, 880, 1174.7]
    ta, j = 42.7, 0
    while ta < 48.2:
        add(mus, np.stack([note(arp[j % 4], 0.4, 0.3) * 0.06, note(arp[j % 4], 0.4, 0.3) * 0.06 * (0.5 + (j % 2))]), ta)
        ta += BEAT
        j += 1

    # S3: driving beat on the grid
    roots = [73.42, 61.74, 49.0, 55.0]  # D, B, G, A
    chords = [[293.66, 369.99, 440.0], [246.94, 293.66, 369.99], [196.0, 246.94, 293.66], [220.0, 277.18, 329.63]]
    b = 0
    while True:
        tb = T_S3 + b * BEAT
        if tb >= 69.2 - 1e-6:
            break
        bar = (b // 4) % 4
        beat = b % 4
        add(mus, mono(kick(0.85)), tb)
        if beat in (1, 3):
            add(mus, np.stack([snare(), snare()]) * 0.32, tb)
        add(mus, np.stack([hat() * 0.13, hat() * 0.1]), tb + BEAT / 2)
        if tb >= 64.0:
            add(mus, np.stack([hat(0.03) * 0.07, hat(0.03) * 0.09]), tb + BEAT / 4)
            add(mus, np.stack([hat(0.03) * 0.07, hat(0.03) * 0.09]), tb + 3 * BEAT / 4)
        for e8 in range(2):
            bn = bass_note(roots[bar], BEAT / 2)
            duck = 0.55 if e8 == 0 else 1.0
            add(mus, mono(bn, 0.33 * duck), tb + e8 * BEAT / 2)
        if beat == 0:
            add(mus, mono(saw_pad(chords[bar], BEAT * 1.6, 3200, 0.01, 0.4), 1.5), tb)
        b += 1
    # build into the answer, then two beats of air before DO IT.
    add(mus, s_riser(69.2 - 67.5), 67.5, 0.8)

    # the end: a held major chord that rings out under the lockup
    d = DUR - T_FINAL
    t = tt(d)
    chord = saw_pad([73.42, 146.83, 185.0, 220.0, 293.66, 440.0], d, 2400, 0.02, 3.5)
    shimmer = sum(np.sin(2 * np.pi * f * t) for f in (1174.7, 1480, 1760)) * 0.012 * np.minimum(1, t / 1.5)
    tail = (chord * 2.2 + shimmer) * np.exp(-t * 0.18)
    add(mus, np.stack([tail, np.roll(tail, 200)]), T_FINAL)
    return mus


def reverb(x, d=2.2, lp=5000):
    ir_t = tt(d)
    irs = []
    for ch in range(2):
        ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 3.2)
        ir = filt(ir, 'lowpass', lp)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack([signal.fftconvolve(x[c], irs[c])[: x.shape[1]] for c in range(2)])


def main():
    events = json.load(open('out/sfx.json'))
    fx = np.zeros((2, N))
    for e in events:
        typ = e['type']
        x = SFX[typ]()
        add(fx, x, e['t'] - LEAD.get(typ, 0.0), e['gain'])
    mus = music()
    wet = reverb(fx * 0.8 + mus * 0.5)
    mix = fx * 0.75 + mus * 0.9 + wet * 0.28
    mix = filt(mix, 'highpass', 28)
    # gentle master: normalise then soft clip
    mix /= np.max(np.abs(mix)) + 1e-9
    mix = np.tanh(mix * 1.6) / np.tanh(1.6) * 0.89
    # fades
    fi = int(0.05 * SR)
    mix[:, :fi] *= np.linspace(0, 1, fi)
    fo = int(2.5 * SR)
    mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open('out/audio.wav', 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('wrote out/audio.wav', pcm.shape)


if __name__ == '__main__':
    main()
