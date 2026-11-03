/**
 * Command-based Undo / Redo System for Video Studio
 * Supports full action history, batching, and keyboard shortcut dispatching
 */

export class Command {
  constructor(name = 'Action') {
    this.name = name;
  }
  execute() {}
  undo() {}
}

export class PropertyChangeCommand extends Command {
  constructor(target, prop, oldVal, newVal, onUpdate = null, name = 'Change Property') {
    super(name);
    this.target = target;
    this.prop = prop;
    this.oldVal = oldVal;
    this.newVal = newVal;
    this.onUpdate = onUpdate;
  }

  execute() {
    this.target[this.prop] = this.newVal;
    if (this.onUpdate) this.onUpdate();
  }

  undo() {
    this.target[this.prop] = this.oldVal;
    if (this.onUpdate) this.onUpdate();
  }
}

export class AddLayerCommand extends Command {
  constructor(scene, layer, index = null, onUpdate = null) {
    super(`Add ${layer.name || 'Layer'}`);
    this.scene = scene;
    this.layer = layer;
    this.index = index;
    this.onUpdate = onUpdate;
  }

  execute() {
    this.scene.addLayer(this.layer, this.index);
    this.scene.selectLayer(this.layer.id);
    if (this.onUpdate) this.onUpdate();
  }

  undo() {
    this.scene.removeLayer(this.layer.id);
    if (this.onUpdate) this.onUpdate();
  }
}

export class RemoveLayerCommand extends Command {
  constructor(scene, layerId, onUpdate = null) {
    const layer = scene.getLayer(layerId);
    super(`Delete ${layer?.name || 'Layer'}`);
    this.scene = scene;
    this.layer = layer;
    this.index = scene.layers.findIndex(l => l.id === layerId);
    this.onUpdate = onUpdate;
  }

  execute() {
    if (this.layer) {
      this.scene.removeLayer(this.layer.id);
      if (this.onUpdate) this.onUpdate();
    }
  }

  undo() {
    if (this.layer) {
      this.scene.addLayer(this.layer, this.index);
      this.scene.selectLayer(this.layer.id);
      if (this.onUpdate) this.onUpdate();
    }
  }
}

export class BatchTransformCommand extends Command {
  constructor(updates, onUpdate = null, name = 'Transform') {
    super(name);
    // updates: Array of { layer, oldBounds: { x, y, width, height, rotation }, newBounds: { ... } }
    this.updates = updates;
    this.onUpdate = onUpdate;
  }

  execute() {
    this.updates.forEach(({ layer, newBounds }) => {
      Object.assign(layer, newBounds);
    });
    if (this.onUpdate) this.onUpdate();
  }

  undo() {
    this.updates.forEach(({ layer, oldBounds }) => {
      Object.assign(layer, oldBounds);
    });
    if (this.onUpdate) this.onUpdate();
  }
}

export class HistoryManager {
  constructor(maxSize = 80) {
    this.maxSize = maxSize;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = [];
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  undo() {
    if (!this.canUndo()) return;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    this.notify();
  }

  redo() {
    if (!this.canRedo()) return;
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    this.notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoName: this.undoStack[this.undoStack.length - 1]?.name,
      redoName: this.redoStack[this.redoStack.length - 1]?.name
    }));
  }
}
