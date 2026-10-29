/** Bridge-owned write permission; native agent sessions keep their own identity. */
export type AcpSessionControl = {
  role: 'writer' | 'follower';
  active: boolean;
  activeRequestId: string | null;
};

export const ACP_SESSION_CONTROL_UPDATE = 'astrid_session_control';
export const ACP_SESSION_CONTROL_FIELD = '_astridSession';
