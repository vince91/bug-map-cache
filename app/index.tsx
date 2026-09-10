import { useCallback, useEffect, useState } from 'react';
import { NativeEventEmitter, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import MapsIndoors, {
  MapControl,
  MapView,
  MPCameraPosition,
  MPCameraUpdate,
  MPFilter,
  MPMapConfig,
  MPPoint,
  MPQuery
} from '@mapsindoors/react-native-maps-indoors-mapbox';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Minimal reproduction for a StackOverflowError inside the MapsIndoors RN
 * bridge on some physical Android devices.
 *
 * The native module serialises every model object it hands to JS with a bare
 * `new Gson()` (MapsIndoorsModule.java:48). Two of those calls blow a 4MB stack
 * on a Samsung Galaxy device while succeeding on an emulator with the same APK:
 *
 *   getVenues()          -> gson.toJson(List<MPVenue>)     MapsIndoorsModule:117
 *   getLocationsAsync()  -> gson.toJson(List<MPLocation>)  MapsIndoorsModule:234
 *
 * Both are @ReactMethod, so React Native catches the Throwable and rejects the
 * promise instead of crashing — the rejection arrives in JS as
 * "Exception in HostFunction: stack size 4108KB".
 *
 * Everything is logged with a [repro] prefix so it can be pulled straight out
 * of `adb logcat -s ReactNativeJS:V` or BrowserStack's Device Logs.
 */

const TAG = '[repro]';

function log(...parts: unknown[]) {
  console.log(`${TAG} ${parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`);
}

/**
 * Logs an error from every angle: a rejected MPError is a plain object with a
 * numeric `code`, not an Error, so a bare String(e) reports "[object Object]"
 * and loses the message that names the failure.
 */
function logError(label: string, e: unknown) {
  log(`${label} FAILED`);
  log(`${label} typeof=${typeof e} isError=${e instanceof Error}`);

  if (e instanceof Error) {
    log(`${label} name=${e.name}`);
    log(`${label} message=${e.message}`);
    log(`${label} stack=${String(e.stack).slice(0, 1200)}`);
  }

  if (e && typeof e === 'object') {
    for (const key of Object.keys(e as Record<string, unknown>)) {
      log(`${label} .${key}=${String((e as Record<string, unknown>)[key])}`);
    }
  }

  try {
    log(`${label} json=${JSON.stringify(e)}`);
  } catch {
    log(`${label} json=<not serialisable>`);
  }
}

/** Iterative — a recursive walk would blow the JS stack on a deep payload. */
function describeShape(label: string, value: unknown) {
  let maxDepth = 0;
  let deepestPath = '';
  let nodes = 0;

  const stack: { node: unknown; depth: number; path: string }[] = [
    { node: value, depth: 0, path: '$' }
  ];

  while (stack.length > 0) {
    const { node, depth, path } = stack.pop()!;
    nodes++;

    if (depth > maxDepth) {
      maxDepth = depth;
      deepestPath = path;
    }

    if (node && typeof node === 'object') {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        stack.push({
          node: (node as Record<string, unknown>)[key],
          depth: depth + 1,
          path: `${path}.${key}`
        });
      }
    }
  }

  log(`${label} nodes=${nodes} maxDepth=${maxDepth}`);
  log(`${label} deepestPath=${deepestPath.slice(0, 500)}`);
}

type Status = 'idle' | 'running' | 'ok' | 'failed';

export default function ReproScreen() {
  const [width, setWidth] = useState<number>();
  const [height, setHeight] = useState<number>();
  const [ready, setReady] = useState(false);
  const [venuesStatus, setVenuesStatus] = useState<Status>('idle');
  const [locationsStatus, setLocationsStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<string[]>([]);

  // Mirror the log onto the screen: BrowserStack sessions are watched live, and
  // seeing the result without opening Device Logs makes the run much quicker.
  // Newest first: the panel can't be scrolled reliably in a remote session, so
  // the most recent line has to be the one already on screen.
  const report = useCallback((line: string) => {
    setLines(prev => [line, ...prev].slice(0, 40));
  }, []);

  useEffect(() => {
    const boot = async () => {
      const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

      if (!apiKey) {
        log('NO API KEY - set EXPO_PUBLIC_MAPSINDOORS_API_KEY');
        report('NO API KEY');
        return;
      }

      try {
        log('MapsIndoors.load...');
        const t0 = Date.now();
        await MapsIndoors.load(apiKey);
        log(`MapsIndoors.load OK in ${Date.now() - t0}ms`);

        log('MapControl.create...');
        const t1 = Date.now();
        const mapControl = await MapControl.create(
          new MPMapConfig({
            useDefaultMapsIndoorsStyle: true,
            showUserPosition: true,
            mapsIndoorsTransitionLevel: 0
          }),
          NativeEventEmitter
        );
        log(`MapControl.create OK in ${Date.now() - t1}ms`);

        // Camera from a hard-coded position rather than getVenues(), so booting
        // the map never touches the call under test.
        await mapControl.moveCamera(
          MPCameraUpdate.fromCameraPosition(
            MPCameraPosition.create({ target: new MPPoint(31.66, -7.979), zoom: 16 })
          )
        );

        setReady(true);
        report('map ready - press a button');
        log('READY');
      } catch (e) {
        logError('boot', e);
        report('boot FAILED - see logs');
      }
    };

    boot();
  }, [report]);

  /** Button 1 — exactly what the app calls in initializeMapCamera. */
  const runGetVenues = useCallback(async () => {
    setVenuesStatus('running');
    report('getVenues running...');
    log('=== getVenues START ===');

    const t0 = Date.now();

    try {
      const collection = await MapsIndoors.getVenues();
      const elapsed = Date.now() - t0;
      const all = collection.getAll();

      log(`getVenues RESOLVED in ${elapsed}ms count=${all.length}`);
      describeShape('getVenues', all);
      log(`getVenues first=${JSON.stringify(all[0]).slice(0, 400)}`);

      setVenuesStatus('ok');
      report(`getVenues OK ${elapsed}ms count=${all.length}`);
    } catch (e) {
      const elapsed = Date.now() - t0;
      log(`getVenues REJECTED after ${elapsed}ms`);
      logError('getVenues', e);
      setVenuesStatus('failed');
      report(`getVenues FAILED ${elapsed}ms`);
    }

    log('=== getVenues END ===');
  }, [report]);

  /**
   * Button 2 — the call the app used to make to derive its location types,
   * before we replaced it with solution.types. An empty query and an empty
   * filter, so the native side serialises every location in the solution.
   */
  const runGetLocations = useCallback(async () => {
    setLocationsStatus('running');
    report('getLocationsAsync running...');
    log('=== getLocationsAsync START ===');

    const t0 = Date.now();

    try {
      const locations = await MapsIndoors.getLocationsAsync(
        MPQuery.create({}),
        MPFilter.create()
      );
      const elapsed = Date.now() - t0;

      log(`getLocationsAsync RESOLVED in ${elapsed}ms count=${locations.length}`);
      describeShape('getLocationsAsync', locations);

      if (locations[0]) {
        log(`getLocationsAsync firstKeys=${Object.keys(locations[0]).join(',')}`);
        log(`getLocationsAsync first=${JSON.stringify(locations[0]).slice(0, 600)}`);
      }

      const types = new Set(locations.map(l => l.typeName).filter(Boolean));
      log(`getLocationsAsync distinctTypes=${types.size}`);

      setLocationsStatus('ok');
      report(`getLocations OK ${elapsed}ms count=${locations.length}`);
    } catch (e) {
      const elapsed = Date.now() - t0;
      log(`getLocationsAsync REJECTED after ${elapsed}ms`);
      logError('getLocationsAsync', e);
      setLocationsStatus('failed');
      report(`getLocations FAILED ${elapsed}ms`);
    }

    log('=== getLocationsAsync END ===');
  }, [report]);

  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={event => {
        setWidth(event.nativeEvent.layout.width);
        setHeight(event.nativeEvent.layout.height);
      }}
    >
      {width && height ? <MapView style={{ width, height, flex: 1 }} /> : null}

      <View style={styles.overlay}>
        <ReproButton
          label="1. getVenues()"
          hint="MapsIndoorsModule:117"
          status={venuesStatus}
          disabled={!ready}
          onPress={runGetVenues}
        />
        <ReproButton
          label="2. getLocationsAsync()"
          hint="MapsIndoorsModule:234"
          status={locationsStatus}
          disabled={!ready}
          onPress={runGetLocations}
        />

        <ScrollView style={styles.console} contentContainerStyle={styles.consoleInner}>
          {lines.map((line, i) => (
            <Text key={i} style={styles.consoleLine}>
              {line}
            </Text>
          ))}
        </ScrollView>
      </View>
    </GestureHandlerRootView>
  );
}

function ReproButton({
  label,
  hint,
  status,
  disabled,
  onPress
}: {
  label: string;
  hint: string;
  status: Status;
  disabled: boolean;
  onPress: () => void;
}) {
  const color =
    status === 'ok' ? '#1b7f37' : status === 'failed' ? '#b00020' : status === 'running' ? '#8a6d00' : '#1c1c1e';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: color }, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
      <Text style={styles.buttonHint}>
        {hint} — {status}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Everything lives in one column below the status bar. The log used to be
  // anchored to the bottom, where the device navigation bar and BrowserStack's
  // own toolbar covered the last few lines.
  overlay: { position: 'absolute', top: 60, left: 12, right: 12, bottom: 120, gap: 8, zIndex: 10 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonHint: { color: '#ffffffcc', fontSize: 12, marginTop: 2 },
  console: {
    flex: 1,
    backgroundColor: '#000000e6',
    borderRadius: 10
  },
  consoleInner: { padding: 10 },
  consoleLine: { color: '#0f0', fontSize: 11, fontFamily: 'monospace' }
});
