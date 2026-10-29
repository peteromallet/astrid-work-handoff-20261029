/** Structural JSON value, shared by every module that stores or passes JSON payloads. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
