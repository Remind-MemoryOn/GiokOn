#!/usr/bin/env python3
"""신규 웹 Figma export(@4x)에서 공용 아이콘·워드마크를 잘라낸다.

컨테이너에서 www.figma.com egress 가 막혀 get_design_context 가 준 SVG URL 을 받을 수 없다.
대신 사용자가 export 해 준 화면 PNG(@4x)에서 **디자인 실측 좌표**로 크롭한다.
좌표는 프레임 로컬(화면=1440 · 모달=카드 폭)이며 배율은 파일 폭에서 계산한다(현재 4.0).

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
ELDER = "요양보호사 페이지_어르신 관리 상세 페이지.png"
ELDER_EDIT = "요양보호사 페이지_어르신 관리 기본정보수정.png"
SESSIONS = "요양보호사 페이지_세션 기록.png"
ANALYSIS = "요양보호사 페이지_분석페이지.png"
JOURNAL = "요양보호사 페이지_요양일지.png"
SHARES = "요양보호사 페이지_공개 관리.png"
ORG = "요양보호사 페이지_기관 관리.png"
SETTINGS = "요양보호사 페이지_설정.png"
G_CONNECT = "보호자 페이지_어르신 연결 전.png"
CHRONICLES = "요양보호사 페이지_어르신 관리 연대기목록.png"
SESSION_LIST = "요양보호사 페이지_세션 목록.png"
CHAT = "요양보호사 페이지_대화 기록.png"
ANALYSIS_PAGE = "요양보호사 페이지_분석페이지.png"
ANALYSIS_ELDER = "요양보호사 페이지_개인별 종합분석.png"
JOURNAL_WRITE = "요양보호사 페이지_요양일지 작성 타이핑.png"
JOURNAL_PHOTO = "요양보호사 페이지_요양일지 작성 사진첨부.png"
# 모달 프레임 export 는 카드만 담고 있어 좌표가 **프레임 로컬**이다.
CHRON_MODAL = "연대기 상세 정보.png"
# ⚠️ 부품 export 는 아직 @1x 다 — 같은 파일명으로 @4x 를 덮어써 주면 그대로 선명해진다.
REGISTER = "components/Frame 19.png"
LOGIN = "회원가입 페이지1.png"
LANDING = "서비스 소개 페이지.png"
SIGNUP = "회원가입 페이지2.png"

# (출력이름, 원본, x1, y1, x2, y2)  — 프레임 로컬 좌표(FRAME_WIDTH 참고)
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
    # ── 어르신 기본정보 수정(178:486) 아이콘 ──
    ("icon-camera",      ELDER_EDIT, 554.0,  551.0,  607.0,  604.0),
    ("icon-plus",        ELDER_EDIT, 438.0, 1003.0,  461.0, 1026.0),
    ("icon-search-field",ELDER_EDIT, 774.0,  892.6,  799.0,  917.6),
    # ── 연대기 목록(198:506) 아이콘 — 같은 글리프라도 렌더 크기가 달라 새로 자른다 ──
    ("icon-pencil-lg",   CHRONICLES, 1141.0,  443.0, 1169.0,  471.0),
    ("icon-trash-lg",    CHRONICLES, 1200.0,  443.3, 1226.97, 470.35),
    ("icon-calendar-sm", CHRONICLES, 1226.0,  266.2, 1248.0,  288.2),
    # ⚠️ ∨ 는 회전 노드라 metadata 좌표(1369, 281.8)가 렌더 위치가 아니다.
    #    export 잉크 실측(1357~1369 × 274~281.75)으로 자른다.
    ("icon-chevron-down-sm", CHRONICLES, 1357.0, 274.0, 1369.0, 281.8),
    # ── 연대기 추가/상세 모달(196:271·198:991) ──
    ("icon-chevron-down-md", CHRON_MODAL, 214.13, 162.0, 233.42, 175.02),
    ("icon-close-sm",        CHRON_MODAL, 176.0,  660.0, 187.0,  671.0),
    # ── 어르신 등록 모달(172:330) ──
    ("icon-photo-upload",    REGISTER, 161.0, 170.0, 196.0, 205.0),
    # ── 세션 목록(178:877) ──
    ("icon-clock-sm",        SESSION_LIST, 594.0, 462.45, 616.0, 484.47),
    # 행 링크·"돌아가기" 의 chevron(12.18×18.73). 대시보드 리스트용(15×21)과 비율이 달라
    # 따로 자른다. ⚠️ 회전 노드라 metadata 좌표(1226.99)가 아니라 렌더 위치(1214.81)에서 자른다.
    ("icon-chevron-right-sm",SESSION_LIST, 1214.81, 440.28, 1226.99, 459.01),
    # ── 대화 기록(178:1052) ── AI 말풍선 옆 봇 아바타
    ("avatar-ai",            CHAT, 402.0, 450.0, 454.0, 502.0),
    # ── 분석(225:1669) 전체 요약 4칸 아이콘(선 아이콘, 대시보드의 원형 배지와 다르다) ──
    ("an-elders",   ANALYSIS_PAGE, 442.0, 549.4, 490.0, 582.4),
    ("an-sessions", ANALYSIS_PAGE, 673.0, 547.4, 709.0, 583.4),
    ("an-minutes",  ANALYSIS_PAGE, 899.0, 547.4, 935.0, 583.4),
    ("an-response", ANALYSIS_PAGE, 1130.0, 547.4, 1166.0, 583.4),
    # 변화율 4칸 아이콘(추세 화살표·표정·말풍선·시계)
    ("an-trend-recall",  ANALYSIS_PAGE, 443.0, 3196.3, 479.0, 3215.7),
    ("an-trend-emotion", ANALYSIS_PAGE, 673.0, 3187.3, 709.0, 3223.3),
    ("an-trend-part",    ANALYSIS_PAGE, 897.0, 3189.3, 931.5, 3222.7),
    ("an-trend-resp",    ANALYSIS_PAGE, 1122.0, 3188.3, 1158.0, 3224.3),
    # ── 개인별 종합 분석(228:4091) ──
    # 종합 대화 참여도 3칸의 원형 배지(주황 원 50 + 흰 글리프) — 원째로 자른다.
    ("an-badge-minutes",  ANALYSIS_ELDER,  431.0,  486.0,  481.0,  536.0),
    ("an-badge-sessions", ANALYSIS_ELDER,  736.0,  482.0,  786.0,  532.0),
    ("an-badge-rate",     ANALYSIS_ELDER, 1036.0,  485.0, 1086.0,  535.0),
    # 인지 효과 종합 평가의 표정 마크 76 — 시안은 **긍정 상태 1종만** 그려져 있다.
    ("an-verdict-good",   ANALYSIS_ELDER,  810.0, 3216.78, 886.0, 3292.82),
    # ── 요양일지 작성(221:283·221:1196) ──
    # 입력 방식 탭 아이콘 — 활성 탭은 주황 바탕에 흰 글리프라 **비활성 프레임에서** 자른다.
    ("icon-keyboard",     JOURNAL_PHOTO,   489.0,  603.25,  515.0,  621.5),
    ("icon-mic",          JOURNAL_WRITE,   802.0,  601.46,  818.5,  623.48),
    ("icon-camera-tab",   JOURNAL_WRITE,  1106.0,  602.46, 1129.0,  622.48),
    ("icon-upload",       JOURNAL_WRITE,   433.0, 1030.79,  449.0, 1046.38),
    ("icon-sparkle",      JOURNAL_WRITE,   602.0, 1024.78,  628.33, 1051.13),
    ("icon-chevron-down-lg", JOURNAL_WRITE, 1242.13, 459.0, 1261.42, 472.02),
    ("icon-clock-field",  JOURNAL_WRITE,   768.0,  455.35,  790.0,  477.37),
    ("icon-image",        JOURNAL_PHOTO,   483.0,  722.0,   518.5,  757.0),
    # ── 설정(121:598) ── 같은 글리프라도 렌더 크기가 달라 새로 자른다
    ("icon-pencil-md",    SETTINGS,      1296.0,  364.0, 1318.0,  386.0),
    ("icon-shield-md",    SETTINGS,       388.0, 2119.0,  409.27, 2144.99),
    ("icon-download",     SETTINGS,       418.0, 1015.9,  436.0, 1033.92),
    # ── 보호자 어르신 연결(31:616) 연결 과정 3단계 ──
    ("g-step-code",   G_CONNECT,  503.0,  994.66,  550.74, 1046.83),
    ("g-step-wait",   G_CONNECT,  831.0,  998.66,  876.0,  1043.69),
    ("g-step-done",   G_CONNECT, 1152.0, 1002.0,  1198.0, 1040.0),
    # ⚠️ 화살표는 좌우 반전 노드라 metadata(698.22,1037.81)가 렌더 위치가 아니다 — 잉크 실측.
    ("g-step-arrow",  G_CONNECT,  684.0, 1016.0,   698.25, 1038.0),
    ("icon-close",       ELDER_EDIT, 1245.0, 1078.0, 1263.0, 1096.0),
    # ── 어르신 상세(161:373) 아이콘 — 잉크 실측으로 자른다 ──
    ("icon-pencil",      ELDER,   1218.0,  207.0, 1236.0,  225.0),
    ("icon-caregiver",   ELDER,   1007.5,  444.7, 1029.5,  466.6),
    ("icon-calendar",    ELDER,   1007.0,  501.2, 1032.0,  526.6),
    ("icon-clock",       ELDER,   1007.0,  557.2, 1032.0,  582.6),
    ("icon-shield",      ELDER,    866.0,  761.0,  886.0,  785.3),
    ("icon-check-circle",ELDER,    897.0,  845.0,  931.0,  879.0),
    ("icon-revoke",      ELDER,   1262.0,  771.2, 1278.0,  789.6),
    # ⚠️ 복사 아이콘은 잉크에 딱 맞춰 자르면 좌상단 코너가 글리프라 alpha_matte 가
    #    배경/글리프를 뒤집는다 → 사방 2px 여유를 두고 자른다(렌더 시 그만큼 되뺀다).
    ("icon-copy",        ELDER,   1000.9, 1397.7, 1022.1, 1418.1),
    ("icon-refresh",     ELDER,   1163.0, 1400.7, 1180.3, 1417.1),
    ("icon-trash",       ELDER,   1145.5, 3295.2, 1175.5, 3325.6),
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
# 카메라 버튼은 어두운 사진 오버레이 위의 원형 버튼이라 알파 추출로는 사각 잔상이 남는다.
CIRCLE = {"stat-elders", "stat-sessions", "stat-chronicles", "stat-ai", "avatar-default", "icon-camera", "avatar-ai"}
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


# 모달 프레임 export 는 화면(1440)이 아니라 카드 폭이다 — 배율 계산의 기준을 바꾼다.
FRAME_WIDTH = {CHRON_MODAL: 1054.0, REGISTER: 1054.0}


# 시안에 없는 사이드바 메뉴(감독, 파일럿 W2)의 아이콘 — 새로 그리지 않고 **시안 글리프를 다시 칠한다**.
# 로그인 화면의 눈(icon-eye)을 사이드바 기본 회색·활성 주황으로 칠해 두 판을 만든다(모양·알파는 그대로).
RECOLOR = [
    ("nav-supervision",    "icon-eye", (123, 124, 124)),  # nav-* 기본판의 잉크 #7b7c7c
    ("nav-supervision-on", "icon-eye", (233, 130, 43)),   # nav-*-on 활성판의 잉크 #e9822b(accent)
]


def recolor(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """알파(모양)는 두고 색만 바꾼다."""
    out = Image.new("RGBA", im.size, (*rgb, 0))
    out.putalpha(im.getchannel("A"))
    return out


def main() -> None:
    for name, srcname, x1, y1, x2, y2 in CROPS:
        src = SRC / srcname
        im = Image.open(src).convert("RGBA")
        scale = im.size[0] / FRAME_WIDTH.get(srcname, 1440.0)
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
    for name, base, rgb in RECOLOR:
        recolor(Image.open(OUT / f"{base}.png").convert("RGBA"), rgb).save(OUT / f"{name}.png")
        print(f"{name:22s} ← {base} 다시 칠함 {rgb}")


if __name__ == "__main__":
    main()
