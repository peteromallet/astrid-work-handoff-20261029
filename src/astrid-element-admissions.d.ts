declare module 'virtual:astrid-element-admissions' {
  export const projectId: string | null;
  export const configured: boolean;
  export const selectionDigest: string;
  export const realmId: string | null;
  export const projects: readonly import('./tools/video-editor/runtime/admitted-elements').ProjectElementAuthoring[];
  export const elements: readonly import('./tools/video-editor/runtime/admitted-elements').AdmittedElement[];
  export const components: Readonly<Record<string, import('react').ComponentType<import('./tools/video-editor/runtime/astrid-element-host').AstridElementComponentProps>>>;
}
