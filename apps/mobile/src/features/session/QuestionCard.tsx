// AI 질문 카드 (Figma `17:108`) — 요양보호사 화면과 어르신 화면이 같이 쓴다.
//
// Figma 는 카드를 336×258 로 고정했지만 그 안의 질문은 자리표시자(짧은 한 문장)다.
// 실제 AI 질문은 길이가 제각각이라 고정 높이면 글자가 카드를 넘쳐 나갔다
// (사용자 지적 2026-08-13). Figma 높이는 **최소 높이**로 두고 길면 늘어나게 한다.
// 좌표(로봇 18/38 · 질문 75.25/27 w251)는 padding·마진으로 같게 유지한다.
// 첫 인사 전에는 AI 질문이 없다 — 안내 문구는 화면 표시일 뿐 대화 기록이 아니다.
import { Text, View } from 'react-native';
import { RobotInline } from '../../components/brand';
import { useContentWidth } from '../../lib/layout';

export function QuestionCard({ question, placeholder }: { question: string; placeholder: string }) {
  // 카드 폭 = 콘텐츠 폭(393 폭에서 Figma 336). 질문 칸은 남은 폭을 채우고 오른쪽 여백 10.75(= 336 − 74.25 − 251).
  const { contentW } = useContentWidth();
  return (
    <View
      className="flex-row"
      style={{
        width: contentW,
        minHeight: 258,
        borderRadius: 10,
        backgroundColor: '#fdf3ea',
        borderWidth: 1,
        borderColor: '#e9822b',
        paddingTop: 26,
        paddingBottom: 26,
      }}
    >
      <View style={{ marginLeft: 17, marginTop: 11 }}>
        <RobotInline size={46.5} />
      </View>
      <Text
        className="text-[28px] font-semibold text-black"
        accessibilityLiveRegion="polite"
        style={{ flex: 1, marginLeft: 10.75, marginRight: 10.75, lineHeight: 50, color: question ? undefined : '#7b7c7c' }}
      >
        {question || placeholder}
      </Text>
    </View>
  );
}
