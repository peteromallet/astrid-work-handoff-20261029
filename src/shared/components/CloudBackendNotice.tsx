interface CloudBackendNoticeProps {
  toolName: string;
}

export function CloudBackendNotice({ toolName }: CloudBackendNoticeProps) {
  return (
    <p role="status" data-testid="cloud-backend-notice" className="text-sm text-muted-foreground">
      {toolName} needs an online account, which isn&apos;t available yet.
    </p>
  );
}
