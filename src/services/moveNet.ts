import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';

let model: TensorflowModel | null = null;

export const MOVENET_INPUT_SIZE = 192; // Lightning expects 192x192

export async function loadMoveNetModel(): Promise<TensorflowModel> {
  if (model) return model;
  model = await loadTensorflowModel(
    require('../../assets/models/movenet_lightning_int8.tflite')
  );
  console.log('✅ MoveNet loaded');
  console.log('Input shape:', model.inputs[0].shape);
  console.log('Output shape:', model.outputs[0].shape);
  return model;
}

export function getModel(): TensorflowModel {
  if (!model) throw new Error('MoveNet not loaded — call loadMoveNetModel() first');
  return model;
}