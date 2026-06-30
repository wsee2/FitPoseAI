import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';

let model: TensorflowModel | null = null;

export const MOVENET_INPUT_SIZE = 192;

export async function loadMoveNetModel(): Promise<TensorflowModel> {
  if (model) return model;
  const asset = Asset.fromModule(
    require('../../assets/models/movenet_lightning_int8.tflite')
  );
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Model asset download failed — localUri is null');

  // NNAPI hardware-accelerates inference via the device's DSP/GPU through Android's
  // Neural Networks API. Some older SoCs have flaky NNAPI drivers, so fall back to
  // the plain CPU delegate if it fails to initialize.
  try {
    model = await loadTensorflowModel({ url: asset.localUri }, ['nnapi']);
    console.log('✅ MoveNet loaded (delegate: nnapi)');
  } catch (err) {
    console.warn('NNAPI delegate failed, falling back to CPU:', err);
    model = await loadTensorflowModel({ url: asset.localUri }, []);
    console.log('✅ MoveNet loaded (delegate: cpu)');
  }
  console.log('Input shape:', JSON.stringify(model.inputs[0].shape));
  console.log('Output shape:', JSON.stringify(model.outputs[0].shape));
  return model;
}

export function getModel(): TensorflowModel {
  if (!model) throw new Error('MoveNet not loaded — call loadMoveNetModel() first');
  return model;
}
