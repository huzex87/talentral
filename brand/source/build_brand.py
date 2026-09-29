#!/usr/bin/env python3
"""Builds the Talentral logo set as SVG from exact geometry and outlined type.

    python3 fetch_fonts.py    # once: downloads Outfit (wordmark, tagline)
    python3 build_brand.py    # writes ../logo/*.svg
    node export.js            # PNG sizes, favicon.ico and the PDF brand guide

The brand name is read from docs/master-plan-source/brand.js, so the logo,
the documents and the product share one source of truth.
"""
import math
import os
import re

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
FONTS = os.path.join(HERE, 'fonts')
OUT = os.path.join(HERE, '..', 'logo')

with open(os.path.join(ROOT, 'docs', 'master-plan-source', 'brand.js'), encoding='utf-8') as fh:
    NAME = re.search(r"name:\s*'([^']+)'", fh.read()).group(1)

TAGLINE = ('VERIFIED SKILLS. ', 'REAL WORK.')

# Palette (see brand/README.md for roles and contrast ratios).
MIDNIGHT = '#0D1230'  # dark brand surface
INK = '#101733'       # text and mark head on light backgrounds
WHITE = '#FFFFFF'
MUTED = '#5B6482'     # secondary text on light
MIST = '#C7CCE0'      # secondary text on dark
TEAL = '#14B8A6'      # accent on dark
TEAL_700 = '#0F766E'  # accent text on light

# The mark: a person with open arms (the T of Talentral) and the dot as the head.
# Gradient runs from learning (violet) through proof (blue) to work (teal).
ARMS_STOPS = [(0, '#8B3DFF'), (0.5, '#5B49F2'), (1, '#2E6BFF')]
STEM_STOPS = [(0, '#2E5BFF'), (0.5, '#1D8FD4'), (1, '#14C8B4')]
LIFT = 6  # upward lift of the arms, in mark units
ARM_LEFT, ARM_LEFT_R = (140, 190 + LIFT), 36
ARM_RIGHT, ARM_RIGHT_R = (366, 178 - LIFT), 48
STEM_D = 'M262 204 H344 V346 C344 390 316 424 276 432 C266 434 262 427 262 417 Z'
HEAD = (398, 84 - LIFT, 38)
MARK_BOX = (104, 40, 436, 434)  # x0, y0, x1, y1 of the whole mark in mark units


def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def tapered_bar(c1, r1, c2, r2):
    """Two circles joined by their outer tangents: a pill that thickens to the right."""
    (x1, y1), (x2, y2) = c1, c2
    base = math.atan2(y2 - y1, x2 - x1)
    off = math.acos((r1 - r2) / math.hypot(x2 - x1, y2 - y1))
    top, bot = base - off, base + off

    def pt(cx, cy, r, a):
        return f'{fmt(cx + r * math.cos(a))} {fmt(cy + r * math.sin(a))}'

    return (f'M{pt(x1, y1, r1, top)} L{pt(x2, y2, r2, top)} '
            f'A{r2} {r2} 0 0 1 {pt(x2, y2, r2, bot)} L{pt(x1, y1, r1, bot)} '
            f'A{r1} {r1} 0 1 1 {pt(x1, y1, r1, top)} Z')


ARMS_D = tapered_bar(ARM_LEFT, ARM_LEFT_R, ARM_RIGHT, ARM_RIGHT_R)


def gradient(gid, stops, x1, y1, x2, y2):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'gradientUnits="userSpaceOnUse">{s}</linearGradient>')


def mark_defs(p):
    """Gradient and clip definitions for one mark; p prefixes ids so several marks can share a file."""
    return (gradient(f'{p}arms', ARMS_STOPS, 104, 0, 414, 0)
            + gradient(f'{p}stem', STEM_STOPS, 0, 204, 0, 434)
            + f'<linearGradient id="{p}fold" x1="0" y1="{214 - LIFT}" x2="0" y2="{268 - LIFT}" gradientUnits="userSpaceOnUse">'
              '<stop offset="0" stop-color="#0A1250" stop-opacity="0.38"/>'
              '<stop offset="1" stop-color="#0A1250" stop-opacity="0"/></linearGradient>'
            + f'<clipPath id="{p}clip"><path d="{STEM_D}"/></clipPath>')


def mark_body(p, head, mono=None):
    """The mark in mark units. mono: one flat colour for single-colour versions."""
    if mono:
        return (f'<path d="{STEM_D}" fill="{mono}"/><path d="{ARMS_D}" fill="{mono}"/>'
                f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}" fill="{mono}"/>')
    return (f'<path d="{STEM_D}" fill="url(#{p}stem)"/>'
            f'<rect x="250" y="190" width="110" height="110" fill="url(#{p}fold)" clip-path="url(#{p}clip)"/>'
            f'<path d="{ARMS_D}" fill="url(#{p}arms)"/>'
            f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}" fill="{head}"/>')


class Text:
    """Shaped, kerned text converted to outlines (no font needed to display the SVG)."""

    def __init__(self, text, font_file, size, tracking_em=0.0):
        path = os.path.join(FONTS, font_file)
        face = hb.Face(hb.Blob.from_file_path(path))
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(hb.Font(face), buf, {'kern': True, 'liga': False})
        tt = TTFont(path)
        glyphs, order = tt.getGlyphSet(), tt.getGlyphOrder()
        s = size / face.upem
        track = tracking_em * face.upem
        x, parts, bounds = 0, [], BoundsPen(glyphs)
        infos = list(zip(buf.glyph_infos, buf.glyph_positions))
        for i, (info, pos) in enumerate(infos):
            name = order[info.codepoint]
            m = (s, 0, 0, -s, (x + pos.x_offset) * s, -pos.y_offset * s)
            pen = SVGPathPen(glyphs, ntos=fmt)
            glyphs[name].draw(TransformPen(pen, m))
            glyphs[name].draw(TransformPen(bounds, m))
            parts.append(pen.getCommands())
            x += pos.x_advance + (track if i < len(infos) - 1 else 0)
        self.d = ' '.join(parts)
        self.advance = x * s  # pen position after the last glyph (includes trailing spaces)
        self.x0, self.y0, self.x1, self.y1 = bounds.bounds  # tight ink bounds, baseline at y=0
        self.width = self.x1 - self.x0
        self.cap = tt['OS/2'].sCapHeight * s


def svg(view, body, defs='', title=f'{NAME} logo'):
    x, y, w, h = view
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fmt(x)} {fmt(y)} {fmt(w)} {fmt(h)}" '
            f'width="{fmt(w)}" height="{fmt(h)}" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{defs}</defs>{body}</svg>\n')


def write(name, content):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fh:
        fh.write(content)
    print('logo', name)


MX0, MY0, MX1, MY1 = MARK_BOX
MW, MH = MX1 - MX0, MY1 - MY0


def mark_file(theme, mono=None):
    head = WHITE if theme == 'dark' else INK
    pad = HEAD[2]
    body = mark_body('m-', head, mono)
    return svg((MX0 - pad, MY0 - pad, MW + 2 * pad, MH + 2 * pad), body, '' if mono else mark_defs('m-'), f'{NAME} mark')


def horizontal(theme, mono=None):
    """Mark left, wordmark right; the wordmark cap band is centred on the mark."""
    ink = mono or (WHITE if theme == 'dark' else INK)
    word = Text(NAME, 'Outfit-600.ttf', size=0.62 * MH, tracking_em=-0.01)
    gap = 0.22 * MH
    wx = MX1 + gap - word.x0
    baseline = (MY0 + MY1) / 2 + word.cap / 2
    body = (mark_body('h-', ink, mono)
            + f'<path transform="translate({fmt(wx)} {fmt(baseline)})" d="{word.d}" fill="{ink}"/>')
    pad = HEAD[2]
    x1 = MX1 + gap + word.width
    return svg((MX0 - pad, MY0 - pad, x1 - MX0 + 2 * pad, MH + 2 * pad), body, '' if mono else mark_defs('h-'))


def stacked(theme, tagline=True, mono=None):
    """Mark centred above the wordmark, optional tagline justified to the wordmark width."""
    ink = mono or (WHITE if theme == 'dark' else INK)
    soft = mono or (MIST if theme == 'dark' else MUTED)
    accent = mono or (TEAL if theme == 'dark' else TEAL_700)
    word = Text(NAME, 'Outfit-600.ttf', size=0.66 * MH, tracking_em=-0.01)
    cx = (MX0 + MX1) / 2
    wx = cx - word.width / 2 - word.x0
    baseline = MY1 + 0.14 * MH + word.cap
    body = mark_body('s-', ink, mono) + f'<path transform="translate({fmt(wx)} {fmt(baseline)})" d="{word.d}" fill="{ink}"/>'
    bottom = baseline
    if tagline:
        track = 0.16  # letter-spacing in em; the size is then chosen so the line spans the wordmark
        probe = Text(TAGLINE[0] + TAGLINE[1], 'Outfit-500.ttf', 100, track)
        size = 100 * word.width / probe.width
        first = Text(TAGLINE[0], 'Outfit-500.ttf', size, track)
        second = Text(TAGLINE[1], 'Outfit-500.ttf', size, track)
        tx = cx - word.width / 2 - first.x0
        ty = baseline + 0.30 * word.cap + first.cap
        adv = first.advance + track * size  # the second run starts one tracking step after the first
        body += (f'<path transform="translate({fmt(tx)} {fmt(ty)})" d="{first.d}" fill="{soft}"/>'
                 f'<path transform="translate({fmt(tx + adv)} {fmt(ty)})" d="{second.d}" fill="{accent}"/>')
        bottom = ty
    pad = HEAD[2] * 1.4
    left = min(MX0, cx - word.width / 2)
    right = max(MX1, cx + word.width / 2)
    return svg((left - pad, MY0 - pad, right - left + 2 * pad, bottom - MY0 + 2 * pad), body, '' if mono else mark_defs('s-'))


def wordmark(theme, mono=None):
    ink = mono or (WHITE if theme == 'dark' else INK)
    word = Text(NAME, 'Outfit-600.ttf', size=400, tracking_em=-0.01)
    pad = 0.12 * word.cap
    return svg((word.x0 - pad, -word.cap - pad, word.width + 2 * pad, word.cap + 2 * pad),
               f'<path d="{word.d}" fill="{ink}"/>', title=f'{NAME} wordmark')


def app_icon(radius=0.225):
    """Mark on a midnight tile: app icon, favicon and social avatar."""
    size = 1024
    scale = 0.60 * size / MH
    tx = size / 2 - (MX0 + MW / 2) * scale - 0.012 * size  # optical nudge: the head pulls the eye right
    ty = size / 2 - (MY0 + MH / 2) * scale
    r = radius * size
    body = (f'<rect width="{size}" height="{size}" rx="{fmt(r)}" fill="{MIDNIGHT}"/>'
            f'<g transform="translate({fmt(tx)} {fmt(ty)}) scale({fmt(scale)})">{mark_body("a-", WHITE)}</g>')
    return svg((0, 0, size, size), body, mark_defs('a-'), f'{NAME} app icon')


def social_card():
    """1200 x 630 link-preview card: stacked logo on midnight with the brand gradient rule."""
    w, h = 1200, 630
    logo = stacked('dark')
    inner = re.search(r'viewBox="([^"]+)"', logo).group(1).split()
    lx, ly, lw, lh = map(float, inner)
    scale = 0.72 * h / lh
    tx = w / 2 - (lx + lw / 2) * scale
    ty = h / 2 - (ly + lh / 2) * scale
    body_inner = logo.split('</defs>', 1)[1].rsplit('</svg>', 1)[0]
    defs = mark_defs('s-') + gradient('rule', [(0, '#7C3AED'), (0.5, '#2E5BFF'), (1, '#14B8A6')], 0, 0, w, 0)
    body = (f'<rect width="{w}" height="{h}" fill="{MIDNIGHT}"/><rect width="{w}" height="8" fill="url(#rule)"/>'
            f'<g transform="translate({fmt(tx)} {fmt(ty)}) scale({fmt(scale)})">{body_inner}</g>')
    return svg((0, 0, w, h), body, defs, f'{NAME} social card')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    slug = NAME.lower()
    for theme in ('light', 'dark'):
        suffix = '' if theme == 'light' else '-dark'
        write(f'{slug}-mark{suffix}.svg', mark_file(theme))
        write(f'{slug}-logo-horizontal{suffix}.svg', horizontal(theme))
        write(f'{slug}-logo-stacked{suffix}.svg', stacked(theme))
        write(f'{slug}-logo-stacked-no-tagline{suffix}.svg', stacked(theme, tagline=False))
        write(f'{slug}-wordmark{suffix}.svg', wordmark(theme))
    write(f'{slug}-logo-horizontal-mono-ink.svg', horizontal('light', mono=INK))
    write(f'{slug}-logo-horizontal-mono-white.svg', horizontal('dark', mono=WHITE))
    write(f'{slug}-mark-mono-ink.svg', mark_file('light', mono=INK))
    write(f'{slug}-mark-mono-white.svg', mark_file('dark', mono=WHITE))
    write(f'{slug}-app-icon.svg', app_icon())
    write(f'{slug}-social-card.svg', social_card())
