import { useEffect, useState } from 'react';
import { NativeEventEmitter, StyleSheet } from 'react-native';

import MapsIndoors, {
  MapControl,
  MapView,
  MPCameraPosition,
  MPCameraUpdate,
  MPMapConfig,
  MPPoint
} from '@mapsindoors/react-native-maps-indoors-mapbox';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Minimal reproduction for a crash in `MapControl.showUserPosition` on iOS.
 *
 * Boot is the shortest sequence that puts a rendered map on screen, then makes
 * the one call under test:
 *
 *   MapsIndoors.load(apiKey)
 *     -> MapControl.create({ showUserPosition: true, ... })
 *     -> moveCamera(...)
 *     -> showUserPosition(false)      <- process dies here
 *
 * The process traps on the last call, every time, on the first map open:
 *
 *   EXC_BREAKPOINT (SIGTRAP)   thread: com.meta.react.turbomodulemanager.queue
 *     _dispatch_assert_queue_fail
 *     dispatch_assert_queue
 *     swift_task_checkIsolatedSwift
 *     MapsIndoorsCore
 *     MapControlModule.showUserPosition(_:resolver:rejecter:)
 *     ObjCTurboModule::performMethodInvocation
 *
 * `MapControlModule.showUserPosition` writes the property straight through:
 *
 *   MapsIndoorsData.sharedInstance.mapView?.getMapControl()?.showUserPosition = show
 *
 * React Native invokes TurboModule methods on its own queue, not the main
 * thread, and the MapsIndoorsCore setter is main-actor isolated — so Swift's
 * executor check fails and traps. Neighbouring methods in the same file wrap
 * their work in `DispatchQueue.main.async` or a `Task`; this one does not.
 *
 * Everything else here is deliberately absent: no getVenues, no
 * getLocationsAsync, no display rules, no listeners, no UI. Those all succeed
 * on iOS and are not part of the reproduction.
 */

const TAG = '[repro]';

function log(...parts: unknown[]) {
  console.log(`${TAG} ${parts.join(' ')}`);
}

/**
 * A rejected MPError is a plain object with a numeric `code`, not an Error, so
 * `String(e)` reports "[object Object]" and loses the message.
 */
function logError(label: string, e: unknown) {
  log(`${label} FAILED typeof=${typeof e} isError=${e instanceof Error}`);

  if (e instanceof Error) {
    log(`${label} message=${e.message}`);
  }

  if (e && typeof e === 'object') {
    for (const key of Object.keys(e as Record<string, unknown>)) {
      log(`${label} .${key}=${String((e as Record<string, unknown>)[key])}`);
    }
  }
}

export default function MapScreen() {
  const [width, setWidth] = useState<number>();
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

      if (!apiKey) {
        log('NO API KEY - set EXPO_PUBLIC_MAPSINDOORS_API_KEY');
        return;
      }

      try {
        log('MapsIndoors.load...');
        await MapsIndoors.load(apiKey);
        log('MapsIndoors.load OK');
        if (cancelled) return;

        log('MapControl.create...');
        const mapControl = await MapControl.create(
          new MPMapConfig({
            useDefaultMapsIndoorsStyle: true,
            showUserPosition: true,
            mapsIndoorsTransitionLevel: 0
          }),
          NativeEventEmitter
        );
        log('MapControl.create OK');
        if (cancelled) return;

        // Hard-coded camera so booting never depends on a venue lookup.
        await mapControl.moveCamera(
          MPCameraUpdate.fromCameraPosition(
            MPCameraPosition.create({
              target: new MPPoint(31.66, -7.979),
              zoom: 16
            })
          )
        );
        log('moveCamera OK');
        if (cancelled) return;

        // The call under test. The map was created with showUserPosition: true
        // and this turns it off, which is what an app does when it finds the
        // location permission has not been granted.
        log('showUserPosition(false)...');
        await mapControl.showUserPosition(false);
        log('showUserPosition OK - not reached on iOS');
      } catch (e) {
        logError('boot', e);
      }
    };

    boot();

    return () => {
      cancelled = true;
      log('map screen unmounting');
    };
  }, []);

  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={event => {
        setWidth(event.nativeEvent.layout.width);
        setHeight(event.nativeEvent.layout.height);
      }}
    >
      {width && height ? <MapView style={{ width, height, flex: 1 }} /> : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }
});
