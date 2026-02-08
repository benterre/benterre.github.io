import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById("planet");

/* ---------------- Scene ---------------- */

const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x111111);

/* ---------------- Camera ---------------- */

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(3, 1, 0);

/* ---------------- Renderer ---------------- */

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0); // Sets clear color to black with 0 opacity
container.appendChild(renderer.domElement);

/* ---------------- Controls ---------------- */

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.update();

/* ---------------- Lighting ---------------- */

scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 0);
scene.add(dirLight);

/* ---------------- GLTF Loader ---------------- */

const loader = new GLTFLoader();

const earth_gltf = await loader.loadAsync( 'models/earth.gltf' );
const earth = earth_gltf.scene;
earth.position.set(0,0,0);
earth.scale.setScalar(1);
scene.add( earth );

const bigben_gltf = await loader.loadAsync( 'models/BigBen.gltf' );
const bigben = bigben_gltf.scene;
bigben.position.set(0,0,0);
// bigben.scale.setScalar(1);
scene.add( bigben );

const ulsan_gltf = await loader.loadAsync( 'models/Ulsan.gltf' );
const ulsan = ulsan_gltf.scene;
ulsan.position.set(0,0,0);
ulsan.scale.setScalar(1);
scene.add( ulsan );

/* ---------------- Resize Handling ---------------- */

const resizeObserver = new ResizeObserver(() => {
  const w = container.clientWidth;
  const h = container.clientHeight;

  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(container);

/* ---------------- Auto Rotation ---------------- */

// Rotation state
let autoRotate = true;
let resumeTimeout = null;

// When user starts interacting → stop auto rotation immediately
controls.addEventListener('start', () => {
  autoRotate = false;

  // cancel any pending resume timer
  if (resumeTimeout) {
    clearTimeout(resumeTimeout);
    resumeTimeout = null;
  }
});

// When user stops interacting → resume after 1 second
controls.addEventListener('end', () => {
  resumeTimeout = setTimeout(() => {
    autoRotate = true;
  }, 1000);
});

/* ---------------- Animation Loop ---------------- */

function animate() {
  requestAnimationFrame(animate);

  // Rotate slowly if enabled
  if (autoRotate && earth) {
    const rot_speed = -0.0002;
    earth.rotation.y += rot_speed;
    bigben.rotation.y += rot_speed;
    ulsan.rotation.y += rot_speed;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();