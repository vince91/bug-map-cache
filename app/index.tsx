import {ActivityIndicator, Alert, Button, Text, View} from 'react-native';
import MapsIndoors from "@mapsindoors/react-native-maps-indoors-mapbox";
import {useRouter} from "expo-router";
import {useEffect, useRef, useState} from "react";

// MapsIndoors.cacheData() never rejects, and on both platforms it can hang forever
// (iOS: the delegate is assigned to a weak property and deallocated immediately;
// Android: the sync listener NPEs on a null solutionId). Give up rather than hang.
const CACHE_TIMEOUT_MS = 120_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The native promise never settled (waited ${ms / 1000}s).`)),
      ms
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export default function MapScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // Tick while loading so a hung promise is visible instead of looking idle.
  useEffect(() => {
    if (!loading) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [loading]);

  const handleMapCacheLoad = async () => {
    const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

    if (!apiKey) {
      Alert.alert("No API key found");
      return;
    }

    startedAt.current = Date.now();
    setElapsed(0);
    setLoading(true);

    try {
      const cached = await withTimeout(MapsIndoors.cacheData(apiKey), CACHE_TIMEOUT_MS);
      const seconds = ((Date.now() - startedAt.current) / 1000).toFixed(1);

      // cacheData resolves false when MapsIndoors reports the sync as failed.
      Alert.alert(
        cached ? "Map cache loaded successfully" : "Map cache sync failed",
        `Resolved ${cached} after ${seconds}s`
      );
    } catch (e) {
      Alert.alert("Error loading map cache", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const handleGoToMap = () => {
    router.navigate("/map")
  }

  return (
    <View style={{padding: 50, gap: 20}}>
      <Button title="1. Load map cache" onPress={handleMapCacheLoad} disabled={loading}/>

      {loading && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <ActivityIndicator/>
          <Text>Loading map cache… {elapsed.toFixed(1)}s</Text>
        </View>
      )}

      <Text>2. Disable network for this device</Text>
      <Button title="3.Go to map" onPress={handleGoToMap}/>
    </View>

  );
}
