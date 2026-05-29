import re
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "index.html"
content = path.read_text(encoding="utf-8")
replacement = """<section class="page active" id="page-landing">
  <div id="splitLandingMount" class="split-landing-mount" aria-label="Brieftick landing"></div>
</section>

"""
pattern = r'<section class="page active" id="page-landing">.*?<!-- =+\s*\n     LIVE DASHBOARD'
new_content, n = re.subn(
    pattern,
    replacement + "<!-- ============================================================\n     LIVE DASHBOARD",
    content,
    count=1,
    flags=re.DOTALL,
)
if not n:
    raise SystemExit("Landing replace failed")
path.write_text(new_content, encoding="utf-8")
print("OK: replaced landing section")
