// 앱 최상위 에러 바운더리 — 예기치 못한 렌더 오류에 흰 화면/강제 종료 대신 안내+재시도를
// 보여준다(실서비스 견고화). RN 특성상 클래스 컴포넌트로만 구현 가능. 정상 시 자식을 그대로
// 렌더하므로 디자인·동작에 영향 없음(오류 발생 시에만 폴백을 기존 디자인 언어로 표시).

import { Component, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // 오류 로그(실서비스에선 원격 로깅으로 확장 가능).
    console.error('[giokon] 화면 렌더 오류', error, info);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[22px] font-semibold text-ink text-center leading-[32px]">
            화면을 불러오는 중{'\n'}문제가 생겼어요.
          </Text>
          <Text className="text-[15px] text-muted text-center mt-3 leading-[22px]">
            잠시 후 다시 시도해 주세요. 문제가 계속되면 앱을 다시 실행해 주세요.
          </Text>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            className="h-[57px] px-10 rounded-card bg-accent items-center justify-center mt-8 active:bg-accent-pressed"
          >
            <Text className="text-white text-[18px] font-semibold">다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}
