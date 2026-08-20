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
KEEP_BG = {"mark-google"}


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
        cropped.save(OUT / f"{name}.png")
        print(f"{name:22s} {box}  ({box[2]-box[0]}×{box[3]-box[1]}px @{scale:g}x)")


if __name__ == "__main__":
    main()
