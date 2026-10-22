/** Block only single-finger double-tap zoom inside the scoreboard, preserving pinch zoom. */
export function preventScoreboardDoubleTap(element,{now=()=>Date.now()}={}){
  let start=null,dragged=false,multiple=false,previous=null;
  const startTouch=e=>{
    if(e.touches.length!==1){multiple=true;previous=null;return;}
    multiple=false;dragged=false;start=e.touches[0];
  };
  const moveTouch=e=>{
    if(e.touches.length!==1){multiple=true;previous=null;return;}
    const p=e.touches[0];if(start&&Math.hypot(p.clientX-start.clientX,p.clientY-start.clientY)>10)dragged=true;
  };
  const endTouch=e=>{
    if(multiple||dragged||e.touches.length||e.changedTouches.length!==1){previous=null;return;}
    const p=e.changedTouches[0],time=now(),double=previous&&time-previous.time<300&&Math.hypot(p.clientX-previous.x,p.clientY-previous.y)<20;
    previous={time,x:p.clientX,y:p.clientY};
    if(!double||!e.cancelable)return;
    e.preventDefault();
    // Cancelling touchend suppresses Safari's following click. Preserve the second
    // intentional score tap rather than dropping a point while preventing zoom.
    const button=e.target.closest?.('button');if(button&&!button.disabled)button.click();
  };
  const cancel=()=>{start=null;previous=null;multiple=false;};
  element.addEventListener('touchstart',startTouch,{passive:true,capture:true});
  element.addEventListener('touchmove',moveTouch,{passive:true,capture:true});
  element.addEventListener('touchend',endTouch,{passive:false,capture:true});
  element.addEventListener('touchcancel',cancel,{passive:true,capture:true});
  element.addEventListener('dblclick',e=>e.preventDefault(),{capture:true});
}
