import {NativeEventEmitter} from 'react-native';
import MapsIndoors, {
  MapControl,
  MapView,
  MPCameraPosition,
  MPCameraUpdate,
  MPMapConfig
} from "@mapsindoors/react-native-maps-indoors-mapbox";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {useEffect, useState} from "react";


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


      console.log('Creating MapControl...');

      const mapControl = await MapControl.create(new MPMapConfig({
        useDefaultMapsIndoorsStyle: true,
        mapsIndoorsTransitionLevel: 0
      }), NativeEventEmitter);

      console.log('Moving to venue...');
      const venue = (await MapsIndoors.getVenues()).getAll()[0];

      const cameraPosition = MPCameraPosition.create({
        target: venue.position,
        zoom: 16.5 // set the zoom level to the minimum level to see the venue details
      });

      await mapControl.moveCamera(
        MPCameraUpdate.fromCameraPosition(cameraPosition)
      );

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
