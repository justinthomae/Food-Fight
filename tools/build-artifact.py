#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file (practice mode only) for quick sharing/previews.
Usage: python3 tools/build-artifact.py [out.html]"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
def inline(m):
    tag = m.group(0)
    if 'data-site-only' in tag:
        return ''
    src = re.search(r'src="([^"]+)"', tag).group(1)
    return '<script>\n' + (root / src).read_text() + '\n</script>'
html = re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>', inline, html)
# merge the separate scripts into one so class/const declarations share scope exactly as in the browser
blocks = re.findall(r'<script>\n(.*?)\n</script>', html, re.S)
html = re.sub(r'<script>\n.*?\n</script>\n?', '', html, flags=re.S)
html = html.replace('</body>', '<script>\n' + '\n;\n'.join(blocks) + '\n</script>\n</body>')
# artifact host supplies the document shell, charset and viewport
for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</html>\s*', r'<head>\s*', r'</head>\s*', r'<body>\s*', r'</body>\s*',
            r'<meta charset[^>]*>\s*', r'<meta name="viewport"[^>]*>\s*']:
    html = re.sub(pat, '', html, flags=re.I)
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / 'dist' / 'food-fight-artifact.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print('wrote', out)
