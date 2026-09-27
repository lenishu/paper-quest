import React from 'react';

// Some machines (hardware acceleration off, GPU blocklisted, remote desktop, VMs)
// can't create a WebGL context. Detect once so 3D views default to their 2D
// fallback instead of letting Three.js throw "Error creating WebGL context" and
// crash the whole view.
function detect() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

export const WEBGL_OK = detect();

// Belt-and-suspenders: if a 3D view still fails at runtime (e.g. too many live
// GL contexts — a real limit, which is why only one 3D graph is mounted per
// screen), fall back to 2D rather than bubbling to the app ErrorBoundary.
export class GL3DBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail && this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
