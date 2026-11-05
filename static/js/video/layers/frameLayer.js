/**
 * Frame Layer (Figma-Style Container with Auto-Layout)
 */

import { Layer } from './baseLayer.js';

export class FrameLayer extends Layer {
  constructor(data = {}) {
    super({ ...data, type: 'frame' });
    this.name = data.name || 'Frame';
    this.children = Array.isArray(data.children) ? [...data.children] : [];
    this.fill = data.fill || 'transparent';
    this.stroke = data.stroke || { color: '#444444', width: 0, position: 'inside' };
    this.cornerRadius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
    this.clipContent = data.clipContent !== false;
    
    // Auto-layout configuration (Figma-style)
    this.autoLayout = {
      enabled: !!data.autoLayout?.enabled,
      flow: data.autoLayout?.flow || 'vertical', // 'vertical' | 'horizontal' | 'wrap'
      gap: typeof data.autoLayout?.gap === 'number' ? data.autoLayout.gap : 16,
      padding: {
        top: data.autoLayout?.padding?.top ?? 16,
        right: data.autoLayout?.padding?.right ?? 16,
        bottom: data.autoLayout?.padding?.bottom ?? 16,
        left: data.autoLayout?.padding?.left ?? 16
      },
      alignment: data.autoLayout?.alignment || 'top-left',
      resizing: {
        w: data.autoLayout?.resizing?.w || 'fixed',
        h: data.autoLayout?.resizing?.h || 'fixed'
      }
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      children: this.children,
      fill: this.fill,
      stroke: this.stroke,
      cornerRadius: this.cornerRadius,
      clipContent: this.clipContent,
      autoLayout: this.autoLayout
    };
  }
}
