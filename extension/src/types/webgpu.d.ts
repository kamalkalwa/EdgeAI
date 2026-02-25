/**
 * Minimal WebGPU ambient declarations for TypeScript environments where
 * the built-in DOM lib does not yet ship complete WebGPU types.
 *
 * Only the surface used by selectModelForHardware() is declared here.
 * If @webgpu/types is added later, remove this file and let the package
 * declarations take over.
 */

interface GPUSupportedLimits {
  readonly maxBufferSize: number;
  readonly [key: string]: number;
}

interface GPUAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

interface GPUAdapter {
  readonly limits: GPUSupportedLimits;
  requestAdapterInfo(): Promise<GPUAdapterInfo>;
  requestDevice(): Promise<GPUDevice>;
}

interface GPU {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GPUAdapter | null>;
}

interface Navigator {
  readonly gpu: GPU | undefined;
}
