import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

/**
 * Home screen — deliberately contains no map.
 *
 * The only MapView in the process is the one the map screen creates, so
 * pushing /map is exactly one construction of that view.
 */
export default function HomeScreen() {
  const router = useRouter();

  const openMap = useCallback(() => {
    router.push('/map');
  }, [router]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.button} onPress={openMap}>
        <Text style={styles.buttonLabel}>Show map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  button: {
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center'
  },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
