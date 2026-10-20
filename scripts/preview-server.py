#!/usr/bin/env python3
"""Serve the marketing site and the built client portal together.

Client Login points at /portal/. That app is the Vite build in portal/dist,
including client-side routes like /portal/login.
"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "portal" / "dist"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        url_path = unquote(urlparse(path).path)
        if url_path == "/portal" or url_path.startswith("/portal/"):
            return str(self._portal_file(url_path))
        return super().translate_path(path)

    def _portal_file(self, url_path: str) -> Path:
        portal_root = PORTAL.resolve()
        rel = url_path[len("/portal") :].lstrip("/")
        candidate = (portal_root / rel).resolve() if rel else portal_root / "index.html"
        if not str(candidate).startswith(str(portal_root)):
            return portal_root / "index.html"
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if candidate.is_file():
            return candidate
        return portal_root / "index.html"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if not (PORTAL / "index.html").is_file():
        raise SystemExit("portal/dist is missing. From the portal folder, run: npm run build")
    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    print(f"Serving site and portal at http://127.0.0.1:{args.port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
