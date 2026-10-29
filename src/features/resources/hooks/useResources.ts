import type { LoraModel } from '@/domains/lora/types/lora';
import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { Json } from '@/shared/types/json';
import type { VideoMetadata } from '@/shared/lib/media/videoMetadata';
import type { ParameterSchema } from '@/tools/video-editor';

export interface PhaseConfigMetadata {
    name: string;
    description: string;
    phaseConfig: PhaseConfig;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    tags?: string[];
    use_count?: number;
    created_at: string;
    sample_generations?: {
        url: string;
        type: 'image' | 'video';
        alt_text?: string;
    }[];
    main_generation?: string;
    // Prompt and generation settings
    basePrompt?: string;
    negativePrompt?: string;
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
    // Generation type mode (I2V = image-to-video, VACE = structure video guidance)
    generationTypeMode?: 'i2v' | 'vace';
}

export interface StyleReferenceMetadata {
    name: string;
    styleReferenceImage: string;
    styleReferenceImageOriginal: string;
    thumbnailUrl: string | null;
    generationId?: string;
    styleReferenceStrength: number;
    subjectStrength: number;
    subjectDescription: string;
    inThisScene: boolean;
    inThisSceneStrength: number;
    referenceMode: 'style' | 'subject' | 'style-character' | 'scene' | 'custom';
    styleBoostTerms: string;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface StructureVideoMetadata {
    name: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    videoMetadata: VideoMetadata;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    createdAt: string;
}

export interface EffectMetadata {
    name: string;
    slug: string;
    code: string;
    category: 'entrance' | 'exit' | 'continuous';
    description: string;
    parameterSchema?: ParameterSchema;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
}

export interface SequenceComponentMetadata {
    name: string;
    slug: string;
    code: string;
    schemaJson: object;
    defaultsJson: object;
    /**
     * User-facing controls manifest. AI-generated sequences MUST emit this;
     * older saved components without a manifest are treated as "no controls"
     * (no migration). See src/tools/video-editor/sequences/controlsManifest.ts.
     */
    controlsManifest?: unknown[];
    clipType: string;
    themeId: string;
    description: string;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
}

export type ResourceType = 'lora' | 'phase-config' | 'style-reference' | 'structure-video' | 'effect' | 'sequence-component';
export type ResourceMetadata = LoraModel | PhaseConfigMetadata | StyleReferenceMetadata | StructureVideoMetadata | EffectMetadata | SequenceComponentMetadata;
export interface Resource {
    id: string;
    userId?: string;
    user_id?: string;
    generation_id?: string | null;
    type: ResourceType;
    metadata: ResourceMetadata | Json;
    isPublic?: boolean;
    is_public?: boolean;
    createdAt?: string;
    created_at?: string;
}
