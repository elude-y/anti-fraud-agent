"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  Color, Group, Mesh, PerspectiveCamera, Scene, ShaderMaterial, SphereGeometry,
  TorusGeometry, WebGLRenderer,
} from "three";
import styles from "./welcome.module.css";

function glassFinish(base: string, tint: string, rim: string) {
  return new ShaderMaterial({
    uniforms: {
      base: { value: new Color(base) },
      tint: { value: new Color(tint) },
      rim: { value: new Color(rim) },
    },
    vertexShader: `
      varying vec3 surfaceNormal;
      varying vec3 toCamera;

      void main() {
        vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
        surfaceNormal = normalMatrix * normal;
        toCamera = -positionInView.xyz;
        gl_Position = projectionMatrix * positionInView;
      }
    `,
    fragmentShader: `
      uniform vec3 base;
      uniform vec3 tint;
      uniform vec3 rim;
      varying vec3 surfaceNormal;
      varying vec3 toCamera;

      void main() {
        vec3 normal = normalize(surfaceNormal);
        float edge = pow(1.0 - max(dot(normal, normalize(toCamera)), 0.0), 2.2);
        float cyan = pow(max(dot(normal, normalize(vec3(-0.48, -0.5, 0.72))), 0.0), 4.0);
        float light = pow(max(dot(normal, normalize(vec3(-0.38, 0.53, 0.76))), 0.0), 8.0);
        vec3 color = mix(base, tint, cyan * 0.92);
        color = mix(color, rim, edge * 0.85);
        color = mix(color, vec3(1.0), light * 0.87);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export default function GlassSphere({ rotation }: {
  rotation: RefObject<{ pitch: number; yaw: number }>;
}) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", { alpha: true, antialias: true });
    if (!context) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    element.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.z = 5.4;
    const assembly = new Group();
    scene.add(assembly);

    const sphere = new SphereGeometry(1, 64, 40);
    const glass = glassFinish("#385cda", "#81eff0", "#e1d5ff");
    const globe = new Mesh(sphere, glass);
    assembly.add(globe);

    const ringGeometry = new TorusGeometry(1.31, 0.065, 16, 96);
    const ringMaterial = glassFinish("#b6d7f5", "#dff9ff", "#ecedff");
    const ring = new Mesh(ringGeometry, ringMaterial);
    const orbit = new Group();
    orbit.rotation.set(1.06, -0.25, 0.43);
    orbit.add(ring);
    assembly.add(orbit);

    const moonGeometry = new SphereGeometry(0.115, 24, 16);
    const moon = new Mesh(moonGeometry, ringMaterial);
    orbit.add(moon);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastFrame = 0;
    let elapsed = 0;
    const draw = (now: number) => {
      const still = reducedMotion.matches;
      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
      lastFrame = now;
      if (!still) elapsed += delta;

      const ease = still ? 1 : 1 - Math.exp(-delta * 18);
      const pitch = still ? 0 : rotation.current.pitch;
      const yaw = still ? 0 : rotation.current.yaw;
      assembly.rotation.x += (pitch - assembly.rotation.x) * ease;
      assembly.rotation.y += (yaw - assembly.rotation.y) * ease;
      assembly.position.y = still ? 0 : Math.sin(elapsed * 1.1) * 0.085;
      const angle = 1 + elapsed * 0.52;
      moon.position.set(Math.cos(angle) * 1.43, Math.sin(angle) * 1.43, 0);
      renderer.render(scene, camera);
    };

    const resize = () => {
      const size = element.clientWidth;
      if (!size) return;
      renderer.setSize(size, size, false);
      draw(performance.now());
      if (!context.isContextLost()) element.dataset.ready = "true";
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const stopOnContextLoss = (event: Event) => {
      event.preventDefault();
      delete element.dataset.ready;
      renderer.setAnimationLoop(null);
    };
    const updateMotion = () => {
      renderer.setAnimationLoop(reducedMotion.matches || context.isContextLost() ? null : draw);
      if (!context.isContextLost()) resize();
    };
    canvas.addEventListener("webglcontextlost", stopOnContextLoss);
    canvas.addEventListener("webglcontextrestored", updateMotion);
    reducedMotion.addEventListener("change", updateMotion);
    updateMotion();

    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      canvas.removeEventListener("webglcontextlost", stopOnContextLoss);
      canvas.removeEventListener("webglcontextrestored", updateMotion);
      reducedMotion.removeEventListener("change", updateMotion);
      sphere.dispose();
      ringGeometry.dispose();
      moonGeometry.dispose();
      glass.dispose();
      ringMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      delete element.dataset.ready;
    };
  }, [rotation]);

  return <div ref={surface} className={styles.sphereCanvas} />;
}
