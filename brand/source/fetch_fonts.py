#!/usr/bin/env python3
"""Downloads the static Outfit and Inter weights used by the logo and the brand guide.

Both families are licensed under the SIL Open Font License and served by Google Fonts.
"""
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fonts')
FAMILIES = {'Outfit': (400, 500, 600, 700), 'Inter': (400, 500, 600, 700)}

os.makedirs(OUT, exist_ok=True)
for family, weights in FAMILIES.items():
    for weight in weights:
        # The CSS v1 endpoint serves a static TrueType instance per weight.
        css = urllib.request.urlopen(f'https://fonts.googleapis.com/css?family={family}:{weight}').read().decode()
        url = re.search(r'url\((https://[^)]+\.ttf)\)', css).group(1)
        target = os.path.join(OUT, f'{family}-{weight}.ttf')
        urllib.request.urlretrieve(url, target)
        print('font', target)
