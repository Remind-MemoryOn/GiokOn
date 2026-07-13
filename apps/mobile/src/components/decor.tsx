// 의존성 없는 웜 그라데이션 근사 — 스플래시 하단 크림/웜 페이드.
// (expo-linear-gradient 미도입: 반투명 밴드를 겹쳐 부드러운 전환을 만든다.)
import { View } from 'react-native';

const BANDS = ['#fffaf3', '#fef3e2', '#fbe2c4', '#f6cda0'];

export function LinearGradientLike() {
  return (
    <View pointerEvents="none">
      {BANDS.map((c, i) => (
        <View key={i} style={{ height: 26, backgroundColor: c }} />
      ))}
    </View>
  );
}
