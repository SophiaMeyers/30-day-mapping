
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createMapboxTexture } from "./mapboxTexture.js";
import "./style.css";

const container = document.getElementById("globe-container");
const slider = document.getElementById("transform-slider");

if (!container || !slider) {
  throw new Error("Globe container or transformation slider not found.");
}

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color("#242424");
// CAMERA
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 0, 4.8);

// RENDERER
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

container.appendChild(renderer.domElement);

// CONTROLS
const controls = new OrbitControls(camera, renderer.domElement);

controls.enableRotate = true;
controls.enablePan = false;
controls.enableZoom = true;
controls.enableDamping = true;
controls.dampingFactor = 0.06;

controls.minDistance = 3.6;
controls.maxDistance = 7;
controls.zoomSpeed = 0.8;

// PROJECTION SETTINGS
const PI = Math.PI;
const MAX_LAT = THREE.MathUtils.degToRad(85.0511);
const MAP_SCALE = 1.2;

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const forward = new THREE.Vector3();

// GEOMETRY
const longitudeSegments = 256;
const latitudeSegments = 128;

const positions = [];
const textureUVs = [];
const geographicUVs = [];
const indices = [];

for (let y = 0; y <= latitudeSegments; y++) {
  for (let x = 0; x <= longitudeSegments; x++) {
    const u = x / longitudeSegments;
    const v = y / latitudeSegments;

    const latitude = (v - 0.5) * PI;

    const safeLatitude = THREE.MathUtils.clamp(
      latitude,
      -MAX_LAT,
      MAX_LAT
    );

    const mercatorY = Math.log(
      Math.tan(PI / 4 + safeLatitude / 2)
    );

    geographicUVs.push(u, v);

    const textureV = (mercatorY / PI + 1) / 2;
    textureUVs.push(u, textureV);

    positions.push(0, 0, 0);

    if (x < longitudeSegments && y < latitudeSegments) {
      const a = y * (longitudeSegments + 1) + x;
      const b = a + 1;
      const c = a + longitudeSegments + 1;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }
}

const geometry = new THREE.BufferGeometry();

geometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(positions, 3)
);

geometry.setAttribute(
  "uv",
  new THREE.Float32BufferAttribute(textureUVs, 2)
);

geometry.setAttribute(
  "geo",
  new THREE.Float32BufferAttribute(geographicUVs, 2)
);

geometry.setIndex(indices);

// MATERIAL
const material = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide
});

const globe = new THREE.Mesh(geometry, material);
scene.add(globe);

// MAPBOX TEXTURE
createMapboxTexture()
  .then((texture) => {
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;

    console.log("Mapbox basemap loaded successfully.");
  })
  .catch((error) => {
    console.error("Mapbox texture error:", error);
  });

// SLIDER CONTROLS THE SAME CAMERA DISTANCE AS ZOOM
slider.addEventListener("input", () => {
  const amount = Number(slider.value) / 100;

  const distance = THREE.MathUtils.lerp(
    4.8,
    3.6,
    amount
  );

  camera.position.setLength(distance);
  controls.update();
});

// PROJECTION TRANSFORMATION
function updateProjection() {
  camera.updateMatrixWorld();

  right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  forward.copy(camera.position).normalize();

  // Camera distance controls the transformation.
  const distance = camera.position.distanceTo(controls.target);

  const t = THREE.MathUtils.clamp(
    (4.8 - distance) / 1.2,
    0,
    1
  );

  const morph = t * t * (3 - 2 * t);

  // Keep slider synchronized with trackpad zoom.
  slider.value = String(Math.round(morph * 100));

  const positionAttribute = geometry.attributes.position;
  const geoAttribute = geometry.attributes.geo;

  for (let i = 0; i < positionAttribute.count; i++) {
    const u = geoAttribute.getX(i);
    const v = geoAttribute.getY(i);

    const longitude = (u - 0.5) * 2 * PI;
    const latitude = (v - 0.5) * PI;

    // Original globe position.
    const cosLat = Math.cos(latitude);

    const gx = cosLat * Math.sin(longitude);
    const gy = Math.sin(latitude);
    const gz = cosLat * Math.cos(longitude);

    // Camera-relative position.
    const localX = gx * right.x + gy * right.y + gz * right.z;
    const localY = gx * up.x + gy * up.y + gz * up.z;
    const localZ = gx * forward.x + gy * forward.y + gz * forward.z;

    // Mercator coordinates.
    const mapLongitude = Math.atan2(localX, localZ);

    const mapLatitude = Math.asin(
      THREE.MathUtils.clamp(localY, -1, 1)
    );

    const safeLatitude = THREE.MathUtils.clamp(
      mapLatitude,
      -MAX_LAT,
      MAX_LAT
    );

    const mapX = (mapLongitude / PI) * MAP_SCALE;

    const mapY =
      (Math.log(Math.tan(PI / 4 + safeLatitude / 2)) / PI) *
      MAP_SCALE;

    const mx = right.x * mapX + up.x * mapY;
    const my = right.y * mapX + up.y * mapY;
    const mz = right.z * mapX + up.z * mapY;

    // Interpolate between globe and map.
    positionAttribute.setXYZ(
      i,
      THREE.MathUtils.lerp(gx, mx, morph),
      THREE.MathUtils.lerp(gy, my, morph),
      THREE.MathUtils.lerp(gz, mz, morph)
    );
  }

  positionAttribute.needsUpdate = true;
}

// RESET
document.getElementById("reset").addEventListener("click", () => {
  camera.position.set(0, 0, 4.8);

  controls.target.set(0, 0, 0);
  controls.update();

  slider.value = "0";

  updateProjection();
});

// RESIZE
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ANIMATION
function animate() {
  requestAnimationFrame(animate);

  controls.update();
  updateProjection();

  renderer.render(scene, camera);
}

animate();
