import {Stack} from 'expo-router';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{headerShown: true, title: 'Map'}}/>
      <Stack.Screen name="other" options={{headerShown: true, title: 'Other'}}/>
    </Stack>
  );
}
