import {afterEach,describe,expect,it,vi} from 'vitest';
import {confirmSaved,moveCard,settleDetails} from './uiMotion';
afterEach(()=>vi.unstubAllGlobals());
function element(){const cancel=vi.fn(),animate=vi.fn(()=>({cancel,finished:new Promise(()=>{})}));return {node:{animate,getBoundingClientRect:()=>({x:10,y:20})} as unknown as Element,animate,cancel};}
describe('concise motion',()=>{
  it('cancels superseded movement and uses bounded, distinct durations',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:false})});const {node,animate,cancel}=element();
    settleDetails(node);confirmSaved(node);
    expect(cancel).toHaveBeenCalledTimes(1);expect(animate.mock.calls.map(call=>(call as unknown[])[1])).toMatchObject([{duration:180},{duration:120}]);
  });
  it('cancels an active animation and applies reduced-motion feedback instantly',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:false})});const {node,animate,cancel}=element();settleDetails(node);
    vi.stubGlobal('window',{matchMedia:()=>({matches:true})});confirmSaved(node);
    expect(cancel).toHaveBeenCalledTimes(1);expect(animate).toHaveBeenCalledTimes(1);
  });
  it('does not animate unchanged cards and keeps a real move below 200ms',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:false})});const {node,animate}=element();
    moveCard(node,{x:10,y:20} as DOMRect);expect(animate).not.toHaveBeenCalled();
    moveCard(node,{x:40,y:50} as DOMRect);expect(animate.mock.calls[0]).toMatchObject([expect.any(Array),{duration:180}]);
  });
});
