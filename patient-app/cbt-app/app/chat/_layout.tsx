import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[sessionId]" options={{ headerShown: false }} />
    </Stack>
  );
}
