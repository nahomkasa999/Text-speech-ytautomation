/**
 * Base Scene Graph Layer Model
 * Core geometry, lifecycle, and JSON serialization.
 */

export class Layer {
  constructor(data = {}) {
    this.id = data.id || `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.name = data.name || 'Layer';
    this.type = data.type || 'layer';
    this.visible = data.visible !== false;
    this.locked = !!data.locked;
    
    // Timeline boundaries (in seconds)
    this.startTime = typeof data.startTime === 'number' ? data.startTime : 0;
    this.endTime = typeof data.endTime === 'number' ? data.endTime : 999999;
    
    // Canvas geometry (in canvas pixels e.g. 1920x1080)
    this.x = typeof data.x === 'number' ? data.x : 100;
    this.y = typeof data.y === 'number' ? data.y : 100;
    this.width = typeof data.width === 'number' ? data.width : 400;
    this.height = typeof data.height === 'number' ? data.height : 200;
    this.rotation = typeof data.rotation === 'number' ? data.rotation : 0; // degrees
    this.opacity = typeof data.opacity === 'number' ? data.opacity : 1.0; // 0 to 1
    
    this.parentId = data.parentId || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      locked: this.locked,
      startTime: this.startTime,
      endTime: this.endTime,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      opacity: this.opacity,
      parentId: this.parentId
    };
  }

  clone() {
    return new this.constructor(this.toJSON());
  }
}
