import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { loadMoveNetModel } from '../services/moveNet';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation, route }: Props) {
  const [status, setStatus] = useState('Loading model…');

  useEffect(() => {
    loadMoveNetModel()
      .then((m) => {
        const input = JSON.stringify(m.inputs[0].shape);
        const output = JSON.stringify(m.outputs[0].shape);
        setStatus(`✅ Loaded\nIn: ${input}\nOut: ${output}`);
      })
      .catch((err) => setStatus(`❌ Failed: ${err?.message ?? err}`));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MoveNet Phase 1 Test</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#00E5FF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  status: { color: '#fff', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
