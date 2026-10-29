import { Dialog, DialogContent } from "@/shared/components/ui/dialog";

type ValidDialogFixtureProps = {
  isOpen: boolean;
};

export function ValidDialogFixture({ isOpen }: ValidDialogFixtureProps) {
  return (
    <Dialog open={isOpen}>
      {isOpen ? <DialogContent>Content</DialogContent> : null}
    </Dialog>
  );
}
