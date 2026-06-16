import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

export default function CameraTestScreen() {
  const device = useCameraDevice('back');

  useEffect(() => {
    (async () => {
      const permission = await Camera.requestCameraPermission();
      console.log('Camera permission:', permission);
    })();
  }, []);

  if (!device) {
    return (
      <View>
        <Text>Loading camera...</Text>
      </View>
    );
  }

  return (
    <Camera
      style={{ flex: 1 }}
      device={device}
      isActive={true}
    />
  );
}