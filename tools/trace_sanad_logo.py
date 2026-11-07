"""Trace Sanad logo PNG to SVG and PDF-compatible .ai."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import vtracer
from PIL import Image

SRC = Path(
    r"C:\Users\TS\.cursor\projects\c-Users-TS-Downloads-clicks-workspace\assets"
    r"\c__Users_TS_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"Sanad_Logo_Blue_Vertical-a4630953-6985-4a63-a81d-77e14cd2a1d2.png"
)
OUT_DIR = Path(r"c:\Users\TS\Downloads")
SVG_PATH = OUT_DIR / "Sanad_Logo_Blue_Vertical.svg"
AI_PATH = OUT_DIR / "Sanad_Logo_Blue_Vertical.ai"


def prepare_trace_rgba(img: Image.Image) -> np.ndarray:
    arr = np.array(img.convert("RGBA"))
    rgb = arr[..., :3].astype(np.int16)
    lum = rgb.max(axis=2)
    out = np.full_like(arr, 255)
    colored = lum > 35
    out[colored] = arr[colored]
    # Dark-on-black letters: force brand slate where pixel is faint but not background
    faint = (lum > 8) & (lum <= 35)
    out[faint] = np.array([35, 58, 74, 255], dtype=np.uint8)
    return out


def svg_to_pdf_ai(svg_text: str, ai_path: Path) -> None:
    from reportlab.graphics import renderPDF
    from svglib.svglib import svg2rlg

    import tempfile

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".svg", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(svg_text)
        tmp_path = tmp.name

    drawing = svg2rlg(tmp_path)
    if drawing is None:
        raise RuntimeError("svglib failed to parse traced SVG")

    pdf_path = ai_path.with_suffix(".pdf")
    renderPDF.drawToFile(drawing, str(pdf_path))

    # PDF-compatible Illustrator file (opens in Illustrator as vector artwork)
    pdf_bytes = pdf_path.read_bytes()
    ai_path.write_bytes(pdf_bytes)
    pdf_path.unlink(missing_ok=True)

    Path(tmp_path).unlink(missing_ok=True)


def main() -> None:
    img = Image.open(SRC)
    w, h = img.size
    rgba = prepare_trace_rgba(img)
    trace_png = OUT_DIR / "Sanad_Logo_Blue_Vertical_trace_src.png"
    Image.fromarray(rgba, "RGBA").save(trace_png)

    vtracer.convert_image_to_svg_py(
        str(trace_png),
        str(SVG_PATH),
        colormode="color",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=3,
        color_precision=8,
        layer_difference=12,
        corner_threshold=55,
        length_threshold=3.5,
        max_iterations=12,
        splice_threshold=45,
        path_precision=4,
    )
    svg = SVG_PATH.read_text(encoding="utf-8")

    try:
        svg_to_pdf_ai(svg, AI_PATH)
    except Exception as exc:  # noqa: BLE001
        # Fallback: embed SVG in minimal PDF via pypdf + reportlab placeholder message
        print("svglib path failed:", exc)
        raise

    print(f"SVG: {SVG_PATH} ({SVG_PATH.stat().st_size} bytes)")
    print(f"AI:  {AI_PATH} ({AI_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
