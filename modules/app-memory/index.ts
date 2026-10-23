import {requireNativeModule} from 'expo';

type AppMemoryNativeModule = {
  getUsedMemoryAsync(): Promise<number>;
};

const AppMemory = requireNativeModule<AppMemoryNativeModule>('AppMemory');

/**
 * The whole app's memory use in bytes, native side included (MapView, Mapbox, MapsIndoors):
 * the physical footprint on iOS, the figure Xcode's memory gauge shows; the total PSS on
 * Android, the measure `adb shell dumpsys meminfo <package>` reports.
 */
export function getUsedMemoryAsync(): Promise<number> {
  return AppMemory.getUsedMemoryAsync();
}
