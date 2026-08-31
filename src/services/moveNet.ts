import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';

let model: TensorflowModel | null = null;

export const MOVENET_INPUT_SIZE = 192;

// EXPERIMENT — try the Adreno GPU delegate ('android-gpu') before NNAPI, to see whether it
// beats NNAPI's ~30-40ms/frame on this device. TOGGLE: set to `false` to restore today's
// exact NNAPI→CPU behavior with zero other changes — that's the one-line revert for this
// whole experiment. Compare delegates via the perf HUD / [PERF] inferMs (or the
// "✅ MoveNet loaded (delegate: ...)" log below, which reports whichever one actually won).
// Same model file, same 192x192x3 int8 input, same [1,1,17,3] output regardless of which
// delegate ends up active — a delegate only changes WHERE the identical TFLite graph
// executes (GPU/DSP vs NNAPI vs CPU), never the model or its output format/values. Note this
// model is INT8-quantized; GPU delegates have historically had more uneven op support for
// INT8 than for float models, so it's a genuine, not-guaranteed experiment either way.
const TRY_GPU_DELEGATE = true;

export async function loadMoveNetModel(): Promise<TensorflowModel> {
  if (model) return model;
  const asset = Asset.fromModule(
    require('../../assets/models/movenet_lightning_int8.tflite')
  );
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Model asset download failed — localUri is null');

  if (TRY_GPU_DELEGATE) {
    try {
      model = await loadTensorflowModel({ url: asset.localUri }, ['android-gpu']);
      console.log('✅ MoveNet loaded (delegate: android-gpu)');
    } catch (err) {
      console.warn('GPU delegate failed, falling back to NNAPI:', err);
    }
  }

  // Unchanged from before this experiment — reached whenever TRY_GPU_DELEGATE is false, or
  // as the fallback when the GPU delegate above failed to load. NNAPI hardware-accelerates
  // inference via the device's DSP/GPU through Android's Neural Networks API. Some older
  // SoCs have flaky NNAPI drivers, so fall back to the plain CPU delegate if it fails too.
  if (!model) {
    try {
      model = await loadTensorflowModel({ url: asset.localUri }, ['nnapi']);
      console.log('✅ MoveNet loaded (delegate: nnapi)');
    } catch (err) {
      console.warn('NNAPI delegate failed, falling back to CPU:', err);
      model = await loadTensorflowModel({ url: asset.localUri }, []);
      console.log('✅ MoveNet loaded (delegate: cpu)');
    }
  }
  console.log('Input shape:', JSON.stringify(model.inputs[0].shape));
  console.log('Output shape:', JSON.stringify(model.outputs[0].shape));
  return model;
}

export function getModel(): TensorflowModel {
  if (!model) throw new Error('MoveNet not loaded — call loadMoveNetModel() first');
  return model;
}
