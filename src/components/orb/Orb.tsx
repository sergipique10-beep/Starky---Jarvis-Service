'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_PARAMS: Record<OrbState, { pulseSpeed: number; baseScale: number; color: number }> = {
  idle: { pulseSpeed: 0.5, baseScale: 0.85, color: 0x2fb8e8 },
  listening: { pulseSpeed: 2.5, baseScale: 1.0, color: 0x3fd0ff },
  thinking: { pulseSpeed: 1.5, baseScale: 0.95, color: 0x8fefff },
  speaking: { pulseSpeed: 4.0, baseScale: 1.05, color: 0x5fd8f0 },
};

export default function Orb({ state }: { state: OrbState }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(160, 160);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: STATE_PARAMS[state].color, wireframe: true });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let frameId: number;
    let t = 0;
    function animate() {
      const { pulseSpeed, baseScale } = STATE_PARAMS[state];
      t += 0.02 * pulseSpeed;
      const scale = baseScale + Math.sin(t) * 0.1;
      sphere.scale.set(scale, scale, scale);
      sphere.rotation.y += 0.01;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      container.removeChild(renderer.domElement);
    };
  }, [state]);

  return <div ref={containerRef} style={{ width: 160, height: 160 }} />;
}
