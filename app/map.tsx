import {NativeEventEmitter} from 'react-native';
import MapsIndoors, {
  MapControl,
  MapView,
  MPCameraPosition,
  MPCameraUpdate,
  MPCollisionHandling,
  MPFilter,
  MPLocation,
  MPMapConfig,
  MPQuery
} from "@mapsindoors/react-native-maps-indoors-mapbox";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {useEffect, useState} from "react";

// The map setup of my-clubmed-app on develop: initializeMapControl in
// maps-people/stores/interactive-map-store.ts, with its helpers and constants from
// utils/initialization.ts, constants/zoom-limits.ts and BottomPanel/constants.ts.

const DEFAULT_ZOOM_LIMIT = 17.5;
const INITIAL_ZOOM = 16.5;

// Primary types are visible from the initial zoom, secondary ones once the user zooms in.
const ICON_ZOOM_FROM_PRIMARY = 16;
const LABEL_ZOOM_FROM_PRIMARY = 18;
const ICON_ZOOM_FROM_SECONDARY = 19;
const LABEL_ZOOM_FROM_SECONDARY = 20;

const BUILDING_LOCATION_TYPE = 'Building';
const SECONDARY_LOCATION_TYPES = new Set(['Room', BUILDING_LOCATION_TYPE]);

// Names the CMS gives a Building footprint nobody named, per solution language.
const BUILDING_PLACEHOLDER_NAMES = new Set([BUILDING_LOCATION_TYPE, 'Bâtiment']);

function isUnnamedBuilding({typeName, name}: MPLocation): boolean {
  return typeName === BUILDING_LOCATION_TYPE && BUILDING_PLACEHOLDER_NAMES.has(name);
}

async function configureDisplayRulesForLocationTypes(
  locationTypes: Set<string>,
  zoomFrom: number,
  labelZoomFrom: number
) {
  for (const locationType of locationTypes) {
    const typeDisplayRule = await MapsIndoors.getDisplayRuleByName(locationType);

    if (typeDisplayRule) {
      await typeDisplayRule.setIconVisible(true);
      await typeDisplayRule.setZoomFrom(zoomFrom);
      await typeDisplayRule.setLabelVisible(true);
      await typeDisplayRule.setLabelZoomFrom(labelZoomFrom);
    }
  }
}

// A location's own rule takes precedence over its type's.
async function hideLocations(locations: MPLocation[]) {
  for (const location of locations) {
    const locationDisplayRule = await MapsIndoors.getDisplayRuleByLocation(location);

    await locationDisplayRule?.setVisible(false);
  }
}

export default function MapScreen() {
  const [width, setWidth] = useState<number>();
  const [height, setHeight] = useState<number>();


  const load = async () => {
    try {
      const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

      if (!apiKey) {
        console.error("No API key provided");
        return;
      }

      console.log('Loading MapsIndoors...');
      await MapsIndoors.load(apiKey);

      const solution = await MapsIndoors.getSolution();
      solution.solutionConfig.automatedZoomLimit = DEFAULT_ZOOM_LIMIT;

      // The type display rules must be configured before the MapControl exists: the SDK
      // resolves the CMS inheritance (type rule -> main rule) when it builds the map, and
      // a property that was inherited at that point ignores later writes.
      console.log('Configuring display rules...');
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

      solution.solutionConfig.collisionHandling = MPCollisionHandling.allowOverlap;

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

      // The Building type rule above would draw them from the secondary zoom; their own
      // rule overrides it, and has to be written before the MapControl exists too.
      await hideLocations(allLocations.filter(isUnnamedBuilding));

      console.log('Creating MapControl...');

      const mapControl = await MapControl.create(new MPMapConfig({
        useDefaultMapsIndoorsStyle: true,
        showUserPosition: true,
        mapsIndoorsTransitionLevel: 0,
        // Android: the SDK's default floor selector adds a layout listener to the window that it
        // never removes, which keeps its MapView alive. Not creating it is the only way around
        // that, and the map hides it right away anyway.
        showFloorSelector: false
      }), NativeEventEmitter);

      console.log('Moving to venue...');
      const venue = (await MapsIndoors.getVenues()).getAll()[0];

      const cameraPosition = MPCameraPosition.create({
        target: venue.position,
        zoom: INITIAL_ZOOM // set the zoom level to the minimum level to see the venue details
      });

      await mapControl.moveCamera(
        MPCameraUpdate.fromCameraPosition(cameraPosition)
      );

      await mapControl.hideFloorSelector(true);

      console.log('Done!');

    } catch (e) {
      console.error('Error while loading MapsIndoors:', e);
    }
  };

  // Load MapsIndoors when the app mounts, i.e. the MapView should be ready.
  useEffect(() => {
    load().catch((reason) => {
      console.error('MapsIndoors failed to load:', reason)
    });
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}} onLayout={(event) => {
      const {width, height} = event.nativeEvent.layout;
      setWidth(width);
      setHeight(height);
    }}>

      {width && height && <MapView style={{
        width: width,
        height: height,
        flex: 1,
      }}/>}
    </GestureHandlerRootView>

  );
}
