#!/usr/bin/env python3
"""Loqui LED matrix display client for Raspberry Pi.

Subscribes to a Loqui server's display feed (GET /api/display/stream,
Server-Sent Events) and renders translated segments on a chain of HUB75
RGB LED panels driven by the rpi-rgb-led-matrix library.

Finalized translations are queued and scrolled across the panel chain
(shown statically when they fit); interim previews (--show-interim) are
displayed only while the queue is idle.

Requires: Pillow, and https://github.com/hzeller/rpi-rgb-led-matrix
(Python bindings) unless running with --emulate, which prints frames to
the terminal instead of driving hardware.

Example (3x P5 64x32 panels with an Adafruit HAT):
    sudo python3 loqui_display.py --url https://loqui.example.com \\
        --led-chain 3 --led-gpio-mapping adafruit-hat-pwm --led-slowdown-gpio 2
"""

from __future__ import annotations

import argparse
import json
import queue
import signal
import sys
import threading
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", required=True, help="Loqui server base URL, e.g. https://loqui.example.com")
    p.add_argument("--token", default="", help="Value of LOQUI_DISPLAY_TOKEN if the server sets one")
    p.add_argument("--font", default=DEFAULT_FONT, help=f"TTF font with Cyrillic glyphs (default: {DEFAULT_FONT})")
    p.add_argument("--show-interim", action="store_true", help="Also show interim previews while idle")
    p.add_argument("--scroll-pps", type=int, default=70, help="Scroll speed, pixels per second (default 70)")
    p.add_argument("--static-secs", type=float, default=4.0, help="Hold time for text that fits without scrolling")
    p.add_argument("--color", default="255,180,0", help="Text color R,G,B (default amber 255,180,0)")
    p.add_argument("--emulate", action="store_true", help="No hardware: print frames to the terminal")
    # Matrix geometry / wiring — names mirror rpi-rgb-led-matrix flags.
    p.add_argument("--led-rows", type=int, default=32)
    p.add_argument("--led-cols", type=int, default=64)
    p.add_argument("--led-chain", type=int, default=3, help="Panels chained horizontally (default 3)")
    p.add_argument("--led-parallel", type=int, default=1)
    p.add_argument("--led-brightness", type=int, default=70)
    p.add_argument("--led-gpio-mapping", default="adafruit-hat-pwm",
                   help="regular | adafruit-hat | adafruit-hat-pwm (default)")
    p.add_argument("--led-slowdown-gpio", type=int, default=2, help="2 for Pi 3, 4 for Pi 4")
    p.add_argument("--led-pwm-lsb-nanoseconds", type=int, default=130)
    return p.parse_args()


# ---------------------------------------------------------------------------
# Event source: minimal SSE reader with reconnect, stdlib only.
# ---------------------------------------------------------------------------

def sse_reader(args: argparse.Namespace, events: "queue.Queue[dict]", stop: threading.Event) -> None:
    url = args.url.rstrip("/") + "/api/display/stream"
    if args.token:
        url += "?token=" + urllib.parse.quote(args.token)
    backoff = 1.0
    while not stop.is_set():
        try:
            req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                print(f"[sse] connected to {url}", file=sys.stderr)
                backoff = 1.0
                for raw in resp:
                    if stop.is_set():
                        return
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue  # keepalive comments, blank separators
                    try:
                        events.put(json.loads(line[5:].strip()))
                    except json.JSONDecodeError:
                        pass
        except Exception as exc:  # noqa: BLE001 — any network error → reconnect
            if stop.is_set():
                return
            print(f"[sse] disconnected ({exc}); retrying in {backoff:.0f}s", file=sys.stderr)
            stop.wait(backoff)
            backoff = min(backoff * 2, 30.0)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

class Renderer:
    """Renders text frames onto the matrix (or the terminal in --emulate)."""

    def __init__(self, args: argparse.Namespace):
        self.width = args.led_cols * args.led_chain
        self.height = args.led_rows * args.led_parallel
        self.color = tuple(int(c) for c in args.color.split(","))
        # Size the font to fill ~80% of panel height; Pillow sizes by em, so
        # probe with a Cyrillic string to get real cap/descender coverage.
        size = self.height
        while size > 4:
            font = ImageFont.truetype(args.font, size)
            box = font.getbbox("Українська Щрифт")
            if box[3] - box[1] <= self.height - 2:
                break
            size -= 1
        self.font = font
        self.emulate = args.emulate
        self.matrix = None
        if not args.emulate:
            from rgbmatrix import RGBMatrix, RGBMatrixOptions  # noqa: PLC0415 — optional hardware dep

            opts = RGBMatrixOptions()
            opts.rows = args.led_rows
            opts.cols = args.led_cols
            opts.chain_length = args.led_chain
            opts.parallel = args.led_parallel
            opts.brightness = args.led_brightness
            opts.hardware_mapping = args.led_gpio_mapping
            opts.gpio_slowdown = args.led_slowdown_gpio
            opts.pwm_lsb_nanoseconds = args.led_pwm_lsb_nanoseconds
            self.matrix = RGBMatrix(options=opts)
            self.canvas = self.matrix.CreateFrameCanvas()

    def text_image(self, text: str, dim: bool = False) -> Image.Image:
        box = self.font.getbbox(text)
        w = max(box[2] - box[0], 1)
        img = Image.new("RGB", (w, self.height))
        color = tuple(c // 3 for c in self.color) if dim else self.color
        y = (self.height - (box[3] - box[1])) // 2 - box[1]
        ImageDraw.Draw(img).text((-box[0], y), text, font=self.font, fill=color)
        return img

    def blit(self, img: Image.Image, x_offset: int) -> None:
        frame = Image.new("RGB", (self.width, self.height))
        frame.paste(img, (x_offset, 0))
        if self.matrix:
            self.canvas.SetImage(frame)
            self.canvas = self.matrix.SwapOnVSync(self.canvas)
        elif self.emulate:
            pass  # terminal emulation prints per message, not per frame

    def clear(self) -> None:
        self.blit(Image.new("RGB", (1, self.height)), 0)


def show_message(renderer: Renderer, text: str, args: argparse.Namespace, stop: threading.Event,
                 dim: bool = False) -> None:
    """Scroll (or statically hold) one message. Returns early on stop."""
    if renderer.emulate:
        style = "interim" if dim else "final"
        print(f"[display:{style}] {text}")
        stop.wait(min(args.static_secs, 1.0))
        return
    img = renderer.text_image(text, dim=dim)
    if img.width <= renderer.width:
        renderer.blit(img, (renderer.width - img.width) // 2)
        stop.wait(args.static_secs)
        return
    # Scroll right-to-left: enter from the right edge, exit fully left.
    frame_dt = 1.0 / 60
    step = max(1, round(args.scroll_pps * frame_dt))
    x = renderer.width
    while x > -img.width and not stop.is_set():
        renderer.blit(img, x)
        x -= step
        time.sleep(frame_dt)


def main() -> None:
    args = parse_args()
    renderer = Renderer(args)
    events: "queue.Queue[dict]" = queue.Queue()
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    threading.Thread(target=sse_reader, args=(args, events, stop), daemon=True).start()

    finals: list[str] = []
    interim: str | None = None
    while not stop.is_set():
        # Drain everything that arrived; keep finals ordered, last interim only.
        try:
            while True:
                ev = events.get(timeout=0.1 if (finals or interim) else 0.5)
                kind = ev.get("kind")
                if kind == "final":
                    finals.append(ev.get("text", ""))
                elif kind == "interim":
                    interim = ev.get("text", "")
                elif kind == "clear":
                    finals.clear()
                    interim = None
                    renderer.clear()
        except queue.Empty:
            pass
        if finals:
            interim = None  # a finished line supersedes any preview
            show_message(renderer, finals.pop(0), args, stop)
        elif interim and args.show_interim:
            text, interim = interim, None
            show_message(renderer, text, args, stop, dim=True)
        else:
            renderer.clear()

    renderer.clear()


if __name__ == "__main__":
    main()
