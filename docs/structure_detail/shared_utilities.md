# Shared Utilities

**Source of Truth**: Source files below. **Key Invariants**: All in `src/shared/` (`@/shared/...`). Never hardcode colors. Prefer these over ad-hoc solutions.

## Utility Index

| Utility | Description | Source |
|---------|-------------|--------|
| `ModalContainer` / `ModalFooterButtons` | Responsive modal wrapping shadcn `Dialog` with header/footer/scroll. Use `ModalFooterButtons` for standard cancel/confirm footers. Props in TS interface | `src/shared/components/ModalContainer.tsx` |
| `ConfirmDialog` | Declarative confirmation dialog used directly or wrapped by feature-specific delete dialogs. Props in TS interface | `src/shared/components/dialogs/ConfirmDialog.tsx` |

## Migration Status

**ModalContainer** -- migrated: CreateProjectModal, ProjectSettingsModal. Not migrated (custom layouts): VideoGenerationModal, SettingsModal.

**ConfirmDialog** -- used directly by `ShotImageManagerMobile`; `DeleteConfirmationDialog` (ShotImageManager) wraps it where the copy needs to stay consistent.
