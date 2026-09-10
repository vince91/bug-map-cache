import { Stack } from 'expo-router';
import 'react-native-reanimated';

// One screen, no tabs, no nesting. The map is the entry point so nothing about
// navigation can influence the reproduction.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
