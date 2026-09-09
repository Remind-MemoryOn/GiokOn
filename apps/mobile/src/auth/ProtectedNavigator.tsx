import { Stack } from 'expo-router';
import { useAuth } from './AuthProvider';
import { useEnforceAppAccess } from './useEnforceAppAccess';
import { protectedRoutes } from './protectedRoutes';

export function ProtectedNavigator() {
  const { user, userRow, accessRevision } = useAuth();
  const { ready, target } = useEnforceAppAccess();
  // An identity/organization/role change must also discard screen-local form state.
  const scope = `${user?.id ?? ''}:${userRow?.org_id ?? ''}:${userRow?.role ?? ''}:${accessRevision}`;
  return (
    <Stack key={scope} screenOptions={{ headerShown: false,
      contentStyle: { backgroundColor: '#ffffff' }, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Protected guard={ready && target === '/main'}>
        {protectedRoutes.map(name => <Stack.Screen key={name} name={name} />)}
      </Stack.Protected>
    </Stack>
  );
}
