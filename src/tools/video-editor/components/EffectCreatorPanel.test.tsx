import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {EffectCreatorPanel} from './EffectCreatorPanel';
const compile=vi.hoisted(()=>vi.fn());
vi.mock('../effects/compileEffect.tsx',()=>({tryCompileEffectAsync:compile}));
vi.mock('../sequences/compileSequenceComponent.tsx',()=>({compileSequenceComponentAsync:compile}));
describe('retired inline element source entrypoints',()=>{
 it('offers a useful pack workflow without compiling or saving embedded source',()=>{
  const onSaved=vi.fn(),onOpenChange=vi.fn();
  render(<EffectCreatorPanel open onOpenChange={onOpenChange} onSaved={onSaved} editingEffect={{code:'throw new Error("must never execute")'} as never}/>);
  expect(screen.getByText('Custom effects use project packs')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();expect(compile).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button',{name:'Close',exact:true}).at(-1)!);expect(onOpenChange).toHaveBeenCalledWith(false,expect.anything());
 });
});
