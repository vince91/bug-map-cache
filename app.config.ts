import {ExpoConfig} from "@expo/config-types";
import {ConfigContext} from "@expo/config";
import * as dotenv from "dotenv";

dotenv.config();

export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  "name": "bug-map-android-expo",
  "slug": "bug-map-android-expo",
  "version": "1.0.0",
  "orientation": "portrait",
  "icon": "./assets/images/icon.png",
  "scheme": "bugmapandroidexpo",
  "userInterfaceStyle": "automatic",
  "ios": {
    "supportsTablet": true,
    "bundleIdentifier": "com.example.bugmapandroidexpo"
  },
  "android": {
    "package": "com.example.bugmapandroidexpo",
    "adaptiveIcon": {
      "backgroundColor": "#E6F4FE",
      "foregroundImage": "./assets/images/android-icon-foreground.png",
      "backgroundImage": "./assets/images/android-icon-background.png",
      "monochromeImage": "./assets/images/android-icon-monochrome.png"
    },
    "predictiveBackGestureEnabled": false
  },
  "web": {
    "output": "static",
    "favicon": "./assets/images/favicon.png"
  },
  "plugins": [
    "expo-router",
    "expo-font",
    "expo-image",
    "expo-status-bar",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        "image": "./assets/images/splash-icon.png",
        "imageWidth": 200,
        "resizeMode": "contain",
        "backgroundColor": "#ffffff",
        "dark": {
          "backgroundColor": "#000000"
        }
      }
    ],
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
          // The iOS 27 SDK hard-requires UIKit scene adoption: without it the
          // app builds but refuses to launch, which would look like a crash
          // for the wrong reason. Needs expo >= 57.0.23.
          enableSceneSupport: true,
          // Below: match my-clubmed-app's iOS linkage. Without these the repro
          // renders fine on iOS 27, so they are the variable under test.
          // `staticPods: true` on the MapsIndoors plugin forces the seven
          // Mapbox pods back to dynamic, so `static` here puts a C++ library on
          // both sides of a static/dynamic boundary. usePrecompiledModules must
          // be false alongside it: SDK 57's own pre_install hook re-downgrades
          // xcframework pods to static and fails `pod install` under
          // useFrameworks: 'static'.
          useFrameworks: 'static',
          usePrecompiledModules: false
        },
      },
    ],
    [
      "expo-dev-client",
      {
        "launchMode": "most-recent"
      }
    ],
    [
      "@mapsindoors/react-native-maps-indoors-mapbox/app.plugin.js",
      {
        publicToken: process.env.MAPBOX_PUBLIC_TOKEN,
        downloadToken: process.env.MAPBOX_PRIVATE_TOKEN,
        staticPods: true
      }
    ]
  ],
  "experiments": {
    "typedRoutes": true,
    "reactCompiler": true
  }
});
