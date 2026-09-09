// Every app route except splash/login belongs inside Stack.Protected.
// A filesystem coverage test fails when a new screen is added without classification.
export const protectedRoutes = [
  'main', 'register', 'observations', 'analytics', 'topics/[id]',
  'settings/index', 'settings/elders', 'session/talk', 'session/start',
  'session/saved', 'session/loading', 'log/[id]', 'elder/[id]',
  'consent/[id]/terms', 'consent/[id]/index', 'chronicle/[id]', 'analysis/[logId]',
] as const;
