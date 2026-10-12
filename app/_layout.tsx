import { Stack } from 'expo-router';
import 'react-native-reanimated';

/** The map is the first and only screen. */
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'MPAC' }} />
    </Stack>
  );
}
