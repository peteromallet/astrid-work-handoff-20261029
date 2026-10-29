import { Dialog } from "@/shared/components/ui/dialog";

type InvalidDialogFixtureProps = {
  isOpen: boolean;
};

export function InvalidDialogFixture({ isOpen }: InvalidDialogFixtureProps) {
  if (!isOpen) return null;

  return <Dialog open={isOpen} />;
}
