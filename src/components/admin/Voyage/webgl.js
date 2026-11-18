// src/components/admin/Voyage/webgl.js
//
// The WebGL probe on its own, without Three.js, so a page can decide between
// the 3D field and the flat sky before it pays for loading the field.

/** Whether this browser can give us a WebGL context (probe on a throwaway canvas). */
export function webglAvailable(doc = document) {
  try {
    const c = doc.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
