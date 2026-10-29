import type { AppError } from './errors';

type RuntimeErrorPresenter = (appError: AppError, toastTitle?: string) => boolean;

let presenter: RuntimeErrorPresenter | null = null;

export function installRuntimeErrorPresenter(nextPresenter: RuntimeErrorPresenter): void {
  presenter = nextPresenter;
}

export function presentRuntimeError(appError: AppError, toastTitle?: string): boolean {
  if (!presenter) {
    return false;
  }
  return presenter(appError, toastTitle);
}
