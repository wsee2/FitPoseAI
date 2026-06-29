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
  model = await loadTensorflowModel({ url: asset.localUri }, []);
  console.log('✅ MoveNet loaded');
  console.log('Input shape:', JSON.stringify(model.inputs[0].shape));
  console.log('Output shape:', JSON.stringify(model.outputs[0].shape));
  return model;
}

export function getModel(): TensorflowModel {
  if (!model) throw new Error('MoveNet not loaded — call loadMoveNetModel() first');
  return model;
}
