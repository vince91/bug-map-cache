import {NativeEventEmitter, Pressable, Text} from 'react-native';
import MapsIndoors, {MapControl, MapView, MPMapConfig} from "@mapsindoors/react-native-maps-indoors-mapbox";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {useRouter} from "expo-router";
import {useEffect, useState} from "react";


export default function MapScreen() {
  const router = useRouter();
  const [mapControl, setMapControl] = useState<MapControl>()
  const [width, setWidth] = useState<number>();
  const [height, setHeight] = useState<number>();


  const handlePress = () => {
    router.navigate("/other")
  }


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
      const mapControl = await MapControl.create(new MPMapConfig({useDefaultMapsIndoorsStyle: true}), NativeEventEmitter);
      setMapControl(mapControl)

      console.log('Moving to venue...');
      await mapControl.goTo((await MapsIndoors.getVenues()).getAll()[0]);

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
    <GestureHandlerRootView style={{flex: 1, backgroundColor: "red"}} onLayout={(event) => {
      const {width, height} = event.nativeEvent.layout;
      setWidth(width);
      setHeight(height);
    }}>

      {width && height && <MapView style={{
        backgroundColor: "blue",
        width: width,
        height: height,
        flex: 1,
      }}/>}
      <Pressable
        style={{position: 'absolute', top: 20, left: 20, backgroundColor: "white", padding: 10, borderRadius: 15}}
        onPress={handlePress}>
        <Text>Navigate to the other screen</Text>
      </Pressable>
    </GestureHandlerRootView>

  );
}
