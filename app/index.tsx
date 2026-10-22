import {ActivityIndicator, Alert, Button, Text, View} from 'react-native';
import MapsIndoors, {MPError} from "@mapsindoors/react-native-maps-indoors-mapbox";
import {useRouter} from "expo-router";
import {useEffect, useRef, useState} from "react";

// MapsIndoors.cacheData() never rejects, and on both platforms it can hang forever
// (iOS: the delegate is assigned to a weak property and deallocated immediately;
// Android: the sync listener NPEs on a null solutionId). Give up rather than hang.
const CACHE_TIMEOUT_MS = 120_000;

// The base-map download is documented as taking minutes, so it gets a longer budget.
// A timeout only stops the wait: the native download keeps going.
const BASE_MAP_TIMEOUT_MS = 600_000;

type StepOutcome = {ok: boolean; detail: string};
type StepReport = StepOutcome & {label: string; seconds: string};

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

function describeError(e: unknown): string {
  if (e instanceof MPError) {
    return `MapsIndoors error ${e.code}: ${e.message}`;
  }

  return e instanceof Error ? e.message : String(e);
}

export default function MapScreen() {
  const router = useRouter();
  const [step, setStep] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const startedAt = useRef(0);
  const loading = step !== null;

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

  // Times one cache step and turns a failure into its report, so the next step still runs.
  const runStep = async (label: string, run: () => Promise<StepOutcome>): Promise<StepReport> => {
    startedAt.current = Date.now();
    setElapsed(0);
    setProgress(null);
    setStep(label);

    const seconds = () => ((Date.now() - startedAt.current) / 1000).toFixed(1);

    try {
      const outcome = await run();
      return {label, ...outcome, seconds: seconds()};
    } catch (e) {
      return {label, ok: false, detail: describeError(e), seconds: seconds()};
    }
  }

  const handleMapCacheLoad = async () => {
    const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

    if (!apiKey) {
      Alert.alert("No API key found");
      return;
    }

    const content = await runStep("MapsIndoors data", async () => {
      const cached = await withTimeout(MapsIndoors.cacheData(apiKey), CACHE_TIMEOUT_MS);

      // cacheData resolves false when MapsIndoors reports the sync as failed.
      return {ok: cached, detail: `Resolved ${cached}`};
    });

    // The Mapbox tiles under the venue, which cacheData does not cover. On iOS this rejects
    // with error 9000 until a MapView has been mounted once in this app process.
    const baseMap = await runStep("Base map tiles", async () => {
      await MapsIndoors.setBaseMapTilesEnabled(true, apiKey);
      await withTimeout(
        MapsIndoors.synchronizeBaseMapTiles(fraction => setProgress(fraction), [apiKey]),
        BASE_MAP_TIMEOUT_MS
      );

      return {ok: true, detail: "Downloaded"};
    });

    setStep(null);

    const reports = [content, baseMap];

    Alert.alert(
      reports.every(report => report.ok) ? "Map cache loaded successfully" : "Map cache incomplete",
      reports
        .map(report => `${report.label}: ${report.ok ? "OK" : "FAILED"} after ${report.seconds}s\n${report.detail}`)
        .join("\n\n")
    );
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
          <Text>
            {step}… {elapsed.toFixed(1)}s{progress !== null && ` (${Math.round(progress * 100)}%)`}
          </Text>
        </View>
      )}

      <Text>2. Disable network for this device</Text>
      <Button title="3.Go to map" onPress={handleGoToMap}/>
    </View>

  );
}
