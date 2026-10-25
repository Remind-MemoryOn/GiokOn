// Keep native keyboard avoidance, focused inputs, and first-tap actions together.
// No keyboard-height animation or external keyboard dependency is required.
import { useCallback, useEffect, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput,
  type ModalProps, type ScrollViewProps,
} from 'react-native';
import { inputScrollOffset } from '../lib/keyboard-layout';

export const MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> =
  Platform.OS === 'ios' && Platform.isPad ? ['landscape-left', 'landscape-right'] : ['portrait'];

function subscribeKeyboard(change: () => void) {
  const show = Keyboard.addListener('keyboardDidShow', change);
  const hide = Keyboard.addListener('keyboardDidHide', change);
  return () => { show.remove(); hide.remove(); };
}

export function useKeyboardVisible(): boolean {
  return useSyncExternalStore(subscribeKeyboard, () => Keyboard.isVisible(), () => false);
}

/** Put this outside the safe-area root, so its frame and the keyboard use the
 * same screen origin. Android native resize remains enabled as well. */
export function KeyboardSurface({ children }: PropsWithChildren) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** onFocus bubbles from real TextInputs, preserving their own focus handlers.
 * Remeasure after keyboard/layout changes, using native host refs (Fabric safe). */
export function KeyboardScrollView({
  children, extraBottom = 16, onFocus, onScroll, onLayout, onContentSizeChange,
  style, ...props
}: ScrollViewProps & { extraBottom?: number }) {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const frame = useRef<number | null>(null);
  const reveal = useCallback(() => {
    const input = focused.current;
    const viewport = scroll.current;
    const nativeViewport = viewport?.getNativeScrollRef();
    if (!input || !viewport || !nativeViewport || TextInput.State.currentlyFocusedInput() !== input) return;
    input.measureInWindow((_x, y, _width, height) => {
      if (TextInput.State.currentlyFocusedInput() !== input || scroll.current !== viewport) return;
      nativeViewport.measureInWindow((_sx, viewportY, _sw, viewportHeight) => {
        if (TextInput.State.currentlyFocusedInput() !== input || scroll.current !== viewport) return;
        const next = inputScrollOffset(offset.current, viewportY, viewportHeight, y, height, extraBottom);
        if (Math.abs(next - offset.current) > 1) viewport.scrollTo({ y: next, animated: true });
      });
    });
  }, [extraBottom]);
  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { frame.current = null; reveal(); });
  }, [reveal]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', schedule);
    return () => {
      show.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [schedule]);

  return (
    <ScrollView
      {...props}
      ref={scroll}
      style={[{ flex: 1 }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={16}
      onFocus={(event) => { focused.current = TextInput.State.currentlyFocusedInput(); onFocus?.(event); schedule(); }}
      onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
      onLayout={(event) => { onLayout?.(event); schedule(); }}
      onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); schedule(); }}
    >
      {children}
    </ScrollView>
  );
}
