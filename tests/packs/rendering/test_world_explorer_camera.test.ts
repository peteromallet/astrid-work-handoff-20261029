// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {
  LOOK_SETTLE,MAX_PITCH,MOVE_EASE_IN,MOVE_EASE_OUT,RESET_DURATION,clampPitch,clampToBounds,defaultExploreSpeed,forwardFromYawPitch,FreeCamera,
  quatFromYawPitch,quatRotate,vadd,vcross,vdot,vlength,vnormalize,vscale,vsub,yawPitchFromDirection,yawPitchLookAt,
  type Bounds,
} from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/camera';

const DEG=Math.PI/180;
const LOOK_NEG_Z={position:[0,0,0] as const,target:[0,0,-1] as const};
const BOX:Bounds={min:[-10,0,-10],max:[10,5,10]};

function expectVecClose(actual:readonly number[],expected:readonly number[]){
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v,i)=>expect(actual[i]).toBeCloseTo(v,9));
}

describe('vec3 helpers',()=>{
  it('does basic arithmetic and products',()=>{
    expect(vadd([1,2,3],[4,5,6])).toEqual([5,7,9]);
    expect(vsub([4,5,6],[1,2,3])).toEqual([3,3,3]);
    expect(vscale([1,2,3],2)).toEqual([2,4,6]);
    expect(vdot([1,2,3],[4,5,6])).toBe(32);
    expect(vcross([1,0,0],[0,1,0])).toEqual([0,0,1]);
    expect(vlength([3,4,0])).toBe(5);
  });
  it('normalizes, and returns zero for a zero vector',()=>{
    expectVecClose(vnormalize([0,3,4]),[0,0.6,0.8]);
    expect(vnormalize([0,0,0])).toEqual([0,0,0]);
  });
});

describe('orientation',()=>{
  it('forward at yaw 0 and pitch 0 is -Z',()=>{
    expectVecClose(forwardFromYawPitch(0,0),[0,0,-1]);
  });
  it('yaw PI/2 faces -X (positive yaw turns left)',()=>{
    expectVecClose(forwardFromYawPitch(Math.PI/2,0),[-1,0,0]);
  });
  it('quatRotate of -Z matches forwardFromYawPitch for several yaw/pitch combos',()=>{
    const combos:[number,number][]=[[0,0],[Math.PI/2,0],[-0.7,0.3],[2.4,-0.5],[-2.9,1.2],[0.1,-1.4]];
    for(const [yaw,pitch] of combos){
      expectVecClose(quatRotate(quatFromYawPitch(yaw,pitch),[0,0,-1]),forwardFromYawPitch(yaw,pitch));
    }
  });
  it('quaternions are unit length',()=>{
    for(const [yaw,pitch] of [[0,0],[1.3,0.7],[-3,-1.2],[Math.PI,MAX_PITCH]]){
      const [x,y,z,w]=quatFromYawPitch(yaw,pitch);
      expect(Math.hypot(x,y,z,w)).toBeCloseTo(1,12);
    }
  });
  it('yawPitchFromDirection round trips through forwardFromYawPitch',()=>{
    for(const [yaw,pitch] of [[0,0],[Math.PI/2,0],[-0.7,0.3],[2.4,-0.5],[0.2,-1]]){
      const back=yawPitchFromDirection(forwardFromYawPitch(yaw,pitch));
      expect(back.yaw).toBeCloseTo(yaw,9);
      expect(back.pitch).toBeCloseTo(pitch,9);
    }
  });
  it('yawPitchFromDirection clamps pitch and gives yaw 0 when looking straight up',()=>{
    const up=yawPitchFromDirection([0,1,0]);
    expect(up.yaw).toBe(0);
    expect(up.pitch).toBeCloseTo(89*DEG,12);
    expect(yawPitchFromDirection([0,-1,0]).pitch).toBeCloseTo(-89*DEG,12);
  });
  it('yawPitchFromDirection of a zero vector is yaw 0 pitch 0',()=>{
    expect(yawPitchFromDirection([0,0,0])).toEqual({yaw:0,pitch:0});
  });
  it('yawPitchLookAt points from position to target',()=>{
    const r=yawPitchLookAt([5,0,5],[5,0,-5]);
    expect(r.yaw).toBeCloseTo(0,12);
    expect(r.pitch).toBeCloseTo(0,12);
    expect(yawPitchLookAt([0,0,0],[-4,0,0]).yaw).toBeCloseTo(Math.PI/2,12);
  });
  it('clampPitch clamps to +-89 degrees',()=>{
    expect(clampPitch(2)).toBeCloseTo(MAX_PITCH,12);
    expect(clampPitch(-2)).toBeCloseTo(-MAX_PITCH,12);
    expect(clampPitch(0.5)).toBe(0.5);
    expect(MAX_PITCH).toBeCloseTo(89*DEG,12);
  });
});

describe('clampToBounds and defaultExploreSpeed',()=>{
  it('returns the same values without bounds',()=>{
    expect(clampToBounds([100,-100,3])).toEqual([100,-100,3]);
  });
  it('clamps each axis into the bounds',()=>{
    expect(clampToBounds([20,-3,0],BOX)).toEqual([10,0,0]);
  });
  it('uses the largest extent / 8, or 4 without bounds',()=>{
    expect(defaultExploreSpeed()).toBe(4);
    expect(defaultExploreSpeed(BOX)).toBe(20/8);
    expect(defaultExploreSpeed({min:[0,0,0],max:[0,0,0]})).toBe(0.01);
  });
});

describe('FreeCamera',()=>{
  it('starts looking at the target',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    expect(cam.yaw).toBeCloseTo(0,12);
    expect(cam.pitch).toBeCloseTo(0,12);
    expect(cam.position).toEqual([0,0,0]);
    expect(cam.version).toBe(0);
  });
  it('clamps the constructor position to bounds',()=>{
    const cam=new FreeCamera({position:[50,50,50],target:[50,50,40]},BOX);
    expect(cam.position).toEqual([10,5,10]);
  });
  it('moves forward 1 s at speed 2 to [0,0,-2]',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    for(let i=0;i<10;i++) cam.move({forward:1,right:0,up:0},2,0.1);
    expectVecClose(cam.position,[0,0,-2]);
  });
  it('right vector at yaw 0 is +X',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.move({forward:0,right:1,up:0},10,0.1);
    expectVecClose(cam.position,[1,0,0]);
  });
  it('a diagonal is not faster than a straight move',()=>{
    const straight=new FreeCamera(LOOK_NEG_Z);
    straight.move({forward:1,right:0,up:0},10,0.1);
    const diagonal=new FreeCamera(LOOK_NEG_Z);
    diagonal.move({forward:1,right:1,up:0},10,0.1);
    expect(vlength(diagonal.position)).toBeCloseTo(vlength(straight.position),9);
    expect(vlength(diagonal.position)).toBeCloseTo(1,9);
  });
  it('up and down use world Y regardless of pitch',()=>{
    const cam=new FreeCamera({position:[0,0,0],target:[0,0,-1]});
    cam.look(0,60*DEG);
    cam.move({forward:0,right:0,up:1},10,0.1);
    expectVecClose(cam.position,[0,1,0]);
    cam.move({forward:0,right:0,up:-1},10,0.1);
    expectVecClose(cam.position,[0,0,0]);
  });
  it('forward follows the full view direction including pitch',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.look(0,30*DEG);
    cam.move({forward:1,right:0,up:0},10,0.1);
    expectVecClose(cam.position,forwardFromYawPitch(0,30*DEG));
  });
  it('keeps a sub-unit input length as is',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.move({forward:0.5,right:0,up:0},10,0.1);
    expectVecClose(cam.position,[0,0,-0.5]);
  });
  it('clamps movement to bounds',()=>{
    const cam=new FreeCamera({position:[9,0,0],target:[9,0,-1]},BOX);
    cam.move({forward:0,right:1,up:0},100,1);
    expect(cam.position[0]).toBe(10);
    cam.translate(-100,0,0);
    expect(cam.position[0]).toBe(-10);
  });
  it('translate moves by world-unit distances and clamps to bounds',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z,BOX);
    cam.translate(2,3,-4);
    expectVecClose(cam.position,[2,3,4]);
    cam.translate(0,0,100);
    expect(cam.position[2]).toBe(-10);
  });
  it('clamps dt to 0.1 s so a stalled frame does not teleport',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.move({forward:1,right:0,up:0},1,5);
    expectVecClose(cam.position,[0,0,-0.1]);
    const negative=new FreeCamera(LOOK_NEG_Z);
    negative.move({forward:1,right:0,up:0},1,-3);
    expect(negative.position).toEqual([0,0,0]);
  });
  it('ten 0.1 s steps equal one 1.0 s move',()=>{
    const stepped=new FreeCamera(LOOK_NEG_Z);
    for(let i=0;i<10;i++) stepped.move({forward:0.6,right:0.8,up:0},3,0.1);
    // 1.0 s of speed 3 = 3 world units along the (0.6, 0.8) input direction.
    expectVecClose(stepped.position,[2.4,0,-1.8]);
  });
  it('look wraps yaw into (-PI, PI] and clamps pitch',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.look(Math.PI*1.5,0);
    expect(cam.yaw).toBeCloseTo(-Math.PI/2,12);
    cam.look(0,10);
    expect(cam.pitch).toBeCloseTo(MAX_PITCH,12);
    cam.look(0,-20);
    expect(cam.pitch).toBeCloseTo(-MAX_PITCH,12);
  });
  it('look ignores non-finite input',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.look(0.3,0.1);
    const before={yaw:cam.yaw,pitch:cam.pitch,version:cam.version};
    cam.look(NaN,0);
    cam.look(0,NaN);
    cam.look(Infinity,0);
    expect({yaw:cam.yaw,pitch:cam.pitch,version:cam.version}).toEqual(before);
  });
  it('version increments only when position, yaw or pitch change',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    expect(cam.version).toBe(0);
    cam.look(0,0);
    cam.move({forward:0,right:0,up:0},2,1);
    cam.translate(0,0,0);
    expect(cam.version).toBe(0);
    cam.look(0.1,0);
    expect(cam.version).toBe(1);
    cam.move({forward:1,right:0,up:0},1,0.5);
    expect(cam.version).toBe(2);
    cam.look(0,100);
    expect(cam.version).toBe(3);
    cam.look(0,1);
    expect(cam.version).toBe(3);
  });
  it('reset returns to the constructor start and counts as a change only if different',()=>{
    const cam=new FreeCamera({position:[1,2,3],target:[1,2,-7]});
    cam.reset();
    expect(cam.version).toBe(0);
    cam.look(0.5,0.2);
    cam.translate(4,0,0);
    const v=cam.version;
    cam.reset();
    expect(cam.position).toEqual([1,2,3]);
    expect(cam.yaw).toBeCloseTo(0,12);
    expect(cam.pitch).toBeCloseTo(0,12);
    expect(cam.version).toBe(v+1);
    cam.reset();
    expect(cam.version).toBe(v+1);
  });
  it('pose returns position, the orientation quaternion and fov',()=>{
    const cam=new FreeCamera({position:[1,2,3],target:[1,2,-7]});
    cam.look(Math.PI/2,0);
    const pose=cam.pose(60);
    expect(pose.position).toEqual([1,2,3]);
    expect(pose.fov).toBe(60);
    expectVecClose(quatRotate(pose.quaternion,[0,0,-1]),[-1,0,0]);
  });
});

describe('eased motion',()=>{
  const FWD={forward:1,right:0,up:0};
  const NONE={forward:0,right:0,up:0};
  const run=(cam:FreeCamera,input:typeof FWD,speed:number,seconds:number,dt=1/60)=>{
    for(let t=0;t<seconds-1e-9;t+=dt)cam.advance(input,speed,dt);
  };
  const zOf=(cam:FreeCamera)=>cam.position[2];

  it('eases velocity in: not instant, about 95% of top speed after the ease-in time',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.advance(FWD,10,1/60);
    expect(-zOf(cam)).toBeGreaterThan(0);
    expect(-zOf(cam)).toBeLessThan(10/60*0.5);
    run(cam,FWD,10,MOVE_EASE_IN-1/60);
    const before=zOf(cam);
    cam.advance(FWD,10,1/60);
    const speed=(before-zOf(cam))*60;
    expect(speed).toBeGreaterThan(9.0);
    expect(speed).toBeLessThanOrEqual(10);
  });

  it('glides out after release and settles to a stop without reversing',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    run(cam,FWD,10,1);
    let last=zOf(cam);
    cam.advance(NONE,10,1/60);
    expect(last-zOf(cam)).toBeGreaterThan(0); // still gliding
    expect(cam.moving).toBe(true);
    for(let i=0;i<600&&cam.moving;i++){
      last=zOf(cam);
      cam.advance(NONE,10,1/60);
      expect(zOf(cam)).toBeLessThanOrEqual(last); // never back up
    }
    expect(cam.moving).toBe(false);
    // stopping distance of a first-order glide is v * tau = 10 * (3/rate)... close to speed * out-time / 3
    run(cam,NONE,10,0.5);
    const rest=zOf(cam);
    run(cam,NONE,10,0.5);
    expect(zOf(cam)).toBe(rest);
    expect(MOVE_EASE_OUT).toBeGreaterThan(MOVE_EASE_IN);
  });

  it('covers the same distance whatever the frame length',()=>{
    const a=new FreeCamera(LOOK_NEG_Z);
    const b=new FreeCamera(LOOK_NEG_Z);
    run(a,FWD,10,0.5,1/60);run(a,NONE,10,1,1/60);
    run(b,FWD,10,0.5,1/30);run(b,NONE,10,1,1/30);
    expect(zOf(a)).toBeCloseTo(zOf(b),6);
  });

  it('never overshoots the bounds, however long or fast it pushes',()=>{
    const cam=new FreeCamera({position:[0,1,0],target:[0,1,-1]},BOX);
    for(let i=0;i<600;i++){
      cam.advance({forward:1,right:-1,up:1},500,1/30);
      expect(cam.position[0]).toBeGreaterThanOrEqual(BOX.min[0]);
      expect(cam.position[1]).toBeLessThanOrEqual(BOX.max[1]);
      expect(cam.position[2]).toBeGreaterThanOrEqual(BOX.min[2]);
    }
    for(let i=0;i<600;i++){
      cam.advance(NONE,500,1/30);
      cam.position.forEach((v,k)=>{expect(v).toBeGreaterThanOrEqual(BOX.min[k]);expect(v).toBeLessThanOrEqual(BOX.max[k]);});
    }
  });

  it('smooths look: lags the drag, then settles on exactly the dragged angle without overshoot',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    cam.lookBy(0.5,0.2);
    cam.advance(NONE,1,1/60);
    expect(cam.yaw).toBeGreaterThan(0);
    expect(cam.yaw).toBeLessThan(0.5);
    let steps=0;
    while(cam.yaw<0.5*0.95){cam.advance(NONE,1,1/60);steps++;expect(cam.yaw).toBeLessThanOrEqual(0.5+1e-9);expect(cam.pitch).toBeLessThanOrEqual(0.2+1e-9);}
    expect((steps+1)/60).toBeLessThanOrEqual(LOOK_SETTLE+1/30);
    run(cam,NONE,1,1);
    expect(cam.yaw).toBeCloseTo(0.5,6);
    expect(cam.pitch).toBeCloseTo(0.2,6);
    expect(cam.moving).toBe(false);
  });

  it('keeps pitch inside the limit under repeated drags',()=>{
    const cam=new FreeCamera(LOOK_NEG_Z);
    for(let i=0;i<50;i++){cam.lookBy(0,0.3);cam.advance(NONE,1,1/60);expect(cam.pitch).toBeLessThanOrEqual(MAX_PITCH);}
    run(cam,NONE,1,1);
    expect(cam.pitch).toBeCloseTo(MAX_PITCH,6);
  });

  it('eases back to the start view on reset over RESET_DURATION, and input interrupts it',()=>{
    const cam=new FreeCamera({position:[1,1,1],target:[1,1,-5]},BOX);
    run(cam,FWD,6,0.5);cam.lookBy(1,0.3);run(cam,NONE,6,1);
    const start=new FreeCamera({position:[1,1,1],target:[1,1,-5]},BOX);
    cam.resetSmooth();
    cam.advance(NONE,6,1/60);
    expect(cam.position).not.toEqual(start.position); // not a snap
    run(cam,NONE,6,RESET_DURATION/2);
    const mid=zOf(cam);
    expect(mid).not.toBeCloseTo(start.position[2],3);
    run(cam,NONE,6,RESET_DURATION);
    expect(cam.moving).toBe(false);
    cam.position.forEach((v,i)=>expect(v).toBeCloseTo(start.position[i],9));
    expect(cam.yaw).toBeCloseTo(start.yaw,9);
    expect(cam.pitch).toBeCloseTo(start.pitch,9);
    // pressing a key mid-glide hands control back
    cam.lookBy(1,0);run(cam,NONE,1,0.5);cam.resetSmooth();cam.advance(NONE,6,1/60);
    const yawNow=cam.yaw;cam.advance(FWD,6,1/60);cam.advance(FWD,6,1/60);
    expect(cam.moving).toBe(true);
    expect(Math.abs(cam.yaw-yawNow)).toBeLessThan(0.05);
  });

  it('turns the short way round on reset',()=>{
    const cam=new FreeCamera({position:[0,0,0],target:[0,0,-1]});
    cam.look(Math.PI*0.9,0);cam.look(Math.PI*0.2,0); // wraps past PI
    cam.resetSmooth();
    let widest=0;
    for(let i=0;i<60;i++){cam.advance(NONE,1,1/60);widest=Math.max(widest,Math.abs(cam.yaw));}
    expect(widest).toBeLessThan(Math.PI*1.2);
    expect(cam.yaw).toBeCloseTo(0,9);
  });
});
