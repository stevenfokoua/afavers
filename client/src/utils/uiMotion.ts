const current = new WeakMap<Element, Animation>();
export const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function play(element: Element | null, frames: Keyframe[], duration: number) {
  if (!element) return;
  current.get(element)?.cancel();
  if (reducedMotion() || !element.animate) return;
  const animation = element.animate(frames, {
    duration,
    easing: 'cubic-bezier(.2,.8,.2,1)'
  });
  current.set(element, animation);
  animation.finished.then(() => {
    if (current.get(element) === animation) current.delete(element);
  }).catch(() => {});
}
export const settleDetails = (element: Element | null) => play(element, [{
  transform: 'translateX(8px)'
}, {
  transform: 'translateX(0)'
}], 180);
export const confirmSaved = (element: Element | null) => play(element, [{
  transform: 'scale(.92)'
}, {
  transform: 'scale(1)'
}], 120);
export function moveCard(element: Element, from: DOMRect) {
  const to = element.getBoundingClientRect();
  if (from.x !== to.x || from.y !== to.y) play(element, [{
    transform: `translate(${from.x - to.x}px,${from.y - to.y}px)`
  }, {
    transform: 'translate(0,0)'
  }], 180);
}
