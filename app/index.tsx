import {Button, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useRouter} from "expo-router";
import {useCallback, useEffect, useRef, useState} from "react";

import {getUsedMemoryAsync} from "../modules/app-memory";

// Back from the map, the native side needs a moment to release what it is going to release:
// measure once it has settled rather than while the map is still being torn down.
const SETTLE_MS = 3000;

// "Run visits" mode: how long each automatic visit stays on the map (enough for it to load
// fully), and how many visits one run makes.
const MAP_STAY_MS = 12000;
const AUTO_VISITS = 10;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const [firstIterationMemory, setFirstIterationMemory] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const openedMap = useRef(false);
  const iterationsRef = useRef(0);

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
    iterationsRef.current += 1;
    const iteration = iterationsRef.current;
    setIterations(iteration);
    setCurrentMemory(null);

    const timer = setTimeout(() => {
      measureMegabytes().then(megabytes => {
        console.log(`[memory] iteration ${iteration}: ${megabytes.toFixed(1)} MB`);
        setCurrentMemory(megabytes);
        if (iteration === 1) {
          setFirstIterationMemory(megabytes);
        }
      }, e => setError(describeError(e)));
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, []));

  const handleGoToMap = () => {
    openedMap.current = true;
    router.navigate("/map");
  };

  const handleRunVisits = async () => {
    setRunning(true);

    for (let visit = 0; visit < AUTO_VISITS; visit++) {
      handleGoToMap();
      await sleep(MAP_STAY_MS);
      router.back();
      // Leave time for the settled measurement before the next visit.
      await sleep(SETTLE_MS + 1000);
    }

    setRunning(false);
  };

  // Counted from the first iteration: the first map load is a one-time cost (SDK data, caches)
  // that would otherwise read as a per-visit leak.
  const addedPerIteration =
    iterations > 1 && firstIterationMemory !== null && currentMemory !== null
      ? (currentMemory - firstIterationMemory) / (iterations - 1)
      : null;

  return (
    <View style={styles.container}>
      <Button title="Go to map" onPress={handleGoToMap} disabled={running}/>
      <Button title={`Run ${AUTO_VISITS} visits`} onPress={handleRunVisits} disabled={running}/>

      <View style={styles.stats}>
        <Text style={styles.stat}>Iterations (map and back): {iterations}</Text>
        <Text style={styles.stat}>Initial memory at open: {formatMegabytes(initialMemory)}</Text>
        <Text style={styles.stat}>
          Memory after first iteration: {iterations > 0 ? formatMegabytes(firstIterationMemory) : "-"}
        </Text>
        <Text style={styles.stat}>Current memory: {formatMegabytes(currentMemory)}</Text>
        <Text style={styles.stat}>
          Average added per iteration after the first: {iterations > 1 ? formatMegabytes(addedPerIteration) : "-"}
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
