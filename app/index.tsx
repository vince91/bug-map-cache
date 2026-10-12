import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import MapsIndoors, {
  MapControl,
  MapView,
  MPCameraPosition,
  MPCameraUpdate,
  MPCollisionHandling,
  MPDisplayRule,
  MPFilter,
  MPMapConfig,
  MPQuery
} from '@mapsindoors/react-native-maps-indoors-mapbox';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * The MPAC resort map, set up the way my-clubmed-app sets up a resort map
 * (maps-people/stores/interactive-map-store.ts + utils/initialization.ts on
 * fix/1836.ego.map.pois):
 *
 *   MapsIndoors.setLanguage(LANGUAGE)
 *   MapsIndoors.load(mapId)
 *   solution.automatedZoomLimit = DEFAULT_ZOOM_LIMIT
 *   MapControl.create({ useDefaultMapsIndoorsStyle, showUserPosition,
 *                       mapsIndoorsTransitionLevel: 0 })
 *   every location type found in the data, except rooms and buildings:
 *     icons from zoom 16, labels from 18
 *   rooms and buildings: icons from zoom 19, labels from 20
 *   solution.collisionHandling = allowOverlap
 *   camera on the venue at zoom 16.5
 *   hideFloorSelector(true)
 *
 * The map id is EXPO_PUBLIC_MAPSINDOORS_API_KEY in .env (MPAC's). The zoom
 * controls mirror the app's (+/- 0.75) and the pill shows the current zoom so
 * the visibility thresholds can be checked against it. The SDK's camera events
 * carry no position, so the native modules are patched (see patches/) to
 * attach the zoom to each event: the pill follows a pinch without a bridge
 * round trip per frame.
 *
 * "Reset" unmounts the whole map (MapView, MapControl, listeners) and mounts a
 * fresh one through a React key, replaying the boot from MapsIndoors.load. The
 * SDK has no dispose: like the app, the old MapControl is only unsubscribed.
 */

type CameraEvent = { event: number; zoom?: number };

/** Registering any SDK listener is what turns the native camera events on. */
const enableCameraEvents = () => {};

const LANGUAGE = 'fr';
const DEFAULT_ZOOM_LIMIT = 17.5;
const INITIAL_ZOOM = 16.5;
const ZOOM_STEP = 0.75;

const ICON_ZOOM_FROM_PRIMARY = 16;
const LABEL_ZOOM_FROM_PRIMARY = 18;
const ICON_ZOOM_FROM_SECONDARY = 19;
const LABEL_ZOOM_FROM_SECONDARY = 20;
const SECONDARY_LOCATION_TYPES = new Set(['Room', 'Building']);

const TAG = '[map]';

function log(...parts: unknown[]) {
  console.log(`${TAG} ${parts.join(' ')}`);
}

/**
 * A rejected MPError is a plain object with a numeric `code`, not an Error, so
 * `String(e)` reports "[object Object]" and loses the message.
 */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;

  if (e && typeof e === 'object') {
    return Object.entries(e as Record<string, unknown>)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
  }

  return String(e);
}

async function configureDisplayRulesForLocationTypes(
  locationTypes: Set<string>,
  zoomFrom: number,
  labelZoomFrom: number
): Promise<void> {
  for (const locationType of locationTypes) {
    const typeDisplayRule: MPDisplayRule | undefined =
      await MapsIndoors.getDisplayRuleByName(locationType);

    if (!typeDisplayRule) {
      log(`no display rule for type "${locationType}"`);
      continue;
    }

    await typeDisplayRule.setIconVisible(true);
    await typeDisplayRule.setZoomFrom(zoomFrom);
    await typeDisplayRule.setLabelVisible(true);
    await typeDisplayRule.setLabelZoomFrom(labelZoomFrom);
  }
}

type ResortMapProps = {
  /** Mount counter, bumped by each reset. */
  instance: number;
  onReset: () => void;
};

function ResortMap({ instance, onReset }: ResortMapProps) {
  const [width, setWidth] = useState<number>();
  const [height, setHeight] = useState<number>();
  const [status, setStatus] = useState<string>('Loading map…');
  const [zoom, setZoom] = useState<number>();
  const mapControlRef = useRef<MapControl>(null);

  const readZoom = useCallback(async (mapControl: MapControl) => {
    try {
      const position = await mapControl.getCurrentCameraPosition();
      setZoom(position.zoom);
    } catch (e) {
      log(`getCurrentCameraPosition failed: ${describeError(e)}`);
    }
  }, []);

  const zoomBy = useCallback(
    async (delta: number) => {
      const mapControl = mapControlRef.current;
      if (!mapControl) return;

      await mapControl.moveCamera(MPCameraUpdate.zoomBy(delta));
      await readZoom(mapControl);
    },
    [readZoom]
  );

  useEffect(() => {
    let cancelled = false;
    let cameraSubscription: EmitterSubscription | undefined;

    const boot = async () => {
      const mapId = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

      if (!mapId) {
        setStatus('Set EXPO_PUBLIC_MAPSINDOORS_API_KEY in .env');
        return;
      }

      try {
        log(`map #${instance}: booting`);
        await MapsIndoors.setLanguage(LANGUAGE);
        await MapsIndoors.load(mapId);
        log(`map #${instance}: loaded ${mapId}`);
        if (cancelled) return;

        const solution = await MapsIndoors.getSolution();
        solution.solutionConfig.automatedZoomLimit = DEFAULT_ZOOM_LIMIT;

        const mapControl = await MapControl.create(
          new MPMapConfig({
            useDefaultMapsIndoorsStyle: true,
            showUserPosition: true,
            mapsIndoorsTransitionLevel: 0
          }),
          NativeEventEmitter
        );
        if (cancelled) return;

        const allLocations = await MapsIndoors.getLocationsAsync(
          MPQuery.create({}),
          MPFilter.create()
        );
        const primaryLocationTypes = new Set(
          allLocations
            .map(location => location.typeName)
            .filter(
              (typeName): typeName is string =>
                !!typeName && !SECONDARY_LOCATION_TYPES.has(typeName)
            )
        );
        log(
          `${allLocations.length} locations, primary types: ${[...primaryLocationTypes].sort().join(', ')}`
        );

        solution.solutionConfig.collisionHandling =
          MPCollisionHandling.allowOverlap;

        await configureDisplayRulesForLocationTypes(
          primaryLocationTypes,
          ICON_ZOOM_FROM_PRIMARY,
          LABEL_ZOOM_FROM_PRIMARY
        );
        await configureDisplayRulesForLocationTypes(
          SECONDARY_LOCATION_TYPES,
          ICON_ZOOM_FROM_SECONDARY,
          LABEL_ZOOM_FROM_SECONDARY
        );

        const venue = (await MapsIndoors.getVenues()).getAll()[0];
        await mapControl.moveCamera(
          MPCameraUpdate.fromCameraPosition(
            MPCameraPosition.create({
              target: venue.position,
              zoom: INITIAL_ZOOM
            })
          )
        );
        await mapControl.hideFloorSelector(true);
        if (cancelled) return;

        // The SDK listener only forwards the event code, so it is used to turn
        // the native events on, and the zoom is read from the raw event the
        // patched native modules emit. Without the patch, fall back to a read.
        mapControl.addOnCameraEventListener(enableCameraEvents);
        cameraSubscription = new NativeEventEmitter(
          NativeModules.MapControlModule
        ).addListener('cameraEvent', (event: CameraEvent) => {
          if (typeof event.zoom === 'number') {
            setZoom(event.zoom);
          } else {
            readZoom(mapControl);
          }
        });

        mapControlRef.current = mapControl;
        setStatus('');
        await readZoom(mapControl);
        log(`map #${instance}: ready`);
      } catch (e) {
        log(`map #${instance}: boot failed: ${describeError(e)}`);
        setStatus(`Failed: ${describeError(e)}`);
      }
    };

    boot();

    return () => {
      cancelled = true;
      cameraSubscription?.remove();
      mapControlRef.current?.removeOnCameraEventListener(enableCameraEvents);
      mapControlRef.current = null;
      log(`map #${instance}: unmounted`);
    };
  }, [instance, readZoom]);

  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={event => {
        setWidth(event.nativeEvent.layout.width);
        setHeight(event.nativeEvent.layout.height);
      }}
    >
      {width && height ? <MapView style={{ width, height, flex: 1 }} /> : null}
      <View style={styles.pill} pointerEvents="none">
        <Text style={styles.pillText}>
          {`#${instance} · `}
          {status || (zoom === undefined ? 'Zoom ?' : `Zoom ${zoom.toFixed(2)}`)}
        </Text>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.control} onPress={() => zoomBy(ZOOM_STEP)}>
          <Text style={styles.controlLabel}>+</Text>
        </Pressable>
        <Pressable style={styles.control} onPress={() => zoomBy(-ZOOM_STEP)}>
          <Text style={styles.controlLabel}>−</Text>
        </Pressable>
        <Pressable style={[styles.control, styles.reset]} onPress={onReset}>
          <Text style={styles.controlLabel}>↻</Text>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

export default function MapScreen() {
  const [instance, setInstance] = useState(1);
  const reset = useCallback(() => setInstance(current => current + 1), []);

  // A new key unmounts the previous map entirely before the next one mounts.
  return <ResortMap key={instance} instance={instance} onReset={reset} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(28, 28, 30, 0.85)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  controls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28, 28, 30, 0.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  controlLabel: { color: '#fff', fontSize: 24, lineHeight: 28 },
  reset: { marginTop: 12, backgroundColor: 'rgba(180, 40, 40, 0.9)' }
});
