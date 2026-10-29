// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const surface=vi.hoisted(()=>({props:null as null|Record<string,any>,mounts:0}));
vi.mock('../../../astrid/packs/rendering/ui/threejs-live-editor/SceneSurface',async()=>{
  const {createElement,useEffect}=await import('react');
  return {SceneSurface:(props:Record<string,any>)=>{
    surface.props=props;
    useEffect(()=>{surface.mounts+=1;return()=>{surface.props=null;};},[]);
    return createElement('div',{'data-testid':'surface'});
  }};
});
import {ShotStillRenderer} from '../../../astrid/packs/rendering/ui/threejs-live-editor/shotStillRenderer';
import {createShotStillStore} from '../../../astrid/packs/rendering/ui/threejs-live-editor/shotStills';

const flush=async(ms=200)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});};
beforeEach(()=>{vi.useFakeTimers();surface.props=null;surface.mounts=0;});
afterEach(()=>{cleanup();vi.useRealTimers();});

describe('ShotStillRenderer',()=>{
  it('mounts nothing until a still is wanted',async()=>{
    const store=createShotStillStore();
    const {container}=render(<ShotStillRenderer source={{}} revision="r" store={store}/>);
    await flush();
    expect(container.innerHTML).toBe('');
    expect(surface.mounts).toBe(0);
  });
  it('renders queued stills one at a time at thumbnail size with capture, then releases the instance',async()=>{
    const store=createShotStillStore();
    const {container}=render(<ShotStillRenderer source={{}} revision="r" store={store}/>);
    act(()=>{store.request('r',[0,6]);});
    await flush();
    expect(surface.props).toMatchObject({sourceTime:0,width:320,height:180,capture:true});
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // The second still is not requested until the first is acknowledged.
    expect(store.get('r',6).status).toBe('loading');
    act(()=>{surface.props!.onStatus({phase:'ready',revision:'r',sourceTime:0,image:'data:image/jpeg;base64,AA'});});
    expect(store.get('r',0)).toEqual({status:'ready',url:'data:image/jpeg;base64,AA'});
    await flush();
    expect(surface.props).toMatchObject({sourceTime:6});
    act(()=>{surface.props!.onStatus({phase:'ready',revision:'r',sourceTime:6});}); // no image: that still fails alone
    expect(store.get('r',6)).toEqual({status:'error'});
    await flush(5000);
    expect(surface.props).toBeNull();
  });
  it('ignores acknowledgements for another time and fails the queue when the scene errors',async()=>{
    const store=createShotStillStore();
    render(<ShotStillRenderer source={{}} revision="r" store={store}/>);
    act(()=>{store.request('r',[3,4]);});
    await flush();
    act(()=>{surface.props!.onStatus({phase:'ready',revision:'r',sourceTime:1e-6,image:'data:image/jpeg;base64,AA'});});
    expect(store.get('r',3).status).toBe('loading');
    act(()=>{surface.props!.onStatus({phase:'error',revision:'r',error:'boom'});});
    expect(store.get('r',3).status).toBe('error');
    expect(store.get('r',4).status).toBe('error');
  });
});
