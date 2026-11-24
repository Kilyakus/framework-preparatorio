/** Limit browser navigation gestures while interacting with a studio surface.
 * Does not stop event propagation, so application tools still receive input.
 * Browser/OS/extension shortcuts intercepted outside the page cannot be blocked. */
export function installStudioBrowserGestureGuard({root=globalThis.document?.body}={}) {
  if(!root?.addEventListener)throw new TypeError('studio gesture guard requires a root element');
  const doc=root.ownerDocument, abort=new AbortController();
  const nodes=[...new Set([doc?.documentElement,doc?.body,root].filter(Boolean))];
  const styles=nodes.map(node=>[node,node.style.overscrollBehaviorX]);
  for(const [node] of styles)node.style.overscrollBehaviorX='none';
  const opts={capture:true,signal:abort.signal};
  const editable=target=>!!target?.closest?.('input,textarea,[contenteditable=""],[contenteditable="true"]');
  root.addEventListener('contextmenu',event=>{if(!editable(event.target))event.preventDefault();},opts);
  for(const type of ['pointerdown','mousedown','auxclick'])root.addEventListener(type,event=>{
    if(event.button===3||event.button===4)event.preventDefault();
    // Prevent native right-button drag navigation without suppressing studio handlers.
    else if(event.button===2 && !editable(event.target))event.preventDefault();
  },opts);
  let disposed=false;
  return ()=>{if(disposed)return;disposed=true;abort.abort();for(const [node,value] of styles)if(node.style.overscrollBehaviorX==='none')node.style.overscrollBehaviorX=value;};
}
