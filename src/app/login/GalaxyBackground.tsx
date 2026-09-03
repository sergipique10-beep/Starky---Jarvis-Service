'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import styles from './GalaxyBackground.module.css';

const PARTICLE_COUNT = 6000;
const BRANCHES = 3;
const OUTER_RADIUS = 5;
const SPIN = 1.4;
const RANDOMNESS = 0.35;

// Cyan-core / deep-blue-edge gradient, matching the rest of the HUD palette
// (see globals.css --accent) rather than the orange/purple of the original
// Three.js example.
const INSIDE_COLOR = 0x8fefff;
const OUTSIDE_COLOR = 0x0a1a33;

function buildGalaxyGeometry() {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const radii = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const radiusFrac = Math.random();
    const radius = radiusFrac * OUTER_RADIUS;
    const branchAngle = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
    const spinAngle = radius * SPIN;

    const randomX = (Math.random() - 0.5) * RANDOMNESS * radiusFrac;
    const randomY = (Math.random() - 0.5) * RANDOMNESS * 0.4 * radiusFrac;
    const randomZ = (Math.random() - 0.5) * RANDOMNESS * radiusFrac;

    const i3 = i * 3;
    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    positions[i3 + 1] = randomY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;
    radii[i] = radiusFrac;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
  return geometry;
}

export default function GalaxyBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.2, 6);
    camera.lookAt(0, 0, 0);

    const geometry = buildGalaxyGeometry();
    const material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    // Radial color gradient, gently shimmering over time — genuinely TSL-driven
    // shading (not baked per-vertex colors).
    const radius = TSL.attribute('aRadius');
    const shimmer = TSL.sin(TSL.time.mul(1.5).add(radius.mul(12))).mul(0.15).add(0.85);
    material.colorNode = TSL.mix(TSL.color(INSIDE_COLOR), TSL.color(OUTSIDE_COLOR), radius).mul(shimmer);
    material.opacityNode = TSL.uniform(0.85);
    material.size = 0.045;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function resize() {
      const { clientWidth, clientHeight } = container!;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }

    renderer
      .init()
      .then(() => {
        if (disposed) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        resize();
        window.addEventListener('resize', resize);

        function animate() {
          points.rotation.y += 0.0012;
          renderer.renderAsync(scene, camera);
          frameId = requestAnimationFrame(animate);
        }
        animate();
      })
      .catch(() => {
        // WebGPU/WebGL unavailable — fail silently, the login screen's plain
        // dark background is a perfectly fine fallback.
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className={styles.background} aria-hidden="true" />;
}
