#!/usr/bin/env python3
"""Figma export(@4x) ↔ 구현 렌더(@4x) **잉크 위치** 대조.

DOM 대조(figma-audit.mjs)는 요소 박스를 재지만, 텍스트는 line-height 에 따라
박스와 글자(잉크) 위치가 갈린다. 이 도구는 두 이미지의 같은 영역에서 행/열
잉크 프로파일을 만들어 **상호상관이 최대가 되는 이동량**을 구한다 = 눈에 보이는 어긋남.

사용: python3 scripts/figma-ink.py [노드id ...]
  구현 렌더는 `pnpm -F @giokon/web figma:shots` 로 /tmp/audit/<node>.png 에 만든다.
"""
import json, os, re, sys
import numpy as np
from PIL import Image

# 이용안내(@4x 4218px)처럼 큰 export 는 기본 한도를 넘는다 — 우리가 만든 파일이라 안전.
Image.MAX_IMAGE_PIXELS = None

S = 4  # export 배율
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIGMA_DIR = os.path.join(WEB, 'assets', 'figma')
SHOT_DIR = os.environ.get('AUDIT_OUT', '/tmp/audit')
PAD = 14  # 상하 탐색 여유(px, 1440 기준)
TOL = float(os.environ.get('INK_TOL', '1.5'))

PNG = {
    '1:13': '서비스 소개 페이지.png',
    '1:17': '이용안내 페이지.png',
    '15:443': '회원가입 페이지1.png',
    '15:444': '회원가입 페이지2.png',
    '111:148': '회원가입 페이지- 로그인 찾기.png',
    '111:170': '회원가입 페이지- 비밀번호 찾기.png',
    '114:247': '회원가입 페이지-  비밀번호 재설정.png',
    '118:300': '요양보호사 페이지_대시보드.png',
    '161:207': '요양보호사 페이지_어르신 관리.png',
    '161:373': '요양보호사 페이지_어르신 관리 상세 페이지.png',
}


def profiles(img, x0, y0, x1, y1):
    """영역의 행·열 잉크량. 배경(중앙값)에서 벗어난 정도를 합산한다."""
    h, w = img.shape[:2]
    a = img[max(0, int(y0 * S)):min(h, int(y1 * S)), max(0, int(x0 * S)):min(w, int(x1 * S))]
    if a.size == 0:
        return None, None
    bg = np.median(a.reshape(-1, 3), axis=0)
    d = np.abs(a.astype(np.int16) - bg).sum(axis=2).astype(np.float32)
    d[d < 40] = 0
    return d.sum(axis=1), d.sum(axis=0)


def best_shift(pa, pb, limit):
    """pb 를 s 만큼 옮겼을 때 pa 와 가장 잘 겹치는 s(픽셀, 1440 기준)."""
    if pa is None or pb is None or pa.sum() == 0 or pb.sum() == 0:
        return None, 0.0
    n = min(len(pa), len(pb))
    pa, pb = pa[:n], pb[:n]
    best, score = 0, -1.0
    for s in range(-limit * S, limit * S + 1):
        shifted = np.roll(pb, -s)
        if s > 0:
            shifted[-s:] = 0
        elif s < 0:
            shifted[:-s] = 0
        denom = np.linalg.norm(pa) * np.linalg.norm(shifted)
        if denom == 0:
            continue
        c = float(np.dot(pa, shifted) / denom)
        if c > score:
            best, score = s, c
    return best / S, score


def main():
    spec = json.load(open('/tmp/audit/spec.json'))
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    fails, checked = [], 0
    for screen in spec:
        if only and screen['node'] not in only:
            continue
        fig_path = os.path.join(FIGMA_DIR, PNG[screen['node']])
        shot_path = os.path.join(SHOT_DIR, screen['node'].replace(':', '_') + '.png')
        if not os.path.exists(shot_path):
            fails.append((screen['name'], screen['node'], '(렌더 없음)', shot_path))
            continue
        fig = np.asarray(Image.open(fig_path).convert('RGB'))
        imp = np.asarray(Image.open(shot_path).convert('RGB'))
        for p in screen['probes']:
            if p['kind'] != 'text' or p.get('skipInk') or p.get('pending'):
                continue
            checked += 1
            f = p['figma']
            x0, x1 = f['x'] - 6, f['x'] + f['w'] + 6
            y0, y1 = f['y'] - PAD, f['y'] + f['h'] + PAD
            rf, cf = profiles(fig, x0, y0, x1, y1)
            ri, ci = profiles(imp, x0, y0, x1, y1)
            dy, sy = best_shift(rf, ri, PAD)
            dx, sx = best_shift(cf, ci, 10)
            bad = []
            if dy is None:
                bad.append('잉크 없음')
            else:
                if abs(dy) > TOL and sy > 0.5:
                    bad.append(f'잉크 Δy {dy:+.2f} (일치도 {sy:.2f})')
                if dx is not None and abs(dx) > TOL and sx > 0.5:
                    bad.append(f'잉크 Δx {dx:+.2f} (일치도 {sx:.2f})')
                if sy <= 0.5:
                    bad.append(f'프로파일 불일치(일치도 {sy:.2f}) — 내용/서체 다름')
            if bad and not p.get('acceptInk'):
                fails.append((screen['name'], screen['node'], p['name'], ' · '.join(bad)))
    if fails:
        print('✗ 잉크 대조 편차:\n')
        last = ''
        for name, node, probe, detail in fails:
            if name != last:
                print(f'  ── {name} ({node})')
                last = name
            print(f'     {probe}\n        {detail}')
        print(f'\n일치 {checked - len(fails)} / 편차 {len(fails)} (허용 ±{TOL}px)')
        sys.exit(1)
    print(f'✓ 잉크 대조 통과 ({checked}개 텍스트 · 허용 ±{TOL}px)')


main()
