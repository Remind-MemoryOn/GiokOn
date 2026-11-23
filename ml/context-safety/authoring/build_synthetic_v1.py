"""학습·검증 자료 v1 작성 스크립트 (CTX-CLS-S3 · 2026-11-23).

Claude 가 직접 쓴 기본 문장(가상 화자, 실제 어르신 발화 아님)에 전사 변형을 붙여 JSONL 로 쓴다.
- 사용자 확정(2026-11-22 R2): 검수 없이 작성자 라벨로 학습 · 범주별 100 + 비대상 600.
- 라벨 규약: ml/context-safety/LABELING.md v1.1(시점 현재·최근·과거).
- 변형: ① 원문 ② 띄어쓰기 없는 전사 ③ 추임새. 직전 AI 질문은 변형마다 다르다.
  라벨이 달라질 수 있는 부분 전사·범위 밖·전사 오류 문장은 원문 하나만.
- 분할: 같은 문장의 변형 = 같은 variantGroup. 묶음마다 7번째(블록 안 순서)를 검증(dev)으로.
같은 입력이면 같은 파일이 나온다(난수 없음).

실행(저장소 루트): python ml/context-safety/authoring/build_synthetic_v1.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATE = "2026-11-23"
GUIDE = "1.1"

AI_QUESTIONS = [
    "어릴 때 살던 동네는 어떤 곳이었어요?", "오늘 아침은 뭐 드셨어요?", "요즘 하루는 어떻게 보내세요?",
    "젊으셨을 때 무슨 일을 하셨어요?", "가족분들 이야기 좀 해 주실래요?", "고향은 어디세요?",
    "요즘 몸은 좀 어떠세요?", "좋아하시는 노래가 있으세요?", "어제는 뭐 하셨어요?",
    "기억에 남는 명절이 있으세요?", "결혼하실 때 이야기 좀 해 주세요.", "요즘 마음은 좀 어떠세요?",
    "손주분들은 자주 오세요?", "시장 구경 좋아하셨어요?", "학교 다니실 때는 어떠셨어요?",
    "제일 좋아하시는 음식은 뭐예요?", "요즘 잠은 잘 주무세요?", "봄이 되면 생각나는 게 있으세요?",
    "같이 사시는 분은 잘 해 주세요?", "오늘 기분은 어떠세요?", "예전에 살던 집은 어땠어요?",
    "친구분들하고는 뭐 하고 노셨어요?", "지금 계신 곳은 편하세요?", "오늘은 무슨 이야기 해 볼까요?",
]
FILLERS = ["아이고, ", "음… ", "그게, ", "에휴, ", "저기, "]
PERSONAS = [f"p{n:02d}" for n in range(1, 9)]

# 블록: (이름, 기본 라벨, 태그, 문장 목록). 문장 = "텍스트" 또는 ("텍스트", {덮어쓰기}).
# 덮어쓰기 키: c 내용 · k 위기 범주 · s 주체 · t 시점 · m 표현 · i 의사 · x 해석 · v 전사 변형 · ctx 고정 문맥 · one 변형 없이 원문만
D = dict  # 짧게


def L(c, k=None, s="self", t="present", m="direct", i="unknown", x="sufficient"):
    return {"c": c, "k": k, "s": s, "t": t, "m": m, "i": i, "x": x}


BLOCKS: list[tuple[str, dict, list[str], list]] = [
    ("self_harm", L(["crisis_appeal"], ["self_harm"]), ["self_harm_direct"], [
        "요즘은 그냥 다 그만 살고 싶어", "이렇게 살아서 뭐 하나 싶어", "자식들한테 짐만 되고, 내가 없어지는 게 낫지",
        "밤마다 약을 한꺼번에 먹어 버릴까 생각해", ("어제는 옥상에 올라가 봤어, 뛰어내릴까 하고", D(t="recent")),
        "그냥 눈 감고 안 깼으면 좋겠어", "살 이유가 하나도 없어", "영감 따라가고 싶어, 요즘은 매일",
        "죽어야지 죽어야지 그 생각만 해", "이제 그만 끝내고 싶어, 사는 거", "끈을 하나 사다 놨어, 그거 하려고",
        "내가 죽으면 다들 편할 거야", "세상 떠나는 게 차라리 낫겠다 싶어", "칼을 보면 자꾸 이상한 생각이 들어",
        "아침에 눈 뜨는 게 싫어, 안 떴으면 해", ("어젯밤에 수면제를 몇 알 더 먹었어, 그냥 자고 싶어서", D(t="recent")),
        "살고 싶은 마음이 없어졌어", "이 나이에 더 살아서 뭐 해, 그만 가고 싶어", "내 손으로 끝내 버릴까 봐 무서워",
        ("어제 저수지 앞에서 한참 서 있었어, 빠져 버릴까 하고", D(t="recent")), "아무도 나 안 찾을 테니 사라지고 싶어",
        "하루하루가 지옥이야, 끝내고 싶어", "죽는 방법을 자꾸 생각하게 돼", "요새는 살아 있는 게 미안해",
        "나 같은 건 없어져야 해", "약통을 다 비워 버리면 편하겠지", "이번 겨울 못 넘기고 가 버렸으면 좋겠어",
        ("인자 고마 살기 싫다", D(v="dialect_sim")), ("죽어불고 싶당께, 요새는", D(v="dialect_sim")),
        "지금 당장이라도 따라 죽고 싶어", "이 집에서 혼자 죽는 날만 기다려", "그냥 다 놓아 버리고 싶어, 목숨까지",
        "살 만큼 살았어, 이제 그만 가게 해 줘", "목을 매는 게 낫겠다는 생각까지 했어",
    ]),
    ("medical_emergency", L(["crisis_appeal"], ["medical_emergency"]), ["medical_direct"], [
        "가슴이 쥐어짜듯이 아파, 지금", "숨이 차서 말을 못 하겠어", "왼쪽 팔이 저리고 힘이 안 들어가",
        "머리가 깨질 것 같고 눈앞이 캄캄해", "갑자기 말이 잘 안 나와, 혀가 꼬여",
        ("방금 화장실에서 넘어졌는데 못 일어나겠어", D(t="recent")), "어지러워서 앉아 있을 수가 없어",
        "입이 한쪽으로 돌아간 것 같아", "숨이 턱 막혀, 공기가 안 들어와", "가슴이 답답하고 식은땀이 나",
        "배가 찢어질 것처럼 아파", ("아까 피를 토했어", D(t="recent")), "다리에 감각이 없어졌어 갑자기",
        "심장이 너무 빨리 뛰어서 무서워", "눈이 갑자기 한쪽이 안 보여", "아까부터 토하고 열이 펄펄 나",
        ("어제 계단에서 굴렀는데 허리를 못 펴겠어", D(t="recent")), "숨 쉴 때마다 가슴이 찌르듯 아파",
        "정신이 자꾸 아득해져", "몸에 힘이 하나도 없고 손이 막 떨려", "목에 뭐가 걸려서 숨이 안 쉬어져",
        "쌕쌕거리고 숨이 가빠", "약 먹고 나서 얼굴이 붓고 숨이 막혀", "머리를 부딪쳤는데 피가 안 멈춰",
        "방금 핑 돌아서 쓰러질 뻔했어", ("가슴이 억수로 아파가 숨을 못 쉬겠다", D(v="dialect_sim")),
        ("어지러버가 몬 서 있겠다", D(v="dialect_sim")), "말하다가 단어가 안 떠오르고 팔이 이상해",
        "허리 아래로 힘이 쭉 빠졌어", "아이고 가슴이야, 지금 너무 아파", "식은땀이 나고 속이 메스꺼워, 가슴도 아프고",
        "넘어져서 엉덩이뼈가 부러진 것 같아", "열이 너무 나서 덜덜 떨려", ("어젯밤에 잠깐 정신을 잃었었어", D(t="recent")),
    ]),
    ("abuse", L(["crisis_appeal"], ["abuse"]), ["abuse_direct"], [
        "며느리가 며칠째 밥을 안 줘", "아들이 술 먹고 오면 나를 때려", ("어제 손자가 내 팔을 비틀었어", D(t="recent")),
        "여기 선생 하나가 나를 자꾸 꼬집어", "딸이 내 통장을 가져가서 안 돌려줘", "방에 가둬 놓고 밖에 못 나가게 해",
        "말 안 들으면 밥을 굶긴다고 했어", "영감이 아직도 소리 지르고 물건을 던져", "아들이 나더러 빨리 죽으라고 욕해",
        "몸에 멍이 들었는데 누가 했는지 말 못 해", "기저귀를 하루 종일 안 갈아 줘", "돈 안 주면 나가라고 해서 무서워",
        ("어제 아들이 밀쳐서 넘어졌어", D(t="recent")), "사위가 내 연금을 다 써 버려", "밤에 문을 잠가서 화장실도 못 가",
        "약을 일부러 안 줘", "때리고 나서 아무한테도 말하지 말래", "화가 나면 손찌검을 해",
        ("어제 집에서 나가라고 짐을 다 내놨어", D(t="recent")), "나보고 쓸모없는 늙은이라고 매일 그래",
        ("오늘 아침에도 머리채를 잡혔어", D(t="recent")), "전화를 못 하게 휴대폰을 뺏어 갔어",
        "며칠씩 아무도 못 오게 하고 나를 혼자 둬", "인감도장을 가져가서 내 집을 팔아 버렸어",
        "씻길 때 일부러 거칠게 해서 너무 아파", "밥 먹을 때 숟가락으로 머리를 쳐", "집에 들어가기가 무서워, 또 맞을까 봐",
        ("아들내미가 내를 자꾸 때린다 아이가", D(v="dialect_sim")), ("며느리가 밥을 안 주드라고잉", D(v="dialect_sim")),
        "화장실에 오래 있으면 문을 발로 차", "손목을 묶어 놓고 나갔어", "몸이 아파도 병원에 안 데려가",
        "내가 말하면 더 혼난다고 조용히 하래", ("어제는 뺨을 맞았어", D(t="recent")),
    ]),
    ("acute_distress", L(["acute_distress"]), ["distress_direct"], [
        "너무 괴로워서 견딜 수가 없어", "하루하루 버티기가 너무 힘들어", "무서워서 아무것도 못 하겠어",
        "요즘 잠도 못 자고 너무 괴로워", "혼자 있는 게 너무 무서워, 미치겠어", "머릿속이 하얘지고 너무 불안해",
        "계속 눈물만 나고 멈추지가 않아", "이렇게 아픈 거 더는 못 참겠어", "다 무너지는 것 같아, 너무 힘들어",
        "아무도 없고 너무 외로워서 못 견디겠어", "지금 몸이 너무 아파서 울고 싶어", "매일 밤 악몽 때문에 미칠 것 같아",
        "불안해서 손이 계속 떨려", "너무 서러워서 요즘 가슴이 미어져", "아무것도 할 수 없을 만큼 힘들어",
        ("통증이 너무 심해서 어젯밤 한숨도 못 잤어", D(t="recent")), ("어제부터 계속 무서워서 떨고 있어", D(t="recent")),
        "이 고통이 언제 끝날지 모르겠어", "생각이 너무 많아서 머리가 터질 것 같아", "하루 종일 가슴이 두근거리고 불안해서 못 살겠어",
        "마음이 너무 아파서 아무 생각도 못 하겠어", "정말 너무 괴롭다", ("오늘도 하루 종일 울었어", D(t="recent")),
        "여기 있는 게 견디기가 너무 힘들어", "너무 무섭고 떨려, 누가 좀 와 줬으면", "화가 나고 답답해서 미치겠어",
        "요즘은 매일이 고통이야", ("밤새 아파서 끙끙 앓았어", D(t="recent")), "버틸 힘이 하나도 없어",
        "혼자서는 감당이 안 돼, 너무 힘들어", "슬프고 괴로워서 밥도 안 넘어가", "머리가 너무 아파서 아무것도 못 하겠어",
        "이 아픔을 어떻게 참아야 할지 모르겠어", "자식들한테 짐만 되는 것 같아서 괴로워",
    ]),
    ("rest_request", L(["rest_request"], i="rest"), ["rest_direct"], [
        ("오늘은 여기까지만 하자", D(i="end")), "좀 쉬었다 하면 안 될까", ("피곤해서 그만하고 싶어", D(i="end")),
        "이따가 다시 얘기하자", "잠깐 누워 있어야겠어", ("목이 아파서 오늘은 그만 얘기할래", D(c=["rest_request", "physical_discomfort"], i="end")),
        ("다음에 또 하자, 오늘은 힘드네", D(i="end")), ("잠이 와서 더는 못 하겠어", D(i="end")), "쉬고 싶어요",
        ("이제 그만 들어가 볼래", D(i="end")), "밥 먹고 하자, 지금은 그만", ("오늘은 기운이 없어서 그만할게", D(i="end")),
        "눈이 감겨, 좀 자고 싶어", "화장실 좀 다녀올게, 잠깐 멈춰 줘", ("그만하고 텔레비전 볼래", D(i="end")),
        ("내일 하자, 오늘은 됐어", D(i="end")), ("이야기는 이 정도면 됐어", D(i="end")), "좀 조용히 쉬고 싶네",
        "숨 좀 돌리고 하자", ("오늘은 그만해도 될까요", D(i="end")),
        ("다리가 저려서 좀 쉬어야겠어", D(c=["rest_request", "physical_discomfort"])),
        ("지금은 말하기 싫고 쉬고 싶어", D(c=["rest_request", "refusal"])), ("손님 오셨어, 다음에 해", D(i="end")),
        ("약 먹을 시간이라 그만할게", D(i="end")), ("그만 끝내자", D(i="end")), "잠깐만, 쉬었다가",
        ("오늘은 너무 많이 했어, 그만", D(i="end")), "오후에 다시 하면 안 될까",
        ("머리가 띵해서 그만하고 싶어", D(c=["rest_request", "physical_discomfort"], i="end")), ("졸려서 못 하겠다", D(i="end")),
        ("됐어, 오늘은 그만", D(i="end")), "낮잠 좀 자야겠어", "이따 저녁에 또 하자", ("이제 끝낼래요", D(i="end")),
    ]),
    ("refusal", L(["refusal"]), ["refusal_direct"], [
        "그런 얘기 하기 싫어", ("날 좀 가만히 내버려 둬", D(i="end")), "왜 자꾸 그런 걸 물어", "대답 안 할 거야",
        "그건 말하고 싶지 않아", "상관하지 마", "그만 물어봐", "기분 나쁘게 왜 그래", "싫다니까", "몰라, 말 안 해",
        "그런 거 묻지 마세요", "내 얘기는 하고 싶지 않아", "귀찮게 하지 마", ("저리 가, 혼자 있고 싶어", D(i="end")),
        "그 얘기는 꺼내지도 마", "남의 집 일에 왜 참견이야", "안 해, 하기 싫어", "이런 거 왜 해야 돼",
        ("그만해, 듣기 싫어", D(c=["refusal", "rest_request"], i="end")), "시끄러워", ("됐어, 말 걸지 마", D(i="end")),
        "그건 비밀이야, 안 알려 줘", ("그런 건 기억하기도 싫어", D(c=["refusal", "sadness_grief"])), "꼬치꼬치 캐묻지 마",
        ("이거 재미없어, 안 할래", D(i="end")), "나는 그런 얘기 안 좋아해", "대꾸하기 싫어", ("아무 말도 하기 싫어", D(i="end")),
        ("기계랑 얘기하기 싫어", D(i="end")), "그만 좀 해, 짜증 나", "물어보지 마요", "그런 질문 하지 마",
        ("싫어, 다른 거 하자", D(i="switch")), "내 맘대로 할 거야, 참견 마",
    ]),
    # ── 비대상(대응 대상 아님) ─────────────────────────────────────────
    ("past_crisis", L(["crisis_appeal", "reminiscence"], ["self_harm"], t="past"), ["past_with_crisis_phrase"], [
        "젊을 때 너무 힘들어서 죽으려고 한 적이 있어", "전쟁 끝나고 살기 싫었던 때가 있었지",
        "남편 보내고 몇 년은 죽고만 싶었어", "옛날에 약을 먹은 적이 있었는데, 다 지난 일이야",
        "시집살이할 때 차라리 죽자 싶었지", "그 시절엔 살아서 뭐 하나 했어", "아들 잃고 나서 한동안 따라가고 싶었어",
        "사십 년 전에 강가에 간 적이 있어, 죽으려고", "젊어서는 세상 끝내고 싶다는 생각도 했지", "그때는 정말 살고 싶지 않았어",
        ("예전에 뇌졸중으로 쓰러진 적이 있어", D(k=["medical_emergency"])),
        ("십 년 전에 심장 수술했지, 그때 숨을 못 쉬었어", D(k=["medical_emergency"])),
        ("젊을 때 연탄가스 마시고 정신을 잃었었어", D(k=["medical_emergency"])),
        ("옛날에 넘어져서 다리가 부러졌었지", D(k=["medical_emergency"])),
        ("피란 갈 때 너무 굶어서 쓰러졌었어", D(k=["medical_emergency"])),
        ("삼십 년 전에 맹장이 터져서 죽을 뻔했지", D(k=["medical_emergency"])),
        ("옛날 탄광에서 일할 때 가슴이 막혀서 고생했어", D(k=["medical_emergency"])),
        ("예전엔 천식이 심해서 숨이 막혔었는데 지금은 괜찮아", D(k=["medical_emergency"])),
        ("어릴 때 물에 빠져서 숨을 못 쉬었던 기억이 나", D(k=["medical_emergency"])),
        ("방공호에 숨어서 숨도 제대로 못 쉬고 있었지", D(k=["medical_emergency"])),
        ("시어머니한테 젊을 때 많이 맞았어", D(k=["abuse"])), ("옛날 영감은 술 먹으면 손찌검을 했지", D(k=["abuse"])),
        ("어릴 때 아버지한테 회초리로 많이 맞았어", D(k=["abuse"])), ("젊어서 남편이 돈을 다 가져가 버렸지", D(k=["abuse"])),
        ("시집살이할 때 밥을 못 얻어먹었어", D(k=["abuse"])), ("옛날엔 며느리 때리는 게 흔했어, 나도 맞았고", D(k=["abuse"])),
        ("사십 년 전 공장에서 감독이 때리곤 했어", D(k=["abuse"])), ("젊을 때 시누이가 나를 방에 가둔 적이 있어", D(k=["abuse"])),
        ("그때는 남편이 무서워서 숨어 지냈지", D(k=["abuse"])), ("옛날 일이지만 많이 맞고 살았어", D(k=["abuse"])),
    ]),
    ("quote_other", L(["crisis_appeal"], ["self_harm"], s="other", m="quote"), ["quote_other"], [
        "옆집 할머니가 요즘 죽고 싶다고 하더라", ("친구가 어제 쓰러져서 병원에 갔대", D(k=["medical_emergency"], t="recent", m="direct")),
        ("우리 영감이 생전에 그만하자는 말을 자주 했지", D(c=["rest_request", "reminiscence"], k=None, t="past")),
        ("딸이 회사에서 맞았다고 울었어", D(k=["abuse"], t="recent")), ("아는 사람이 아들한테 맞고 산대", D(k=["abuse"])),
        ("뉴스에서 노인이 학대당했다고 하더라", D(k=["abuse"], t="recent")),
        ("할머니들이 다들 쉬고 싶다고 하더라고", D(c=["rest_request"], k=None)), ("우리 언니가 숨이 차서 고생한대", D(k=["medical_emergency"])),
        "동생이 요즘 살기 싫다고 전화가 와", ("손자가 학교에서 맞았대", D(k=["abuse"], t="recent")),
        ("엄마가 늘 그만하라고 말했지", D(c=["rest_request", "reminiscence"], k=None, t="past")),
        ("친구 남편이 지난달에 심장마비로 갔어", D(c=["crisis_appeal", "sadness_grief"], k=["medical_emergency"], t="recent", m="direct")),
        ("선생님이 그러는데 나는 좀 쉬어야 한대", D(c=["rest_request"], k=None, s="other")),
        ("아들이 힘들어서 못 견디겠다고 했어", D(c=["acute_distress"], k=None, t="recent")),
        ("옆방 할아버지가 밤새 아프다고 소리쳤어", D(c=["acute_distress"], k=None, t="recent", m="direct")),
        ("우리 엄마는 죽겠다 죽겠다 하면서도 오래 사셨어", D(c=["crisis_appeal", "reminiscence"], t="past", m="idiom")),
        ("드라마에서 여자가 약을 먹더라", D(t="recent", m="direct")),
        ("며느리가 그러는데 손자가 넘어져서 다쳤대", D(c=["crisis_appeal", "daily"], k=["medical_emergency"], t="recent")),
        ("친구가 그러는데 그 집 아들이 엄마를 때린대", D(k=["abuse"])),
        ("남편이 생전에 나 먼저 가면 따라오지 말라고 했어", D(c=["crisis_appeal", "reminiscence"], t="past")),
        ("이웃집에서 자꾸 싸우는 소리가 들려", D(c=["daily"], k=None, m="direct")),
        ("우리 언니는 요즘 아무 말도 하기 싫대", D(c=["refusal"], k=None)), ("손녀가 공부하기 싫다고 난리야", D(c=["refusal", "daily"], k=None, m="direct")),
        ("내 친구는 매일 쉬고 싶다 그래", D(c=["rest_request"], k=None)),
        ("간호사가 숨 쉬기 힘들면 바로 말하라고 했어", D(k=["medical_emergency"], t="future", m="hypothetical")),
    ]),
    ("negated", L(["crisis_appeal"], ["self_harm"], m="negated"), ["negation"], [
        "죽고 싶은 마음은 하나도 없어", ("아니야, 아픈 데는 없어", D(k=["medical_emergency"])),
        ("때리는 사람은 없어, 다들 잘해 줘", D(k=["abuse"])), ("숨 쉬는 건 괜찮아, 걱정 마", D(k=["medical_emergency"])),
        ("그만하고 싶은 건 아니고 조금 피곤할 뿐이야", D(c=["rest_request", "physical_discomfort"], k=None, i="continue")),
        ("가슴이 아픈 건 아니고 그냥 좀 답답해", D(c=["crisis_appeal", "physical_discomfort"], k=["medical_emergency"])),
        ("우울한 건 아니야, 그냥 심심해", D(c=["acute_distress", "daily"], k=None)), ("누가 나를 괴롭히진 않아", D(k=["abuse"])),
        ("죽겠다는 소리는 아니고 그냥 좀 힘들다는 거야", D(c=["crisis_appeal", "daily"])),
        ("쓰러질 정도는 아니야", D(k=["medical_emergency"])),
        ("싫은 건 아니고 무슨 말인지 몰라서 그래", D(c=["refusal", "confusion"], k=None)),
        ("혼자 있어도 하나도 안 무서워", D(c=["acute_distress"], k=None)),
        ("약을 많이 먹진 않았어, 하나만 먹었어", D(c=["crisis_appeal", "daily"])), ("밥은 잘 챙겨 줘, 굶지 않아", D(k=["abuse"])),
        ("내 몸에 손대는 사람 없어", D(k=["abuse"])), "살기 싫다는 생각은 안 해 봤어",
        ("괴롭지 않아, 오히려 좋아", D(c=["acute_distress"], k=None, i="continue")),
        ("그만두자는 말은 아니야, 계속 해", D(c=["rest_request"], k=None, i="continue")),
        ("아픈 건 다 나았어", D(c=["physical_discomfort"], k=None)), ("목숨 끊을 생각은 안 해, 걱정 마", D()),
    ]),
    ("idiom", L(["crisis_appeal", "daily"], ["self_harm"], m="idiom"), ["idiom"], [
        "배고파 죽겠다", "더워 죽겠네", ("손주 재롱에 웃겨 죽는 줄 알았어", D(t="recent")), ("보고 싶어 죽겠어, 우리 딸", D(c=["crisis_appeal", "sadness_grief"])),
        "심심해 죽겠다", ("좋아서 숨넘어갈 뻔했지", D(k=["medical_emergency"], t="past")), "일이 많아서 죽을 맛이야",
        ("허리 아파 죽겠네", D(c=["crisis_appeal", "physical_discomfort"])), "궁금해 죽겠네",
        ("목이 빠지게 기다렸어", D(c=["daily"], k=None, t="recent")), ("속이 터져 죽겠어, 손주가 말을 안 들어서", D()),
        "추워서 얼어 죽겠다", ("간 떨어지는 줄 알았어", D(c=["daily"], k=None, t="recent")),
        ("맛있어서 기절할 뻔했어", D(k=["medical_emergency"], t="recent")),
        ("웃다가 숨 막히는 줄 알았네", D(k=["medical_emergency"], t="recent")),
        ("평생 죽도록 일만 했지", D(c=["crisis_appeal", "reminiscence"], t="past")),
        ("미치겠네, 리모컨이 어디 갔지", D(c=["daily"], k=None)), ("숨이 넘어가게 뛰어왔어", D(k=["medical_emergency"], t="recent")),
        ("딸이 와서 좋아 죽겠어", D(t="recent")), "지겨워 죽겠어, 비가 계속 와서",
        ("그 생각하면 가슴이 아파", D(c=["sadness_grief", "reminiscence"], k=None)), ("속이 타, 아들이 연락이 없어서", D(c=["daily"], k=None)),
    ]),
    ("hypothetical", L(["crisis_appeal"], ["medical_emergency"], t="future", m="hypothetical"), ["hypothetical"], [
        "혹시 쓰러지면 어떡하나 걱정돼", ("나 죽으면 이 집은 누가 지키나", D(c=["daily"], k=None)),
        "만약에 숨이 막히면 이 단추를 누르래", ("요양원 가게 되면 맞지나 않을까 걱정이야", D(k=["abuse"])),
        "넘어지기라도 하면 큰일이지", "밤에 혼자 있다가 무슨 일 생기면 어떡해",
        ("아들이 화나면 또 때릴까 봐 걱정돼", D(k=["abuse"])), ("나중에 아파서 못 움직이면 그냥 가고 싶어", D(k=["self_harm"])),
        ("치료가 안 되면 차라리 죽는 게 낫겠지", D(k=["self_harm"])), "비 오는 날 미끄러지면 다칠 거야",
        "아무도 없을 때 쓰러지면 어쩌지", "이러다 숨 막혀 죽으면 어떡해", ("내가 아프면 누가 돌봐 줄까", D(c=["daily"], k=None)),
    ]),
    ("grief", L(["sadness_grief"]), ["grief"], [
        "영감이 너무 보고 싶어", ("먼저 간 아들 생각하면 마음이 아파", D(c=["sadness_grief", "reminiscence"])), "고향에 다시는 못 가니 서글퍼",
        "엄마 생각이 나서 눈물이 나네", "친구들이 다 떠나서 쓸쓸해", ("그 시절이 그리워", D(c=["sadness_grief", "reminiscence"])),
        "손주들이 안 오니 서운해", "남편 제삿날이 다가오니 마음이 무거워", ("키우던 강아지가 죽어서 슬퍼", D(t="recent")),
        ("그 생각하면 지금도 가슴이 미어져", D(m="idiom")), ("돌아가신 어머니가 꿈에 나왔어", D(t="recent")),
        ("우리 딸 시집갈 때 많이 울었지", D(c=["sadness_grief", "reminiscence"], t="past")), "혼자 밥 먹으니 쓸쓸하네",
        "옛집이 헐렸다니 마음이 허전해", "보고 싶은 사람이 너무 많아", "그때 잘해 줄걸, 후회돼",
        "영감 떠난 지 벌써 오 년이야", "자식들이 바빠서 얼굴 보기 힘들어 서운해", "그 노래 들으면 눈물이 나",
        ("친구 장례식에 다녀왔어, 마음이 안 좋아", D(t="recent")), "나만 남은 것 같아 외로워",
        "엄마가 해 주던 된장국이 그리워", "돌아가신 남편한테 미안한 게 많아",
        ("우리 아들 군대 갈 때 생각하면 짠해", D(c=["sadness_grief", "reminiscence"])), "꽃 피면 영감 생각이 더 나",
    ]),
    ("hard_negative", L(["reminiscence"], t="past"), ["hard_negative_reminiscence"], [
        "어릴 때 숨바꼭질하면 동생이 잘 없어졌어", ("오늘 아침에 죽 한 그릇 먹었어", D(c=["daily"], t="recent")),
        "옛날엔 시장에서 국수 장사를 했지", "장날에 소 잡는 걸 구경했어", ("주사 맞으러 보건소에 다녀왔어", D(c=["daily"], t="recent")),
        ("우리 집 강아지가 새끼를 낳았어", D(c=["daily"], t="recent")), ("손주가 칼싸움 놀이를 해", D(c=["daily"], t="present")),
        "옛날엔 약초 캐러 산에 다녔어", "김장할 때 배추를 칼로 반 갈랐지", ("아침에 혈압약 먹었어", D(c=["daily"], t="recent")),
        "젊을 때 수영을 잘해서 숨을 오래 참았어", "밧줄로 소를 묶어서 끌고 다녔지", "옛날 탄광에선 다들 고생했지",
        "낚시 가서 고기를 많이 잡았어", "영화에서 총 쏘는 장면이 무서웠어", "쥐약을 놔서 쥐를 잡았지",
        ("오늘 병원 가서 정기검진 받았어", D(c=["daily"], t="recent")), "학교 다닐 때 줄넘기를 잘했어",
        ("밤에 잠이 안 와서 라디오를 들었어", D(c=["daily"], t="recent")), "우리 영감은 바둑을 좋아했지",
        "고추 말리다가 소나기를 맞았어", "옛날엔 우물물을 길어 먹었어", "생선 장사할 때 칼질은 내가 잘했어",
        ("손주가 놀이터에서 넘어졌는데 금방 일어났어", D(c=["daily"], s="other", t="recent")),
        ("어제 목욕탕 다녀왔어", D(c=["daily"], t="recent")), "노래자랑 나가서 상 받았지",
        "아들이 어릴 때 개구쟁이라 많이 혼냈지", ("요즘은 화투 치면서 놀아", D(c=["daily"], t="present")),
        "옛날엔 겨울에 동상 걸리기 일쑤였어", "우리 동네 다리가 무너진 적이 있어",
    ]),
    ("discomfort", L(["physical_discomfort"]), ["physical_boundary"], [
        "무릎이 쑤셔, 비가 오려나", "요즘 허리가 좀 아파", "어깨가 결려서 팔 들기가 힘들어", "눈이 침침해",
        "오늘따라 좀 피곤하네", "소화가 잘 안 돼", "발이 시려", "기침이 좀 나", ("귀가 잘 안 들려서 크게 말해 줘", D(c=["physical_discomfort", "confusion"])),
        "다리가 좀 붓네", "이가 시려서 찬 거 못 먹어", ("어젯밤에 잠을 좀 설쳤어", D(t="recent")), "손가락 마디가 아파",
        "목이 칼칼해", "변비가 있어서 불편해",
    ]),
    ("confusion", L(["confusion"]), ["confusion"], [
        "여기가 어디예요?", "뭐라고 했어? 잘 못 들었어", "지금이 몇 년도지?", ("우리 엄마 언제 와?", D(x="insufficient")),
        "내가 왜 여기 있지", "누구세요?", "무슨 말인지 모르겠네", ("밥 먹었나? 기억이 안 나", D(t="recent")),
        ("아까 뭐 물어봤지?", D(t="recent")), "이게 무슨 기계야?",
    ]),
    ("out_of_scope", L(["unknown"], s="unknown", t="unknown", m="unknown", x="out_of_scope"), ["out_of_scope_tv"], [
        ("속보입니다 오늘 오전 고속도로에서 다중 추돌 사고가", D(one=True)),
        ("당신 죽고 싶어? 당장 나가!", D(c=["crisis_appeal"], k=["unknown"], one=True)),
        ("이 상품은 오늘 밤 열두 시까지만 할인합니다", D(one=True)),
        ("선생님 다음 분 들어오세요", D(one=True)), ("할머니 약 드실 시간이에요", D(one=True)),
    ]),
    ("partial_stt", L(["unknown"], m="unknown", x="insufficient"), ["partial_or_stt"], [
        ("죽고 싶…", D(c=["crisis_appeal"], k=["self_harm"], v="partial", one=True)),
        ("가슴이 너무…", D(c=["unknown"], t="unknown", v="partial", one=True)),
        ("숨이…", D(c=["crisis_appeal"], k=["medical_emergency"], v="partial", one=True)),
        ("아들이 또…", D(t="unknown", s="unknown", v="partial", one=True)),
        ("날 좀…", D(t="unknown", v="partial", one=True)),
        ("약을 다 먹었어요", D(c=["daily"], m="direct", x="sufficient", t="recent", v="stt_error_sim", ctx="오늘 아침 약은 챙겨 드셨어요?", one=True)),
        ("죽 먹고 싶어요", D(c=["daily"], m="direct", x="sufficient", v="stt_error_sim", ctx="점심에 뭐 드시고 싶으세요?", one=True)),
        ("딸이 나를 때려 줬어", D(c=["crisis_appeal"], k=["abuse"], m="direct", x="conflict", t="recent", v="stt_error_sim", ctx="어제 병원에는 누가 데려다 줬어요?", one=True)),
    ]),

    # ── 2026-11-23 보강: 위기 어휘가 다른 뜻으로 쓰인 비대상(1차 학습에서 '맞다·칼·굶다·외롭다'에 과하게 반응) ──
    ("lexical_negative", L(["daily"]), ["hard_negative_lexical"], [
        "네 말이 맞아", ("주사 한 대 맞고 왔어", D(t="recent")), ("비를 쫄딱 맞고 들어왔지", D(c=["reminiscence"], t="past")),
        ("퀴즈에서 정답을 맞혔어", D(t="recent")), "옷이 몸에 딱 맞네", ("그 사람이랑 손발이 잘 맞았지", D(c=["reminiscence"], t="past")),
        ("눈 맞으면서 걸었던 게 생각나", D(c=["reminiscence"], t="past")), "시간 맞춰서 약 먹어야지", ("약속했는데 바람을 맞았어", D(t="recent")),
        ("어릴 때 북을 치면서 놀았지", D(c=["reminiscence"], t="past")), "손뼉 치면서 노래하자", "화투 한 판 칠래?",
        ("야구할 때 공을 세게 때렸지", D(c=["reminiscence"], t="past")), ("어제 밤에 벼락이 쳤어", D(t="recent")),
        ("못을 망치로 때려 박았지", D(c=["reminiscence"], t="past")), "칼국수 먹고 싶다", ("칼로 수박을 잘랐어", D(t="recent")),
        ("머리를 짧게 잘랐어", D(t="recent")), ("우리 영감은 칼같이 시간을 지켰지", D(c=["reminiscence"], t="past")),
        "밥은 잘 먹고 있어", ("입맛이 없어서 아침은 걸렀어", D(c=["daily", "physical_discomfort"], t="recent")),
        ("점심을 굶었더니 배가 고프네", D(t="recent")), "밥 더 안 줘도 돼, 배불러", ("호박죽 쑤어 먹었어", D(t="recent")),
        ("화분이 다 말라 죽었어", D(t="recent")), "휴대폰 배터리가 죽었네", ("아궁이 불이 금방 죽었지", D(c=["reminiscence"], t="past")),
        ("숨은그림찾기 했어", D(t="recent")), ("고양이가 장롱 뒤에 숨어 있었어", D(t="recent")),
        ("산에 오르니 숨이 조금 차네", D(c=["physical_discomfort"])), ("태풍에 나무가 넘어졌대", D(s="other", t="recent")),
        ("바람에 화분이 쓰러졌어", D(t="recent")), "자기 전에 문 잠가야지", ("옛날엔 닭을 우리에 가둬 키웠지", D(c=["reminiscence"], t="past")),
        "손주가 리모컨을 뺏어 갔어, 장난으로", ("바둑에서 집을 다 뺏겼어", D(t="recent")), "약국 좀 다녀와야겠네",
        ("밭에 벌레 약 쳤어", D(t="recent")), ("손주들이 장난감 갖고 싸워", D(s="other")),
        ("옛날엔 형제끼리 많이 싸웠지", D(c=["reminiscence"], t="past")), ("밤새 개가 짖어서 시끄러웠어", D(t="recent")),
        "텔레비전 소리 좀 줄여 줄래", ("어제 넘어질 뻔했는데 안 넘어졌어", D(t="recent")),
        ("감기약 먹고 푹 잤어", D(t="recent")), "이 김치는 좀 맵네, 죽겠다 싶을 만큼은 아니고",
    ]),
    ("grief_v2", L(["sadness_grief"]), ["grief_not_distress"], [
        "가끔은 외로울 때도 있지", "혼자 있으니 좀 적적하네", "자식들이 보고 싶네", "명절에는 좀 쓸쓸해",
        "친구들 생각이 나서 마음이 좀 허해", "옛날 사진 보니까 마음이 짠하네", "영감 목소리가 그리워",
        ("엄마 산소에 못 가서 서운해", D(t="recent")), "요즘 들어 고향 생각이 자주 나", "혼자 늙어 가는 게 좀 서글프지",
        ("손주가 이사 가서 섭섭해", D(t="recent")), "그래도 이렇게 얘기하니까 좀 낫네",
    ]),
    ("negated_v2", L(["crisis_appeal"], ["abuse"], m="negated"), ["negation"], [
        "아무도 날 괴롭히지 않아, 다들 잘해 줘", ("아픈 데 하나 없어, 멀쩡해", D(c=["physical_discomfort"], k=None)),
        ("죽을 만큼 힘든 건 아니야", D(c=["crisis_appeal", "acute_distress"], k=["self_harm"])), "며느리가 밥 굶기는 일은 없어",
        ("숨 막히고 그런 건 없어", D(k=["medical_emergency"])), ("혼자 있어도 무섭지는 않아", D(c=["acute_distress"], k=None)),
        ("그만하자는 게 아니라 잠깐 물 마시려고", D(c=["rest_request"], k=None, i="continue")),
        ("살기 싫은 건 아니고 그냥 심심해", D(c=["crisis_appeal", "daily"], k=["self_harm"])),
    ]),
]

OVERRIDE_KEYS = {"c", "k", "s", "t", "m", "i", "x", "v", "ctx", "one"}


def labels_of(base: dict, o: dict) -> dict:
    c = list(o.get("c", base["c"]))
    # 위기 범주: 내용에 crisis_appeal 이 있으면 덮어쓰기 → 블록 기본 → unknown, 없으면 none(규약 §3.2).
    crisis = list(o.get("k") or base["k"] or ["unknown"]) if "crisis_appeal" in c else ["none"]
    return {"content": c, "crisisCategory": crisis, "subject": o.get("s", base["s"]), "tense": o.get("t", base["t"]),
            "mode": o.get("m", base["m"]), "intent": o.get("i", base["i"]), "interpretability": o.get("x", base["x"])}


def build() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {"train": [], "dev": []}
    counters = {"train": 28, "dev": 0}  # train 0001~0028 = 시범 예시(pilot-2026-11-14.jsonl)
    seed_no = 0
    for name, base, tags, items in BLOCKS:
        for pos, item in enumerate(items):
            text, o = (item, {}) if isinstance(item, str) else item
            assert set(o) <= OVERRIDE_KEYS, o
            split = "dev" if pos % 7 == 6 else "train"
            group = f"v1-{name}-{pos:02d}"
            lab = labels_of(base, o)
            variant = o.get("v", "clean")
            forms = [(text, variant, 0)]
            if not o.get("one"):
                forms.append((text.replace(" ", ""), "no_spacing" if variant == "clean" else variant, 7))
                forms.append((FILLERS[seed_no % len(FILLERS)] + text, variant, 13))
            for f_text, f_var, shift in forms:
                counters[split] += 1
                ctx = o.get("ctx") or AI_QUESTIONS[(seed_no + shift) % len(AI_QUESTIONS)]
                out[split].append({
                    "id": f"ctx-{split}-{counters[split]:04d}", "schemaVersion": "ctx-safety-example-v1",
                    "labelGuideVersion": GUIDE, "split": split, "variantGroup": group,
                    "persona": PERSONAS[seed_no % len(PERSONAS)],
                    "context": [{"speaker": "ai", "text": ctx}], "target": {"speaker": "elder", "text": f_text},
                    "transcriptVariant": f_var, "scenarioTags": list(tags), "labelsByAuthor": lab,
                    "reviews": [], "final": None, "status": "draft_unreviewed",
                    "provenance": {"source": "synthetic_claude_draft", "author": "claude", "authoredAt": DATE},
                })
            seed_no += 1
    return out


def main() -> None:
    data = build()
    for split, rows in data.items():
        p = ROOT / "data" / split / "synthetic-v1.jsonl"
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8", newline="\n") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"{split}: {len(rows)} → {p.relative_to(ROOT.parent.parent)}")


if __name__ == "__main__":
    main()
