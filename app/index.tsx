import {Alert, Button, Text, View} from 'react-native';
import MapsIndoors from "@mapsindoors/react-native-maps-indoors-mapbox";
import {useRouter} from "expo-router";


export default function MapScreen() {
  const router = useRouter();
  const handleMapCacheLoad = async () => {
    const apiKey = process.env.EXPO_PUBLIC_MAPSINDOORS_API_KEY;

    if (!apiKey) {
      Alert.alert("No API key found");
      return;
    }

    try {
      await MapsIndoors.cacheData(apiKey)
      Alert.alert("Map cache loaded successfully")
    } catch (e) {
      Alert.alert("Error loading map cache")
    }
  }

  const handleGoToMap = () => {
    router.navigate("/map")
  }

  return (
    <View style={{padding: 50, gap: 20}}>
      <Button title="1. Load map cache" onPress={handleMapCacheLoad}/>
      <Text>2. Disable network for this device</Text>
      <Button title="3.Go to map" onPress={handleGoToMap}/>
    </View>

  );
}
