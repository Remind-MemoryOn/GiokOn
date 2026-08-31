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
    '178:486': '요양보호사 페이지_어르신 관리 기본정보수정.png',
    '198:506': '요양보호사 페이지_어르신 관리 연대기목록.png',
    '178:877': '요양보호사 페이지_세션 목록.png',
    '178:787': '요양보호사 페이지_세션 기록.png',
    '178:1052': '요양보호사 페이지_대화 기록.png',
    '225:1669': '요양보호사 페이지_분석페이지.png',
    '228:3722': '요양보호사 페이지_개인별 분석.png',
    '228:4091': '요양보호사 페이지_개인별 종합분석.png',
    '228:4628': '요양보호사 페이지_대화 분석 목록.png',
    '228:4430': '요양보호사 페이지_대화 분석 상세.png',
    '205:1039': '요양보호사 페이지_요양일지.png',
    '135:1288': '요양보호사 페이지_공개 관리.png',
    '140:121': '요양보호사 페이지_공개 관리 전체.png',
    '146:429': '요양보호사 페이지_공개 관리 요양일지.png',
    '146:824': '요양보호사 페이지_공개 관리 AI 회상 대화 요약.png',
    '146:1067': '요양보호사 페이지_공개 이력.png',
    '131:959': '요양보호사 페이지_기관 관리.png',
    '121:598': '요양보호사 페이지_설정.png',
    '31:616': '보호자 페이지_어르신 연결 전.png',
    '50:528': '보호자 페이지_어르신 연결 후.png',
    '50:543': '보호자 페이지_공개된 소식.png',
    '55:1488': '보호자 페이지_요양일지.png',
    '55:1920': '보호자 페이지_AI 회상 대화 요약.png',
    '55:2035': '보호자 페이지_공유 사진.png',
    '50:1102': '보호자 페이지_요양일지 상세.png',
    '55:1258': '보호자 페이지_대화 요약 상세.png',
    '69:320': '보호자 페이지_여러 어르신 연결.png',
    '69:195': 'components/Frame 9.png',
    '334:697': '보호자 페이지_설정.png',
    '96:94': '보호자 페이지_종합 분석.png',
    '104:1041': '보호자 페이지_대화 분석.png',
    '104:1830': '보호자 페이지_대화 분석 상세.png',
    '146:422': 'components/Frame 11.png',
    '153:1811': 'components/Frame 14.png',
    '207:1147': '요양보호사 페이지_요양일지 목록.png',
    '221:283': '요양보호사 페이지_요양일지 작성 타이핑.png',
    '221:1060': '요양보호사 페이지_요양일지 작성 음성 입력.png',
    '221:1196': '요양보호사 페이지_요양일지 작성 사진첨부.png',
    '198:991': '연대기 상세 정보.png',
    '196:271': '연대기 추가.png',
    '172:330': 'components/Frame 19.png',
    '196:272': '회상 세션 설계.png',
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
        fig_img = Image.open(fig_path).convert('RGB')
        # 화면 export 는 @4x 지만 모달·부품 export 는 @1x 로 나온 것들이 있다.
        # 구현 렌더는 항상 @4x 라 배율을 맞춰 준다(위치 비교라 확대 보간은 무해).
        frame_w = screen.get('width', 1440)
        if abs(fig_img.width / frame_w - S) > 0.01:
            fig_img = fig_img.resize((round(frame_w * S), round(fig_img.height * frame_w * S / fig_img.width)), Image.LANCZOS)
        fig = np.asarray(fig_img)
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
