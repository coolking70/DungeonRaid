/** Tile selection and inspection are mutually exclusive within a pointer gesture.
 * Native ProcessTileSelection @0x2c8dc hides the initial enemy tooltip on movement.
 * The port retains its .45s stationary hold and permits 8 logical pixels of jitter.
 */
export class TileInspection {
  allowed=false;
  private start={x:0,y:0,slot:-1};
  begin(x:number,y:number,slot:number){this.start={x,y,slot};this.allowed=true;}
  move(x:number,y:number,slot:number|null){
    if(Math.hypot(x-this.start.x,y-this.start.y)>8||(slot!==null&&slot!==this.start.slot))this.allowed=false;
  }
  reset(){this.allowed=false;}
  canShow(nodes:readonly number[]){return this.allowed&&nodes.length===1&&nodes[0]===this.start.slot;}
}
