/**
 * Shader/WebGL family module.
 *
 * Houses the shader family contracts:
 * ShaderContribution manifest interface plus the
 * associated source/pass/uniform/texture/materializer descriptors,
 * ShaderRegistrationOptions, and ShaderRegistrationService.
 *
 * This module contains only data-only types and read-only surfaces; no
 * registry, provider, resolver, or DOM behaviour lives here.
 *
 * @publicContract
 */

import type { ContributionId } from '../../ids';
import type { DisposeHandle } from '../../dispose';
import type { RenderRoute } from '../rendering/renderability.ts';

// ---------------------------------------------------------------------------
// Shader/WebGL contributions
// ---------------------------------------------------------------------------

/** Shader pass scopes supported by the V1 WebGL bridge. */
export type ShaderPassKind = 'clip' | 'overlay' | 'postprocess';

/** Color-space posture declared by a shader pass or texture input. */
export type ShaderColorSpace = 'srgb' | 'linear';

/** Host-owned fallback posture when a shader cannot compile or preview. */
export type ShaderFallbackBehavior = 'bypass' | 'transparent' | 'solid-black';

/** Texture source categories supported by the V1 shader bridge. */
export type ShaderTextureSourceKind =
  | 'clip-frame'
  | 'static-image-asset'
  | 'live-generated-frame';

/** Texture sampling filter used by the WebGL preview bridge. */
export type ShaderTextureFilter = 'nearest' | 'linear';

/** Texture coordinate wrapping policy used by the WebGL preview bridge. */
export type ShaderTextureWrap = 'clamp-to-edge' | 'repeat' | 'mirrored-repeat';

/**
 * Shader source supplied inline by the manifest or during registration.
 *
 * Fragment source is required for inline programs. Vertex source is optional
 * because the host can provide the default fullscreen-triangle vertex shader.
 */
export interface ShaderInlineSource {
  readonly kind: 'inline';
  readonly fragment: string;
  readonly vertex?: string;
}

/** Shader source resolved by the extension runtime from a module export. */
export interface ShaderModuleSource {
  readonly kind: 'module';
  readonly specifier: string;
  readonly exportName?: string;
}

/** Public shader source descriptor. */
export type ShaderSourceDescriptor = ShaderInlineSource | ShaderModuleSource;

/**
 * Shader pass descriptor.
 *
 * V1 supports a single shader per clip scope and one active postprocess shader.
 * Ordered stacks, multipass FBO chains, feedback buffers, and shader transitions
 * remain outside this SDK contract.
 */
export interface ShaderPassDescriptor {
  readonly kind: ShaderPassKind;
  /** Uniform name of the host-provided input texture for this pass, if any. */
  readonly inputTextureUniform?: string;
  /** Expected color space for input and output conversion. */
  readonly colorSpace?: ShaderColorSpace;
  /** Whether the output alpha is preserved or treated as opaque by the host. */
  readonly alpha?: 'preserve' | 'opaque';
}

/** Supported shader uniform control/value kinds for V1. */
export type ShaderUniformType =
  | 'float'
  | 'int'
  | 'bool'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color'
  | 'enum'
  | 'object'
  | 'textureRef'
  | 'frame'
  | 'time';

/**
 * Sub-field value kinds for structured `object` uniforms. Mirrors the
 * manifest schema's `fields[].type` enum, which excludes `object` (no nesting).
 */
export type ShaderUniformFieldType = Exclude<ShaderUniformType, 'object'>;

/** Enum option for shader uniform controls. */
export interface ShaderUniformEnumOption {
  readonly label: string;
  readonly value: string;
}

/** Texture reference value used by textureRef uniforms. */
export interface ShaderTextureRef {
  readonly kind: ShaderTextureSourceKind;
  /** Asset key, live source ID, generated frame ID, or host-defined frame ref. */
  readonly ref?: string;
}

/** Default values accepted by shader uniform definitions. */
export type ShaderUniformDefaultValue =
  | number
  | boolean
  | string
  | readonly number[]
  | ShaderTextureRef
  | ShaderUniformObjectValue;

/** Value of a structured `object` uniform, keyed by sub-field name. */
export interface ShaderUniformObjectValue {
  readonly [fieldName: string]: ShaderUniformDefaultValue;
}

/** A bounded sub-field of a structured `object` uniform. */
export interface ShaderUniformFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly type: ShaderUniformFieldType;
  readonly default?: ShaderUniformDefaultValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly ShaderUniformEnumOption[];
}

/** A host-rendered shader uniform definition. */
export interface ShaderUniformDefinition {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly type: ShaderUniformType;
  readonly default?: ShaderUniformDefaultValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly ShaderUniformEnumOption[];
  /** Bounded sub-field definitions; only meaningful when `type` is `object`. */
  readonly fields?: readonly ShaderUniformFieldDefinition[];
}

/** Ordered shader uniform schema. */
export type ShaderUniformSchema = readonly ShaderUniformDefinition[];

/** A host-provided texture input binding for a shader. */
export interface ShaderTextureDefinition {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  /** The sampler uniform that receives this texture. Defaults to `name`. */
  readonly uniform?: string;
  readonly sourceKind: ShaderTextureSourceKind;
  readonly required?: boolean;
  readonly colorSpace?: ShaderColorSpace;
  readonly filter?: ShaderTextureFilter;
  readonly wrap?: ShaderTextureWrap;
}

/** Ordered shader texture binding schema. */
export type ShaderTextureSchema = readonly ShaderTextureDefinition[];

/**
 * Optional materializer metadata.
 *
 * This descriptor advertises where a later planner may look for a route that
 * produces RenderMaterial. It does not make browser preview exportable.
 */
export interface ShaderMaterializerDescriptor {
  readonly routes?: readonly RenderRoute[];
  readonly requiredCapabilities?: readonly string[];
  readonly processId?: string;
  readonly operationId?: string;
  readonly unavailableMessage?: string;
}

/** A shader/WebGL contribution declared in an extension manifest. */
export interface ShaderContribution {
  /** Unique within the extension. */
  id: ContributionId;
  kind: 'shader';
  /** Identifier used in ctx.shaders.registerShader(). */
  shaderId: string;
  /** Human-readable label for picker, inspector, and diagnostics. */
  label: string;
  readonly description?: string;
  /** Pass scope; use a descriptor when color/alpha/input details matter. */
  pass: ShaderPassKind | ShaderPassDescriptor;
  readonly source?: ShaderSourceDescriptor;
  readonly uniforms?: ShaderUniformSchema;
  readonly textures?: ShaderTextureSchema;
  readonly fallback?: ShaderFallbackBehavior;
  readonly materializer?: ShaderMaterializerDescriptor;
  /** Lower values sort first. Default 0. */
  readonly order?: number;
  /** Optional visibility predicate (evaluated by host). */
  readonly when?: string;
}

/** Options for imperative shader registration via ctx.shaders.registerShader(). */
export interface ShaderRegistrationOptions {
  readonly label?: string;
  readonly pass?: ShaderPassKind | ShaderPassDescriptor;
  readonly uniforms?: ShaderUniformSchema;
  readonly textures?: ShaderTextureSchema;
  readonly fallback?: ShaderFallbackBehavior;
  readonly materializer?: ShaderMaterializerDescriptor;
}

/**
 * Shader registration service available as `ctx.shaders` during activate().
 *
 * Shaders are registered through a dedicated WebGL bridge surface, not through
 * `ctx.effects.registerComponent()`. The `shaderId` must match a
 * {@link ShaderContribution} in the extension manifest.
 */
export interface ShaderRegistrationService {
  registerShader(
    shaderId: string,
    source: ShaderSourceDescriptor,
    options?: ShaderRegistrationOptions,
  ): DisposeHandle;
}
