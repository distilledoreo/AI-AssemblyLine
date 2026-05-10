export type ReferenceAttachment = {
  id: string;
  role: string;
  filePath?: string;
  mimeType?: string;
  description?: string;
};

export type ComposedPrompt = {
  positivePrompt: string;
  negativePrompt: string;
  referenceImages: ReferenceAttachment[];
  generationSettings: {
    width: number;
    height: number;
    seed?: number;
    qualityMode?: string;
    duration?: number;
    aspectRatio?: string;
  };
  metadata: {
    sourceIds: string[];
    truncationWarnings: string[];
    conflictWarnings: string[];
  };
};

export type TextOptions = {
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "json" | "text";
};

export type TextResult = {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  modelId: string;
  providerJobId?: string;
};

export type ImageOptions = {
  modelId: string;
  width: number;
  height: number;
  count?: number;
  seed?: number;
  qualityMode?: string;
  referenceImages?: ReferenceAttachment[];
};

export type ImageResult = {
  images: { data: Buffer; mimeType: string }[];
  usage?: { units: number };
  modelId: string;
  providerJobId?: string;
  isAsync: boolean;
};

export type VideoOptions = {
  modelId: string;
  width: number;
  height: number;
  durationSeconds: number;
  seed?: number;
  startImage?: Buffer;
  endImage?: Buffer;
};

export type VideoResult = {
  video?: { data: Buffer; mimeType: string };
  providerJobId?: string;
  isAsync: boolean;
};

export type AsyncJobStatus = {
  status: "pending" | "processing" | "complete" | "failed";
  progress?: number;
  resultUrl?: string;
  error?: string;
};

export type TextCapabilities = {
  models: string[];
  structuredOutput: boolean;
  maxPromptLength: number;
};

export type ImageCapabilities = {
  models: string[];
  supportsTextToImage: boolean;
  supportsImageEditing: boolean;
  supportsReferenceImages: boolean;
  supportsSeeds: boolean;
  maxImageCount: number;
  aspectRatios: string[];
};

export type VideoCapabilities = {
  models: string[];
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsVideoExtension: boolean;
  requiresAsyncPolling: boolean;
  maxDurationSeconds: number;
  aspectRatios: string[];
};

export interface TextAdapter {
  slug: string;
  analyzeScript(prompt: string, options: TextOptions): Promise<TextResult>;
  generateStructuredOutput(prompt: string, schema: unknown, options: TextOptions): Promise<TextResult>;
  getCapabilities(): TextCapabilities;
}

export interface ImageAdapter {
  slug: string;
  generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult>;
  editImage?(baseImage: Buffer, prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult>;
  getCapabilities(): ImageCapabilities;
}

export interface VideoAdapter {
  slug: string;
  generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult>;
  checkJobStatus?(providerJobId: string): Promise<AsyncJobStatus>;
  getCapabilities(): VideoCapabilities;
}

export type ProviderAdapter = Partial<TextAdapter & ImageAdapter & VideoAdapter> & {
  slug: string;
};
