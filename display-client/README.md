# Loqui LED ticker — Raspberry Pi display client

A meter-long LED matrix ticker that scrolls Loqui's translations under your TV.
The Pi is a dumb renderer: any Chrome machine runs the Loqui translator with the
**📺 Send to display** toggle on, the server broadcasts each translated segment
over SSE (`/api/display/stream`), and this client scrolls it across chained
HUB75 panels.

```
TV audio ──▶ Chrome machine (Loqui translator, ⚡ Live engine)
                    │  POST /api/display/send
                    ▼
              Loqui server ──SSE──▶ Raspberry Pi ──HUB75──▶ LED panels
```

No hardware yet? Test the whole pipeline with the built-in emulator (below) or
open `/display` in any browser — it renders the same feed as a fullscreen
subtitle page.

## Bill of materials (~€120 for ~1 m)

| Part | Qty | Notes |
|---|---|---|
| P5 64x32 HUB75 LED panel (32 × 16 cm) | 3 | 3 = 96 cm · 192×32 px. P4 panels (25.6 cm) also work — adjust `--led-cols`/chain. |
| Raspberry Pi 3B+ or Pi 4 | 1 | **Not Pi 5** — rpi-rgb-led-matrix doesn't support the RP1 I/O chip. Zero 2 W works with reduced refresh. |
| RGB matrix HAT/Bonnet (Adafruit or Electrodragon E680) | 1 | Level-shifts GPIO to the panels' 5 V logic. |
| 5 V PSU, 10–15 A | 1 | Text-on-black draws far less than the ~4 A/panel worst case, but keep headroom. Inject power to **every** panel, not just the first. |
| Aluminum profile / wooden frame, optional acrylic diffuser | — | Makes it furniture instead of a science project. |

## Wiring

1. Seat the HAT on the Pi, connect the first panel's **input** HUB75 socket to
   the HAT with the ribbon cable (arrows on the panel PCB show data direction).
2. Daisy-chain panel 1 output → panel 2 input → panel 3 input.
3. Run 5 V/GND from the PSU to each panel's power connector, and tie the PSU
   ground to the HAT's ground terminal.
4. Adafruit HAT quality tip: solder the GPIO4–GPIO18 jumper and use
   `--led-gpio-mapping adafruit-hat-pwm` for flicker-free PWM.

## Software setup (on the Pi)

```bash
sudo apt update && sudo apt install -y git python3-dev python3-pillow cython3
git clone https://github.com/hzeller/rpi-rgb-led-matrix.git
cd rpi-rgb-led-matrix
make build-python PYTHON=$(which python3)
sudo make install-python PYTHON=$(which python3)
```

Add `isolcpus=3` to `/boot/firmware/cmdline.txt` and disable onboard sound
(`dtparam=audio=off` in `config.txt`) for rock-solid refresh, then reboot.

## Run

```bash
# Real hardware — 3× P5 panels behind an Adafruit HAT (root needed for GPIO):
sudo python3 loqui_display.py --url https://your-loqui-server.example \
  --led-chain 3 --led-gpio-mapping adafruit-hat-pwm --led-slowdown-gpio 2

# No hardware — emulate to the terminal from any machine:
python3 loqui_display.py --url http://localhost:3000 --emulate
```

Useful flags: `--show-interim` (live preview lines while idle), `--color 255,60,60`,
`--led-brightness 40` (evenings), `--scroll-pps 90` (faster crawl),
`--token …` if the server sets `LOQUI_DISPLAY_TOKEN`, `--led-slowdown-gpio 4`
on a Pi 4. The default font is DejaVu Sans Bold, which ships with Raspberry Pi
OS and covers Ukrainian Cyrillic; point `--font` at any TTF you prefer.

## Run at boot

```bash
sudo cp loqui-display.service /etc/systemd/system/
sudo systemctl edit loqui-display   # override ExecStart with your URL/flags
sudo systemctl enable --now loqui-display
```

## Server-side notes

- The feed is one-way and text-only. If the Loqui server is reachable from the
  internet, set `LOQUI_DISPLAY_TOKEN` so strangers can't subscribe to (or spam)
  your ticker, and pass the same value via `--token`.
- The broadcast bus is in-memory: run a single server instance (the default
  Railway setup qualifies).
