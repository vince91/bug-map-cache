import { Stack } from 'expo-router';
import 'react-native-reanimated';

/**
 * Stock Expo Router stack — default headers, default back button.
 *
 * Nothing custom on purpose: the back button is the one react-navigation's
 * native stack puts in the header, so popping goes through the same UIKit path
 * a normal app uses rather than a hand-rolled `router.back()`.
 */
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="map" options={{ title: 'Map' }} />
    </Stack>
  );
}
