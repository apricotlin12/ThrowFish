import type { Point } from './scoring';

// Shared pixels keep the rendered fish and its scoring footprint identical.
export const FISH_PIXELS: readonly (readonly [number, number, number, number, string])[] = [
  [-56,-12,8,24,'#395956'],[-48,-8,8,16,'#395956'],[-40,-12,12,24,'#395956'],
  [-28,-16,60,32,'#395956'],[32,-12,12,24,'#395956'],[44,-8,8,16,'#395956'],[52,-4,4,12,'#395956'],
  [-52,-8,4,16,'#6b9a8d'],[-48,-4,12,8,'#80ad9d'],[-36,-8,12,16,'#8bb6a4'],
  [-24,-12,56,24,'#84b2a2'],[32,-8,12,16,'#9ac5af'],[44,-4,8,8,'#9ac5af'],
  [-20,4,52,8,'#c9d7b7'],[28,4,16,4,'#c9d7b7'],[-24,-12,44,4,'#659488'],
  [-16,-20,20,4,'#527b73'],[-12,-16,24,4,'#659488'],[-12,12,16,8,'#659488'],
  [-16,-4,4,4,'#6c9f91'],[-4,0,4,4,'#6c9f91'],[8,-4,4,4,'#6c9f91'],[-28,0,4,4,'#6c9f91'],
  [24,-8,12,12,'#eaf0d5'],[28,-8,8,12,'#2c4746'],[28,-8,4,4,'#f9f8e8'],
  [44,4,8,4,'#395956'],[16,-4,4,12,'#5f8e82'],
];

export function visibleFishVertices(center: Point, angle: number): Point[] {
  const x=Math.round(center.x), y=Math.round(center.y);
  const cos=Math.cos(angle), sin=Math.sin(angle);
  return FISH_PIXELS.flatMap(([left,top,width,height]) =>
    [[left,top],[left+width,top],[left+width,top+height],[left,top+height]].map(([px,py]) =>
      ({x:x+px*cos-py*sin,y:y+px*sin+py*cos})));
}
