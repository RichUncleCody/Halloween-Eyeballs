# 👁️ Halloween Eyeballs

Turn a row of three monitors into three giant, living eyeballs that watch your guests.

- **Each monitor is one eye**: `/L`, `/C`, `/R`. They're realistic WebGL eyeballs with procedural irises, bloodshot veins, wet corneal reflections, and lids that blink, squint and follow the gaze.
- **They behave as a group**. The server looks at a shared point in the room and every eye converges on it from its own position, each with its own reaction delay. Most of the time they drift slowly around the room. Now and then one darts somewhere fast and the others "notice" a beat later. They take turns glancing at each other, wander off on their own, then snap back into eerie unison.
- **About every 5 minutes, something special happens.** There are 34 specials: demon eyes, hellfire, a bat swarm that flies across all three screens, a jack-o'-lantern face made of the three monitors, writing on the wall, googly eyes, and more (full list below).
- **About every 45 seconds there's a smaller quirk**, one of 22: a wink, a double take, side-eye at a guest, a fly buzzing past, a blink wave. The iris palette also changes every 15 minutes or so, so even after a couple of hours there's still something new.
- **The server runs the show.** Everything the auto-director does can also be triggered from the control panel (`/control`) or the HTTP API, so later you can wire it to buttons, Home Assistant, a motion sensor, or anything else.
- **One small container.** Node.js with zero npm dependencies, no build step. Images are published to `ghcr.io` for amd64 and arm64 (Raspberry Pi works as the server).

---

## Quick start

```bash
docker run -d --name eyeballs --restart unless-stopped \
  -p 8080:8080 -p 8443:8443 -v eyeballs-data:/data \
  ghcr.io/richunclecody/halloween-eyeballs:latest
```

Or, with Docker Compose, use the included [`compose.yaml`](compose.yaml): `docker compose up -d`.

Then, on the computer(s) driving the monitors:

| Monitor | Open |
|---|---|
| left   | `http://<server>:8080/L` |
| centre | `http://<server>:8080/C` |
| right  | `http://<server>:8080/R` |

Click once on each screen to go fullscreen (or press **F**). Open `http://<server>:8080/control` on your phone to run the show. `http://<server>:8080/wall` shows all three eyes side by side, which is handy for testing on one screen.

> If the package is private, run `docker login ghcr.io` first, or make it public under
> GitHub → your profile → Packages → halloween-eyeballs → Package settings.

### One computer with three monitors

Run the container on that computer and open three browser windows: `http://localhost:8080/L`, `/C` and `/R`. Drag one onto each monitor and press **F** in each. Because it's `localhost`, the screen wake lock works without any extra steps.

Chrome kiosk mode puts each window straight onto a monitor with no browser chrome. Each window needs its own `--user-data-dir`:

```bash
chrome --kiosk --new-window --user-data-dir=/tmp/eyeL --window-position=0,0 http://localhost:8080/L
```

```bash
chrome --kiosk --new-window --user-data-dir=/tmp/eyeC --window-position=1920,0 http://localhost:8080/C
```

```bash
chrome --kiosk --new-window --user-data-dir=/tmp/eyeR --window-position=3840,0 http://localhost:8080/R
```

### Several computers

Run the container on any machine on the network (one of the three PCs is fine) and point each browser at it. The screens synchronise their clocks with the server, so they stay in lock-step even across different machines.

---

## Keeping the screens awake 💤

Each page asks the browser for a **Screen Wake Lock**, which stops the display from sleeping while the page is visible. Browsers only allow this on secure pages, which means `https://…` or `http://localhost`.

| How the screen loads the page | Wake lock |
|---|---|
| `http://localhost:8080/L` (server on the same PC) | ✅ works |
| `https://<server>:8443/L` | ✅ works. The server makes its own self-signed certificate, so click **Advanced → Proceed** once per machine |
| `http://<server-ip>:8080/L` | ⚠️ the browser blocks it. The page falls back to a hidden looping video that usually, but not always, keeps the display on |

Press **D** on any screen to see which keep-awake method is active. The control panel shows it for every screen too.

To be sure, also turn off display sleep on the machines driving the monitors:

- **Windows**: `powercfg /change monitor-timeout-ac 0` and `powercfg /change standby-timeout-ac 0`
- **macOS**: run `caffeinate -d` in a Terminal while the show runs, or set System Settings → Lock Screen → "Turn display off" → Never
- **Linux (X11)**: `xset s off -dpms`. GNOME: `gsettings set org.gnome.desktop.session idle-delay 0`
- **Chrome on plain http**: you can also tell Chrome to treat the server as secure:
  `--unsafely-treat-insecure-origin-as-secure=http://192.168.1.50:8080 --user-data-dir=/tmp/eyes`

---

## The control panel (`/control`)

From the control panel you can:

- Play any special or quirk, or a random one. Untick a checkbox to drop an effect from the auto rotation.
- Write your own three words across the screens ("HAPPY / BIRTHDAY / SAM").
- Tap a top-down map of the room to make every eye look at that spot, or drag to have them follow your finger.
- Set the mood (angry, suspicious, sleepy…), the gaze mode, or the iris palette.
- Change how often specials and quirks happen, or switch the auto-director off.
- Put the eyes to sleep, wake them with a start, reload every screen, and watch a live preview.

Settings are saved to `/data/config.json`, so they survive restarts.

---

## HTTP API

Every action is a `POST`. Bodies are JSON (or form-encoded). Responses are JSON.

```bash
S=http://localhost:8080

# play an effect (any special or quirk id, or "random")
curl -X POST $S/api/trigger/bats
curl -X POST $S/api/trigger/random
curl -X POST $S/api/trigger/message -H 'Content-Type: application/json' -d '{"words":["HAPPY","BIRTHDAY","SAM"]}'
curl -X POST $S/api/trigger/wink -d 'eye=L'

# stop whatever special is playing
curl -X POST $S/api/stop

# everyone look at a point in the room for 8 seconds (see "Room coordinates")
curl -X POST $S/api/look -H 'Content-Type: application/json' -d '{"x":3,"y":-0.5,"z":5,"hold":8}'

# continuous tracking, e.g. from a person detector (call ~5x per second)
curl -X POST $S/api/look -H 'Content-Type: application/json' -d '{"x":1.2,"y":0,"z":4,"ease":"track","hold":1}'

curl -X POST $S/api/blink -d 'kind=double'        # normal | slow | double | half; eyes=L,R
curl -X POST $S/api/mood  -d 'mood=angry&hold=20' # neutral relaxed wide suspicious sleepy angry sad
curl -X POST $S/api/mode  -d 'mode=conversation'  # together leader independent conversation sweep lazy alert
curl -X POST $S/api/palette -d 'palette=crimson'  # or {} for a surprise, or {"L":"ice","C":"gold","R":"toxic"}
curl -X POST $S/api/sleep                         # eyes close and stay closed
curl -X POST $S/api/wake                          # ...and snap open
curl -X POST $S/api/config -H 'Content-Type: application/json' -d '{"specialMean":180,"quirkMean":30,"auto":true,"disabled":["googly"]}'
curl -X POST $S/api/reload                        # reload every screen

curl $S/api/state     # what's happening now, connected screens, history
curl $S/api/catalog   # every effect, mood, mode and palette id
```

If you set `CONTROL_TOKEN`, every POST needs `Authorization: Bearer <token>` (or `?token=<token>`). The control panel has a field for it.

**Room coordinates** are measured in monitor-heights, with the centre monitor at the origin: `x` runs left (−) to right (+), `y` runs down (−) to up (+), and `z` is the distance into the room. The dinner table is roughly `y = -2.5, z = 3..5`, and people sitting across the room are around `z = 4..9`.

---

## Configuration

| Env var | Default | |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HTTPS_PORT` | `8443` | HTTPS port (`0` turns it off) |
| `TLS_CERT`, `TLS_KEY` | – | Paths to your own certificate. Without them, a self-signed one is generated and cached in `/data` |
| `TLS_HOSTS` | – | Extra hostnames/IPs for the self-signed cert, e.g. `eyes.local,192.168.1.50` |
| `SPECIAL_MEAN_SECONDS` | `300` | Average time between specials |
| `QUIRK_MEAN_SECONDS` | `45` | Average time between quirks |
| `PALETTE_MINUTES` | `15` | Average time between iris palette changes |
| `AUTO` | `true` | Auto-director on/off |
| `DISABLED` | – | Comma-separated effect ids to leave out of the rotation |
| `CONTROL_TOKEN` | – | Require a token for API actions |
| `DATA_DIR` | `/data` (`./data` outside Docker) | Where config and the generated certificate are stored |

Values saved from the control panel (`/data/config.json`) override the env defaults.

**Per-screen URL options:** `?size=0.9` changes the eye size, `?gap=0.05` sets the bezel gap between monitors (as a fraction of the monitor width, so things that fly across screens line up), and `?q=0.7` sets the render quality. The renderer also lowers its resolution automatically on slow machines.

---

## What can happen

### Specials (about one every 5 minutes, never the same one twice in a row)

| | Special | | |
|---|---|---|---|
| 😈 | Demon Awakens | `demon` | Blood-red sclera, slit pupils, angry brows, a heartbeat pulsing through all three screens while they pick out a victim |
| 🔥 | Hellfire | `hellfire` | Flames rise from the bottom of every screen, the irises turn molten, embers drift up |
| 💙 | Soulfire | `soulfire` | Cold blue spectral flames and ghostly wisps |
| 🧪 | Witch's Brew | `witchbrew` | Toxic green glow, bubbling cauldron fog, suspicious squint |
| 🐈‍⬛ | Black Cat | `cat` | Glowing cat eyes with sideways-blinking third eyelids. Then a laser dot zips across the screens and they all chase it |
| 👁️ | Possessed | `possessed` | Eyes roll back to the whites and tremble while the lights flicker, then snap down to stare at someone |
| 🌀 | Hypnosis | `hypnosis` | Synchronised spinning spiral irises, colour cycling |
| ⚫ | The Void | `void` | Pitch-black eyes with a single white pinpoint, slowly turning to stare |
| 🌌 | Cosmic Eye | `cosmic` | Galaxy irises in a starfield, with shooting stars that cross between monitors |
| 🌑 | Eclipse | `eclipse` | The pupils swallow the irises, then a blazing corona and a "diamond ring" flash |
| 🧟 | Undead | `undead` | Milky cataract eyes, droopy uneven lids, lazy wandering gaze, flies buzzing |
| 🧊 | Frozen Solid | `frozen` | Frost creeps in from the edges and the eyes freeze in place, until the ice shatters |
| ⛈️ | Thunderstorm | `storm` | Rain, lightning bolts across the whole wall, synchronised flashes. The eyes startle and pupils snap shut |
| 🦇 | Bat Swarm | `bats` | A swarm flies across all three monitors, some swooping at you, and every eye tracks the nearest bat |
| 🕷️ | Spider Drop | `spider` | A spider lowers itself on a thread in front of one eye, then a horde scurries along the bottom |
| 👻 | Ghost Passing | `ghost` | A ghost drifts across the screens, stops, and BOOs at one of the eyes |
| 🫣 | Many Eyes | `manyeyes` | The eye closes and dozens of small eyes open all over the screens, then all turn to look at the same person |
| 🩸 | Writing on the Wall | `message` | Dripping blood letters, one word per screen ("I / SEE / YOU", "TRICK / OR / TREAT", "SAVE / ME / DESSERT"…) |
| 📺 | Signal Lost | `glitch` | Haunted-TV static, tearing, colour bars, NO SIGNAL |
| 🤪 | Googly Eyes | `googly` | Comic relief: the eyes become googly eyes whose pupils bounce and jiggle with physics |
| 🎃 | Jack-o'-Lantern | `pumpkin` | The three monitors become one carved pumpkin face, with burning eyes looking out through the triangles and a candle-lit grin |
| 💀 | Skull | `skull` | One giant skull across the monitors, with red pinpoints in the sockets and chattering teeth |
| 😵‍💫 | Dizzy | `dizzy` | Faster and faster eye circles that drift out of sync, then cross-eyed with cartoon stars |
| 👀 | Pass the Glance | `domino` | Choreography: they look at each other in turn, do a blink wave, nod, shake their heads, then stare at someone |
| 🫵 | The Stare | `stare` | All three lock onto one guest and narrow slowly without blinking |
| 🩸 | Weeping Blood | `weeping` | Sad brows, reddening eyes, and blood tears running down the screens |
| ⚡ | Electric Overload | `overload` | Arcing irises, sparks, brown-outs, and a bolt that jumps across all three monitors |
| 🌈 | Fever Dream | `fever` | Rainbow kaleidoscope irises in a colour wave across the monitors, figure-eight gazes |
| 😴 | Drowsy | `drowsy` | Heavy lids, nodding off one by one, Zzz… then all three SNAP awake |
| 🌚 | Something in the Dark | `darkness` | The eyes close, the screens go black, and pairs of glowing eyes blink open all over the darkness |
| 🐙 | From the Deep | `tentacles` | Octopus pupils as tentacles rise and curl up the screens |
| 🕯️ | Candlelight | `candle` | Cosy and calm: flickering warm candlelight from below while they look over the dinner table |
| 🐺 | Full Moon | `werewolf` | A moon rises in a night sky, the eyes turn wolf-gold, then claw marks rip across all three screens |
| 🌫️ | Fog Rolls In | `fog` | Fog drifts across the monitors and a shadow figure with glowing eyes walks through it |

### Quirks (about one every 45 seconds)

😉 `wink` · 😳 `doubletake` · 👉 `neighbor` (eyes glance at each other, then look away awkwardly) · 🤨 `squint` · 😮 `widen` · 🖤 `pupils` · 🌊 `cascade` · 🥴 `crosseyed` · 🍽️ `tabletop` (what's for dinner?) · ⚠️ `startle` · 😌 `slowblink` · 🙄 `sideeye` · 🔦 `scan` · 🎯 `snap` · 🙈 `peekaboo` · 🙄 `eyeroll` · 🪰 `critter` (a fly or moth crosses the screens) · ⚡ `twitch` · 🔴 `glint` · ❤️ `heartbeat` · 🌑 `shadow` · 🥶 `shiver`

### Ambient behaviour

The director rotates through seven gaze modes every minute or two:

- **together**: shared attention
- **leader**: one eye leads and the others follow a beat later
- **independent**: each eye wanders, then they snap into unison
- **conversation**: they look at each other
- **sweep**: a searchlight scan across the room
- **lazy** and **alert**

On top of that there are micro-saccades, drift, natural blinking (in groups, in waves, or alone), pupil "breathing", and lids that follow the gaze.

---

## How it works

```
server/director.js   the show: gaze modes, blinks, quirks, specials, palettes
server/index.js      HTTP + HTTPS, static files, the JSON API, Server-Sent Events
server/tls.js        tiny self-signed certificate generator (no OpenSSL needed)
shared/catalog.js    every special/quirk/mood/palette (used by server AND browser)
public/js/main.js    a screen: clock sync, event playback, compositing, keep-awake
public/js/shader.js  the eyeball (one GLSL fragment shader)
public/js/fx/*.js    the specials and visual quirks (2-D canvas + shader parameters)
```

- The **server** sends small timestamped commands ("eye L: dart to (3, -0.5, 5) at 12:00:01.350", "special `bats` with seed 812 starts at 12:00:04"). Commands are scheduled about 350 ms ahead.
- Each **screen** measures its clock offset to the server (NTP-style), so events land on the same frame everywhere.
- **Specials** are deterministic functions of their seed and the elapsed time. Every screen computes the same bat flight paths and draws only the part on its own monitor, so things fly continuously from one monitor to the next. A screen that joins or reloads mid-effect picks up exactly where the others are.
- If the server goes away, each eye keeps looking around and blinking on its own until it reconnects. When the server is updated, screens reload themselves automatically.

### Adding an effect

1. Add an entry to `SPECIALS` (or `QUIRKS`) in `shared/catalog.js`.
2. Implement it in one of the `public/js/fx/*.js` files with `register({ myid(api) { return { theme, gaze, lids, pupil, blink, draw, drawBg } } })`. Every hook is optional. Look at `ghost` or `bats` for an example.
3. Preview it locally with `http://localhost:8080/wall?offline=1&fx=myid` (add `&t=4.5` to freeze at 4.5 s).
4. `npm test` checks that every catalog entry has an implementation.

### Development

```bash
npm start     # http://localhost:8080
npm test
```

There's no build step and no dependencies. Node 20+ is all you need.

---

Font: [Creepster](https://fonts.google.com/specimen/Creepster) by Font Diner (SIL Open Font License, `public/fonts/Creepster-OFL.txt`).
