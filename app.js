import { AmbientLight, AxesHelper, BoxGeometry, BufferAttribute, BufferGeometry, DirectionalLight, GridHelper, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IFCLoader } from "web-ifc-three/IFCLoader";

//Creates the Three.js scene
const scene = new Scene();

//Object to store the size of the viewport
const size = {
    width: window.innerWidth,
    height: window.innerHeight,
};

//Creates the camera (point of view of the user)
const aspect = size.width / size.height;
const camera = new PerspectiveCamera(75, aspect);
camera.position.z = 15;
camera.position.y = 13;
camera.position.x = 8;

//Creates the lights of the scene
const lightColor = 0xffffff;

const ambientLight = new AmbientLight(lightColor, 0.5);
scene.add(ambientLight);

const directionalLight = new DirectionalLight(lightColor, 1);
directionalLight.position.set(0, 10, 0);
directionalLight.target.position.set(-5, 0, 0);
scene.add(directionalLight);
scene.add(directionalLight.target);

//Sets up the renderer, fetching the canvas of the HTML
const threeCanvas = document.getElementById("three-canvas");
const renderer = new WebGLRenderer({
    canvas: threeCanvas,
    alpha: true,
});

renderer.setSize(size.width, size.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

//Creates grids and axes in the scene
const grid = new GridHelper(50, 30);
scene.add(grid);

const axes = new AxesHelper();
axes.material.depthTest = false;
axes.renderOrder = 1;
scene.add(axes);

//Creates the orbit controls (to navigate the scene)
const controls = new OrbitControls(camera, threeCanvas);
controls.enableDamping = true;
controls.target.set(-2, 0, 0);

const raycaster = new Raycaster();
const pointer = new Vector2();
raycaster.firstHitOnly = true;

let measuringPoints = [];
const measuringLineMaterial = new LineBasicMaterial({ color: 0xF7C702 });
var MAX_POINTS = 500;
var positions = new Float32Array(MAX_POINTS * 3);
let measuringLineGeometry = new BufferGeometry()
measuringLineGeometry.addAttribute('position', new BufferAttribute(positions, 3));
let measuringLine = new Line(measuringLineGeometry, measuringLineMaterial);
scene.add(measuringLine);

function onPointerClick(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    measuringPoints.push(intersects[0].point);

    var positions = measuringLine.geometry.attributes.position.array;
    const count = measuringPoints.length * 3
    positions[count - 3] = intersects[0].point.x
    positions[count - 2] = intersects[0].point.y
    positions[count - 1] = intersects[0].point.z
    measuringLine.geometry.setDrawRange(0, measuringPoints.length);
    measuringLine.geometry.attributes.position.needsUpdate = true;
}

//Animation loop
const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
};

animate();

//Adjust the viewport to the size of the browser
window.addEventListener("resize", () => {
    size.width = window.innerWidth;
    size.height = window.innerHeight;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
});

window.addEventListener('click', onPointerClick);


// Sets up the IFC loading
const ifcLoader = new IFCLoader();
ifcLoader.load("models/01.ifc", (ifcModel) => scene.add(ifcModel));

ifcLoader.ifcManager.setWasmPath("wasm/");

const input = document.getElementById("file-input");

input.addEventListener(
    "change",
    (changed) => {
        const file = changed.target.files[0];
        var ifcURL = URL.createObjectURL(file);
        ifcLoader.load(ifcURL, (ifcModel) => scene.add(ifcModel));
    },
    false
);