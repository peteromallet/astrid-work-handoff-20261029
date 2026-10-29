// @vitest-environment jsdom
import {describe,expect,it,vi} from 'vitest';
import {createShotStillStore,stillKey} from '../../../astrid/packs/rendering/ui/threejs-live-editor/shotStills';

describe('shot still store',()=>{
  it('keys by revision, start (to the millisecond) and size',()=>{
    expect(stillKey('r',1.00049)).toBe(stillKey('r',1));
    expect(stillKey('r',1)).not.toBe(stillKey('r2',1));
    expect(stillKey('r',1)).not.toBe(stillKey('r',1,640,360));
  });
  it('queues each start once, hands them out one at a time, and caches the result',()=>{
    const s=createShotStillStore();
    const seen=vi.fn();s.subscribe(seen);
    s.request('r',[0,5,5,2]);
    expect(s.get('r',5)).toEqual({status:'loading'});
    expect(s.busy('r')).toBe(true);
    expect(s.take('r')).toEqual({revision:'r',start:0});
    s.fulfil('r',0,'data:image/jpeg;base64,AA');
    expect(s.get('r',0)).toEqual({status:'ready',url:'data:image/jpeg;base64,AA'});
    s.request('r',[0,5]); // already known: not queued again
    expect(s.take('r')).toEqual({revision:'r',start:5});
    expect(s.take('r')).toEqual({revision:'r',start:2});
    expect(s.take('r')).toBeNull();
    expect(s.busy('r')).toBe(true); // 5 and 2 are loading until settled
    s.fulfil('r',5,'x');s.fail('r',2);
    expect(s.busy('r')).toBe(false);
    expect(s.get('r',2)).toEqual({status:'error'});
    expect(seen).toHaveBeenCalled();
  });
  it('never mixes revisions',()=>{
    const s=createShotStillStore();
    s.request('a',[1]);s.request('b',[1]);
    expect(s.take('b')).toEqual({revision:'b',start:1});
    expect(s.get('a',1)).toEqual({status:'loading'});
    s.fulfil('b',1,'img');
    expect(s.get('a',1).status).toBe('loading');
  });
  it('ignores invalid starts',()=>{
    const s=createShotStillStore();
    s.request('r',[-1,NaN,Infinity]);
    expect(s.busy('r')).toBe(false);
  });
  it('fails everything queued or loading for a revision when the scene fails',()=>{
    const s=createShotStillStore();
    s.request('r',[1,2,3]);s.request('other',[1]);
    s.take('r');
    s.failRevision('r');
    for(const t of [1,2,3]) expect(s.get('r',t)).toEqual({status:'error'});
    expect(s.take('r')).toBeNull();
    expect(s.get('other',1)).toEqual({status:'loading'});
  });
  it('evicts the oldest settled stills past the limit, never a pending one',()=>{
    const s=createShotStillStore(3);
    s.request('r',[1,2,3,4]);
    s.take('r');s.fulfil('r',1,'a');
    s.take('r');s.fulfil('r',2,'b');
    expect(s.get('r',1).status).toBe('idle');
    expect(s.get('r',3).status).toBe('loading');
    expect(s.get('r',4).status).toBe('loading');
  });
});
