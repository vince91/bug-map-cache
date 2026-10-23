import {Button, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useRouter} from "expo-router";
import {useCallback, useEffect, useRef, useState} from "react";

import {getUsedMemoryAsync} from "../modules/app-memory";

// Back from the map, the native side needs a moment to release what it is going to release:
// measure once it has settled rather than while the map is still being torn down.
const SETTLE_MS = 3000;

const toMegabytes = (bytes: number) => bytes / 1024 / 1024;

function formatMegabytes(megabytes: number | null): string {
  return megabytes === null ? "measuring…" : `${megabytes.toFixed(1)} MB`;
}

async function measureMegabytes(): Promise<number> {
  return toMegabytes(await getUsedMemoryAsync());
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function HomeScreen() {
  const router = useRouter();
  const [iterations, setIterations] = useState(0);
  const [initialMemory, setInitialMemory] = useState<number | null>(null);
  const [currentMemory, setCurrentMemory] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openedMap = useRef(false);

  // The baseline: memory when the app opens, before any map has been mounted.
  useEffect(() => {
    measureMegabytes().then(
      megabytes => {
        setInitialMemory(megabytes);
        setCurrentMemory(megabytes);
      },
      e => setError(describeError(e))
    );
  }, []);

  // Every return from the map is one iteration.
  useFocusEffect(useCallback(() => {
    if (!openedMap.current) {
      return;
    }

    openedMap.current = false;
    setIterations(count => count + 1);
    setCurrentMemory(null);

    const timer = setTimeout(() => {
      measureMegabytes().then(setCurrentMemory, e => setError(describeError(e)));
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, []));

  const handleGoToMap = () => {
    openedMap.current = true;
    router.navigate("/map");
  };

  const addedPerIteration =
    iterations > 0 && initialMemory !== null && currentMemory !== null
      ? (currentMemory - initialMemory) / iterations
      : null;

  return (
    <View style={styles.container}>
      <Button title="Go to map" onPress={handleGoToMap}/>

      <View style={styles.stats}>
        <Text style={styles.stat}>Iterations (map and back): {iterations}</Text>
        <Text style={styles.stat}>Initial memory at open: {formatMegabytes(initialMemory)}</Text>
        <Text style={styles.stat}>Current memory: {formatMegabytes(currentMemory)}</Text>
        <Text style={styles.stat}>
          Average added per iteration: {iterations > 0 ? formatMegabytes(addedPerIteration) : "-"}
        </Text>
        {error && <Text style={styles.error}>Memory reading failed: {error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 50,
    gap: 30,
  },
  stats: {
    gap: 10,
  },
  stat: {
    fontSize: 16,
  },
  error: {
    color: '#D32F2F',
  },
});
