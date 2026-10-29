import {describe,it,expect} from 'vitest';
import {getPinnedTimelineElement} from './pinned-element-source';
describe('saved pinned element resolution',()=>{
 const clip={elementRef:{id:'tiles',kind:'effect' as const,revision:'draft-tiles'}};
 const app={elements:{tiles:{kind:'effect',revision:'draft-tiles',source:'export default function Tiles() {return null;}',label:'Tiles'}}};
 it('resolves after a complete save/reload JSON round trip',()=>expect(getPinnedTimelineElement(clip,JSON.parse(JSON.stringify(app)))?.source).toBe(app.elements.tiles.source));
 it.each(['kind','revision','packId','source'])('rejects missing or incompatible %s',field=>{
  const changed=JSON.parse(JSON.stringify(app));changed.elements.tiles[field]=field==='source'?'':'wrong';
  expect(getPinnedTimelineElement(clip,changed)).toBeUndefined();
 });
});
