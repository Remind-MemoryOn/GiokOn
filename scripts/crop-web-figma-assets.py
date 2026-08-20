#!/usr/bin/env python3
"""신규 웹 Figma export(@4x)에서 공용 아이콘·워드마크를 잘라낸다.

컨테이너에서 www.figma.com egress 가 막혀 get_design_context 가 준 SVG URL 을 받을 수 없다.
대신 사용자가 export 해 준 화면 PNG(@4x)에서 **디자인 실측 좌표**로 크롭한다.
좌표는 1440 캔버스 기준이며 배율은 파일에서 계산한다(현재 4.0).

사용: python3 scripts/crop-web-figma-assets.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

SRC = Path("apps/web/assets/figma")
OUT = Path("apps/web/src/assets/ui")
OUT.mkdir(parents=True, exist_ok=True)

DASH = "요양보호사 페이지_대시보드.png"
# 사이드바는 요양보호사 전 화면이 같은 좌표를 쓴다. 활성 항목만 주황이라
# "그 메뉴가 활성인 화면"에서 활성본을, 다른 화면에서 비활성본을 크롭한다.
ELDERS = "요양보호사 페이지_어르신 관리.png"
SESSIONS = "요양보호사 페이지_세션 기록.png"
ANALYSIS = "요양보호사 페이지_분석페이지.png"
JOURNAL = "요양보호사 페이지_요양일지.png"
SHARES = "요양보호사 페이지_공개 관리.png"
ORG = "요양보호사 페이지_기관 관리.png"
SETTINGS = "요양보호사 페이지_설정.png"
LOGIN = "회원가입 페이지1.png"
LANDING = "서비스 소개 페이지.png"
SIGNUP = "회원가입 페이지2.png"

# (출력이름, 원본, x1, y1, x2, y2)  — 1440 캔버스 좌표
CROPS = [
    # 탑바
    ("wordmark",        DASH,   63.0,   70.0,  216.0,   93.4),
    ("icon-search",     DASH,  584.0,   70.0,  607.5,   94.0),
    # 벨은 알림 배지(동적 카운트)가 우상단을 가린다. 좌우 대칭이므로 가려지지 않은
    # 왼쪽 절반(1044~중심 1056.5)만 잘라 미러링해 복원한다.
    ("icon-bell",       DASH, 1044.0,   68.5, 1056.5,   95.0),
    ("avatar-default",  DASH, 1105.0,   62.0, 1145.0,  102.0),
    ("icon-chevron-down", DASH, 1358.0,  74.0, 1379.0,   90.0),
    # 사이드바
    # 비활성(회색)
    # 어르신 관리 액션 버튼의 열쇠 아이콘 — 노드가 회전돼 있어 metadata 박스가 렌더 위치와
    # 다르다. export 잉크 실측(997.75~1015.75 × 206.5~225.0)으로 자른다.
    ("icon-key",        ELDERS,   997.5,  206.2, 1016.0,  225.3),
    ("nav-dashboard",   ELDERS,   71.0,  189.0,  102.0,  212.0),
    ("nav-elders",      DASH,     76.0,  266.0,   98.0,  298.0),
    ("nav-sessions",    DASH,     76.0,  346.0,   97.0,  372.0),
    ("nav-analysis",    DASH,     74.0,  425.0,   99.0,  450.0),
    ("nav-journal",     DASH,     74.0,  504.0,  100.0,  531.0),
    ("nav-shares",      DASH,     75.0,  583.0,   99.0,  609.0),
    ("nav-org",         DASH,     73.0,  663.0,  100.0,  689.0),
    ("nav-settings",    DASH,     75.0,  741.0,   99.0,  766.0),
    # 활성(주황) — 각 메뉴가 선택된 화면에서
    ("nav-dashboard-on", DASH,     71.0,  189.0,  102.0,  212.0),
    ("nav-elders-on",   ELDERS,   76.0,  266.0,   98.0,  298.0),
    ("nav-sessions-on", SESSIONS, 76.0,  346.0,   97.0,  372.0),
    ("nav-analysis-on", ANALYSIS, 74.0,  425.0,   99.0,  450.0),
    ("nav-journal-on",  JOURNAL,  74.0,  504.0,  100.0,  531.0),
    ("nav-shares-on",   SHARES,   75.0,  583.0,   99.0,  609.0),
    ("nav-org-on",      ORG,      73.0,  663.0,  100.0,  689.0),
    ("nav-settings-on", SETTINGS, 75.0,  741.0,   99.0,  766.0),
    ("nav-logout",      DASH,   71.0, 2104.0,  101.0, 2134.0),
    # 통계 카드 아이콘(원 + 글리프 통째로)
    ("stat-elders",     DASH,  347.0,  684.0,  397.0,  734.0),
    ("stat-sessions",   DASH,  617.0,  683.0,  667.0,  733.0),
    ("stat-chronicles", DASH,  887.0,  684.0,  937.0,  734.0),
    ("stat-ai",         DASH, 1158.0,  684.0, 1208.0,  734.0),
    # 리스트 행 화살표
    ("icon-chevron-right", DASH, 1265.0, 1037.0, 1280.0, 1058.0),
    # 로그인 화면 (15:443)
    ("mark-naver",      LOGIN, 479.0,  778.0,  508.0,  807.0),
    ("mark-kakao",      LOGIN, 663.0,  777.0,  694.0,  807.0),
    ("mark-google",     LOGIN, 870.0,  780.0,  893.0,  804.0),
    ("icon-eye",        LOGIN, 939.0,  455.0,  971.0,  477.0),
    ("icon-checkbox",   LOGIN, 435.0,  538.0,  458.0,  561.0),
    # 서비스 소개 (1:13) — 일러스트·장식은 SVG 를 받을 수 없어 화면에서 잘라 쓴다
    ("landing-hero",        LANDING,  828.0,  325.0, 1238.0,  586.0),
    ("landing-wordmark-hero", LANDING, 118.0,  515.0,  381.0,  556.0),
    ("landing-spot-1",      LANDING,  227.0, 1096.0,  394.0, 1217.0),
    ("landing-spot-2",      LANDING,  672.0, 1096.0,  783.0, 1218.0),
    ("landing-spot-3",      LANDING, 1078.0, 1110.0, 1186.0, 1219.0),
    ("landing-wordmark-cta", LANDING, 483.0, 1390.0,  688.0, 1423.0),
    ("landing-wordmark-sub", LANDING, 314.0, 1807.0,  578.0, 1849.0),
    ("landing-illust-share", LANDING, 1051.0, 1675.0, 1319.0, 1846.0),
    ("landing-feat-elders",  LANDING,  221.0, 2051.0,  274.0, 2130.0),
    ("landing-feat-records", LANDING,  521.0, 2053.0,  598.0, 2129.0),
    ("landing-feat-analysis",LANDING,  842.0, 2058.0,  908.0, 2119.0),
    ("landing-feat-share",   LANDING, 1159.0, 2055.0, 1219.0, 2126.0),
    ("landing-notch",        LANDING,  630.0, 1528.0,  820.0, 1626.0),
    ("landing-bars",         LANDING,   19.0,  616.0, 1440.0,  884.0),
    # 온보딩(15:444)의 역할 카드 "아이콘"은 라디오 버튼(링 25 + 안쪽 점)이라
    # 에셋이 아니라 폼 컨트롤이다 → 선택 상태를 색으로 표현해야 해 코드로 렌더한다.
]


def alpha_matte(im: Image.Image) -> Image.Image:
    """단색 배경 위의 2색 아이콘에서 배경을 투명화한다.

    Figma export 는 배경이 흰색(비활성) 또는 주황 틴트(활성)로 채워져 있다. 그대로 쓰면
    둥근 활성 pill 위에 사각 배경이 얹힌다. 배경색과 글리프색의 거리로 알파를 만들어
    가장자리 안티에일리어싱까지 보존한다.
    """
    px = im.load()
    w, h = im.size
    bg = px[0, 0][:3]
    # 배경에서 가장 먼 색 = 글리프색
    glyph, far = bg, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            c = px[x, y][:3]
            d = sum((a - b) ** 2 for a, b in zip(c, bg))
            if d > far:
                far, glyph = d, c
    if far == 0:
        return im
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y][:3]
            d = sum((a - b) ** 2 for a, b in zip(c, bg)) ** 0.5
            a = min(255, round(255 * d / (far ** 0.5)))
            op[x, y] = (*glyph, a)
    return out


def circle_mask(im: Image.Image) -> Image.Image:
    """원형 아이콘(통계 배지·아바타)의 원 바깥만 투명화한다."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, w - 1, h - 1), fill=255)
    out = im.copy()
    out.putalpha(mask)
    return out


# 원형으로 잘라낼 에셋(원 바깥 투명) — 나머지는 배경색 알파 추출
CIRCLE = {"stat-elders", "stat-sessions", "stat-chronicles", "stat-ai", "avatar-default"}
# 좌우 대칭 복원이 필요한 에셋(가림 제거)
MIRROR = {"icon-bell"}
# 다색 에셋 — 단색 알파 추출을 하면 색이 뭉개진다. 흰 배경 그대로 둔다
# (구글 마크는 흰 칩 위에 놓이므로 배경이 보이지 않는다).
KEEP_BG = {
    "mark-google",
    # 랜딩 일러스트·장식 — 다색·그라데이션이라 단색 알파 추출이 불가.
    # 배경(흰색/그라데이션) 위 같은 좌표에 얹으므로 배경째 잘라 쓴다.
    "landing-hero", "landing-wordmark-hero", "landing-spot-1", "landing-spot-2",
    "landing-spot-3", "landing-wordmark-cta", "landing-wordmark-sub",
    "landing-illust-share", "landing-feat-elders", "landing-feat-records",
    "landing-feat-analysis", "landing-feat-share", "landing-notch", "landing-bars",
}


def flood_transparent(im: Image.Image, tol: int = 12) -> Image.Image:
    """가장자리에서 번져 들어가며 **바깥 배경만** 투명화한다.

    로고·일러스트는 안쪽에도 흰색이 있어(로봇 얼굴) 단순 색상 키로는 속까지 뚫린다.
    테두리에서 flood fill 하면 글리프 내부 흰색은 보존된다. 히어로 로봇처럼
    그라데이션 위에 놓이는 에셋에 쓴다.
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    ref = px[0, 0][:3]
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    stack += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y][:3]
        if max(abs(a - b) for a, b in zip(c, ref)) > tol:
            continue
        px[x, y] = (*c, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                stack.append((nx, ny))
    return im


BAR_RGB = (233, 130, 43)
BAR_ALPHA = 51  # rgba(233,130,43,0.2)


def bars_alpha(crop: Image.Image, full: Image.Image, bg_x: int, y0: int) -> Image.Image:
    """히어로 장식 바를 배경에서 분리해 투명 PNG 로 만든다.

    바는 그라데이션 배경 위에 얹힌 20% 주황이라 배경째 잘라 쓰면 CSS 그라데이션과
    미세하게 어긋나 상자 경계가 보인다. 같은 행의 바 없는 열(bg_x)을 배경 기준으로
    삼아 커버리지를 구하고, 색은 원본 토큰(#e9822b 20%)으로 되돌린다.
    """
    w, h = crop.size
    src = crop.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        bg = full.getpixel((bg_x, y0 + y))[:3]
        # 배경 위에 20% 주황을 얹었을 때의 색(완전 커버리지 기준값)
        full_cov = tuple(round(b + (c - b) * 0.2) for b, c in zip(bg, BAR_RGB))
        denom = sum(abs(a - b) for a, b in zip(full_cov, bg)) or 1
        for x in range(w):
            c = src[x, y][:3]
            cov = min(1.0, sum(abs(a - b) for a, b in zip(c, bg)) / denom)
            dst[x, y] = (*BAR_RGB, round(BAR_ALPHA * cov))
    return out


def main() -> None:
    for name, srcname, x1, y1, x2, y2 in CROPS:
        src = SRC / srcname
        im = Image.open(src).convert("RGBA")
        scale = im.size[0] / 1440.0
        box = tuple(round(v * scale) for v in (x1, y1, x2, y2))
        cropped = im.crop(box)
        if name in CIRCLE:
            cropped = circle_mask(cropped)
        elif name not in KEEP_BG:
            cropped = alpha_matte(cropped)
        if name in MIRROR:
            half = cropped
            full = Image.new("RGBA", (half.size[0] * 2, half.size[1]))
            full.paste(half, (0, 0))
            full.paste(half.transpose(Image.FLIP_LEFT_RIGHT), (half.size[0], 0))
            cropped = full
        if name == "landing-hero":  # 그라데이션 위에 놓여 흰 배경이 상자로 보인다
            cropped = flood_transparent(cropped)
        if name == "landing-bars":
            cropped = bars_alpha(cropped, im, round(10 * scale), round(616 * scale))
            cropped = cropped.resize((cropped.size[0] // 2, cropped.size[1] // 2), Image.LANCZOS)
        cropped.save(OUT / f"{name}.png")
        print(f"{name:22s} {box}  ({box[2]-box[0]}×{box[3]-box[1]}px @{scale:g}x)")


if __name__ == "__main__":
    main()
