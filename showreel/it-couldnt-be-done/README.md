# It Couldn't Be Done

A 78 second kinetic typography piece set to "It Couldn't Be Done" by Edgar Guest (1917, public domain). 1920x1080, 30 fps, with a synthesized score.

## Concept

Type is the only hero. The piece has three chapters, and each has its own palette, typographic voice and energy.

| Chapter | Palette | Type behaviour |
| --- | --- | --- |
| I / The Doubters (stanza 1) | Cold ink on slate, blueprint grid | Condensed, all caps and boxed in. Walls squeeze the width axis, lines get pushed off frame, "say so" is struck through and "worried" is redacted. |
| II / The Shift (stanza 2) | Ember and amber, drifting warm light | The type loosens. The heavy layer of COAT falls away and leaves a hairline weight; the capitals lift off "and he took off his hat" like hats, leaving lowercase. The doubters' words stay cold grey, and "doubting" dissolves. |
| III / Momentum (stanza 3) | Signal yellow, black, one hot red | Wide, black and on the beat (138 bpm, six beats per line). THOUSANDS multiplies into a scrolling field, "assail you" converges from every direction, and the piece ends on a single held lockup: *and you'll* **DO IT.** |

**The refrain is the hook.** It uses the same four-beat choreography each time and escalates in scale and heat:

1. **Sing:** the line rides a travelling sine wave that draws itself across the frame.
2. **Tackle:** TACKLED flies in and knocks THE THING off its footing.
3. **Couldn't:** the doubters' box from stanza 1 closes around the impossible phrase, the negation (N'T, then NOT) is struck through, and the box is blown apart.
4. **Did it:** the answer slams in as a lockup with a flash. The final refrain holds on it instead.

Recurring motifs tie the chapters together. The buckle interlock returns in stanza 3, the smile arc under "grin" gets bolder each time, and the coat drop comes back faster. The HUD line counter runs from 01 to 24.

## How it is built

- `index.html` and `main.js`: the whole film is a DOM scene where every frame is a pure function of time (`window.renderFrame(t)`). Type is set in Archivo (a variable font whose weight and width axes drive the squeeze, loosen and shed moves), Instrument Serif italic and JetBrains Mono. The fonts are bundled in `fonts/` (SIL OFL).
- `render.mjs`: headless Chromium (Playwright) captures 60 fps frames across 4 workers and pipes them to ffmpeg.
- `audio.py`: synthesizes the score (a cold drone with a clock in stanza 1, a warm pad with a heartbeat in stanza 2, and a driving beat in stanza 3) and every sound effect. Hits come from the event list the page exports, so picture and sound share one clock.
- `encode.sh`: folds 60 fps down to 30 fps with a two-frame blend (a 180 degree shutter, which gives natural motion blur), adds film grain and muxes the audio.

## Rendering

```sh
npm i playwright-core ffmpeg-static     # or use a system ffmpeg with libx264
node render.mjs video 60 4              # frames -> out/seg_*.mp4
node render.mjs sfx                     # timeline events -> out/sfx.json
python3 audio.py                        # needs numpy + scipy -> out/audio.wav
./encode.sh                             # -> it-couldnt-be-done.mp4
```

Set `FFMPEG` and `CHROME` if the binaries are not on the default paths. `node render.mjs stills 12.5,40.1` writes single frames to `stills/`, and opening `index.html?play` in a browser plays the piece in real time (`index.html?play&t=48` starts at 48 s).
