# Creates the files the browser test uploads: python3 tests/make-fixtures.py [dir]
import os, sys
from PIL import Image, ImageDraw
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/e2e'
os.makedirs(out, exist_ok=True)
im = Image.new('RGB', (3200, 2400))
d = ImageDraw.Draw(im)
for y in range(2400):
    d.line([(0, y), (3200, y)], fill=(30 + int(y / 2400 * 180), 20 + int(y / 2400 * 90), 60))
d.ellipse((1100, 300, 2100, 1300), fill=(250, 210, 120))
im.save(os.path.join(out, 'place.jpg'), quality=92)
open(os.path.join(out, 'brief.pdf'), 'wb').write(b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
