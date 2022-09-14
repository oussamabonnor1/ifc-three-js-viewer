import { AmbientLight, AxesHelper, BufferAttribute, BufferGeometry, DirectionalLight, GridHelper, Line, LineBasicMaterial, PerspectiveCamera, Points, PointsMaterial, Raycaster, Scene, Sprite, SpriteMaterial, TextureLoader, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
    CSS2DRenderer,
    CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { MeshLambertMaterial } from "three";

const measuringButton = document.getElementById("measuring-button")
measuringButton.addEventListener("click", () => {
    selectedTool = selectedTool == AVAILABLE_TOOLS.measuring ? undefined : AVAILABLE_TOOLS.measuring
    toggleMeasuring()
    togglePicking()
    toggleAnnotating()
})

const pickingButton = document.getElementById("picking-button")
pickingButton.addEventListener("click", () => {
    selectedTool = selectedTool == AVAILABLE_TOOLS.picking ? undefined : AVAILABLE_TOOLS.picking
    togglePicking()
    toggleMeasuring()
    toggleAnnotating()
})

const annotatingButton = document.getElementById("annotating-button")
annotatingButton.addEventListener("click", () => {
    selectedTool = selectedTool == AVAILABLE_TOOLS.annotating ? undefined : AVAILABLE_TOOLS.annotating
    toggleAnnotating()
    togglePicking()
    toggleMeasuring()
})

const modelInfo = document.getElementById("model-info")
const annotationHint = document.getElementById("annotation-hint")
const annotationForm = document.getElementById("annotation-form")
const annotationTextField = document.getElementById("annotation-comment")
const annotationSaveButton = document.getElementById("save-annotation-button")
const annotationCancelButton = document.getElementById("cancel-annotation-button")
const annotationDisplay = document.getElementById('annotation-display')

annotationSaveButton.addEventListener("click", () => {
    isCreatingAnnotation = false
    annotationForm.classList.remove('is-active')
    annotationPoints[annotationPoints.length - 1].name = annotationTextField.value
    annotationTextField.value = ""
})

annotationCancelButton.addEventListener("click", () => {
    isCreatingAnnotation = false
    annotationForm.classList.remove('is-active')
    scene.remove(annotationPoints[annotationPoints.length - 1])
    annotationPoints.pop()
    annotationTextField.value = ""
})

let isCreatingAnnotation = false
let isAnnotationDisplayShown = false
let measuringEntities = []
const AVAILABLE_TOOLS = {
    measuring: "measuring",
    picking: "picking",
    annotating: "annotating",
}
let selectedTool = undefined

//Creates the Three.js scene
const scene = new Scene();
let model;

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

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(window.innerWidth, window.innerHeight)
labelRenderer.domElement.style.position = 'absolute'
labelRenderer.domElement.style.top = '0px'
labelRenderer.domElement.style.pointerEvents = 'none'
document.body.appendChild(labelRenderer.domElement)

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

// Creates subset material
const selectionMaterial = new MeshLambertMaterial({
    transparent: true,
    opacity: 0.6,
    color: 0xF7C702,
    depthTest: false,
});

// Reference to the previous selection
let previousSelectionID = { id: -1 };

let annotationPoints = [];

let measuringPoints = [];
const measuringLineMaterial = new LineBasicMaterial({ color: 0xF7C702, depthTest: false, depthWrite: false });
var MAX_POINTS = 500;
var positions = new Float32Array(MAX_POINTS * 3);
let measuringLineGeometry = new BufferGeometry()
measuringLineGeometry.setAttribute('position', new BufferAttribute(positions, 3));
let measuringLine = new Line(measuringLineGeometry, measuringLineMaterial);
measuringLine.renderOrder = 999
scene.add(measuringLine);

function onPointerClick(event) {
    const intersects = castRay(event, model)
    if (selectedTool == AVAILABLE_TOOLS.measuring) {
        if (intersects.length > 0) {
            const intersectionPoint = intersects[0].point
            measuringPoints.push(intersectionPoint)
            addPointMeasuringLine(intersectionPoint)
            addMeasuringLine(intersectionPoint)
            if (measuringPoints.length > 1) addMeasuringLabel(measuringPoints[measuringPoints.length - 2], measuringPoints[measuringPoints.length - 1])
        }
    }
    if (selectedTool == AVAILABLE_TOOLS.picking) {
        pickModelPart(event)
    }
    if (selectedTool == AVAILABLE_TOOLS.annotating) {
        if (intersects.length > 0 && !isCreatingAnnotation) {
            const intersectionPoint = intersects[0].point
            addAnnotationPoint(intersectionPoint)
        }
    }
}

function onPointerMove(event) {
    if (!selectedTool) {
        highlightModelPart(event, selectionMaterial, previousSelectionID)
    }
    if (selectedTool == AVAILABLE_TOOLS.annotating && annotationPoints.length > 0) {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        let found = raycaster.intersectObjects(annotationPoints)[0]
        if (found && !isCreatingAnnotation && !isAnnotationDisplayShown) {
            found = found.object
            let position = found.position.clone().project(camera)
            annotationDisplay.style.top = ((position.y * -1 + 1) * size.height / 2) + 'px'
            annotationDisplay.style.left = ((position.x + 1) * size.width / 2) + 'px'
            annotationDisplay.classList.add('is-active')
            annotationDisplay.innerHTML = found.name
            isAnnotationDisplayShown = true
        }
        if (!found && isAnnotationDisplayShown) {
            isAnnotationDisplayShown = false
            annotationDisplay.classList.remove('is-active')
        }
    }
}

function addPointMeasuringLine(point) {
    var dotGeometry = new BufferGeometry();
    dotGeometry.setAttribute('position', new BufferAttribute(new Float32Array([point.x, point.y, point.z]), 3));
    var dotMaterial = new PointsMaterial({ size: 0.25, color: 0xF7C702, depthTest: false, depthWrite: false });
    var dot = new Points(dotGeometry, dotMaterial);
    dot.renderOrder = 999
    scene.add(dot);
    measuringEntities.push(dot);
}

function addMeasuringLine(point) {
    var positions = measuringLine.geometry.attributes.position.array;
    const count = measuringPoints.length * 3
    positions[count - 3] = point.x
    positions[count - 2] = point.y
    positions[count - 1] = point.z
    measuringLine.geometry.setDrawRange(0, measuringPoints.length);
    measuringLine.geometry.attributes.position.needsUpdate = true;
}

function addMeasuringLabel(point1, point2) {
    const measurementDiv = document.createElement(
        'div'
    )
    measurementDiv.className = 'measurementLabel'
    measurementDiv.innerText = '0.0m'
    const measurementLabel = new CSS2DObject(measurementDiv)
    scene.add(measurementLabel)
    measuringEntities.push(measurementLabel);

    const v0 = new Vector3(
        point1.x,
        point1.y,
        point1.z
    )
    const v1 = new Vector3(
        point2.x,
        point2.y,
        point2.z
    )

    const distance = v0.distanceTo(v1)
    measurementLabel.element.innerText =
        distance.toFixed(2) + 'm'
    measurementLabel.position.lerpVectors(v0, v1, 0.5)
}

function highlightModelPart(event, material, previousSelectionID) {
    const found = castRay(event, model)[0];
    const ifc = ifcLoader.ifcManager;
    if (found) {
        // Gets model ID
        previousSelectionID.id = found.object.modelID;

        // Gets Express ID
        const index = found.faceIndex;
        const geometry = found.object.geometry;
        const id = ifc.getExpressId(geometry, index);

        // Creates subset
        ifcLoader.ifcManager.createSubset({
            modelID: previousSelectionID.id,
            ids: [id],
            material: material,
            scene: scene,
            removePrevious: true,
        });
    } else {
        // Removes previous highlight
        ifc.removeSubset(previousSelectionID.id, material);
    }
}

async function pickModelPart(event) {
    const found = castRay(event, model)[0]
    if (found) {
        const index = found.faceIndex;
        const geometry = found.object.geometry;
        const ifc = ifcLoader.ifcManager;
        const id = ifc.getExpressId(geometry, index);
        if (previousSelectionID) ifc.removeSubset(previousSelectionID.id, selectionMaterial);
        previousSelectionID.id = found.object.modelID;
        ifcLoader.ifcManager.createSubset({
            modelID: previousSelectionID.id,
            ids: [id],
            material: selectionMaterial,
            scene: scene,
            removePrevious: true,
        });
        await ifc.getItemProperties(previousSelectionID.id, id).then(res => {
            modelInfo.innerHTML = JSON.stringify(res, null, 2);
            modelInfo.style.whiteSpace = "pre"
        });
    }
}

function addAnnotationPoint(point) {
    isCreatingAnnotation = true;
    let map = new TextureLoader().load('static/info.png');
    let material = new SpriteMaterial({ map: map, depthTest: false, depthWrite: false });
    let sprite = new Sprite(material);
    sprite.position.copy(point.clone());
    sprite.renderOrder = 999;
    scene.add(sprite);
    annotationPoints.push(sprite);
    annotationForm.classList.add('is-active')
}

function castRay(event, target) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([target]);
}

function toggleMeasuring() {
    if (selectedTool == AVAILABLE_TOOLS.measuring) {
        measuringButton.classList.add('is-active')
        measuringButton.children[0].classList.add('is-active')
    } else {
        measuringButton.classList.remove('is-active')
        measuringButton.children[0].classList.remove('is-active')
        const measuringLabels = document.querySelectorAll("measurementLabel")
        measuringLabels.forEach(label => label.remove());
        measuringEntities.forEach(entity => scene.remove(entity))
        measuringPoints = []
        measuringLine.geometry.setDrawRange(0, measuringPoints.length);
        measuringLine.geometry.attributes.position.needsUpdate = true;
    }
}

function togglePicking() {
    if (selectedTool == AVAILABLE_TOOLS.picking) {
        modelInfo.classList.add('is-active')
        pickingButton.classList.add('is-active')
        pickingButton.children[0].classList.add('is-active')
        modelInfo.style.whiteSpace = "inherit"
        modelInfo.innerHTML = "Click a part of the model to show it's meta-data"
    } else {
        modelInfo.classList.remove('is-active')
        pickingButton.classList.remove('is-active')
        pickingButton.children[0].classList.remove('is-active')
        const ifc = ifcLoader.ifcManager;
        if (previousSelectionID) ifc.removeSubset(previousSelectionID.id, selectionMaterial);
    }
}

function toggleAnnotating() {
    if (selectedTool == AVAILABLE_TOOLS.annotating) {
        annotationHint.classList.add('is-active')
        if (isCreatingAnnotation)
            annotationForm.classList.add('is-active')
        annotatingButton.classList.add('is-active')
        annotatingButton.children[0].classList.add('is-active')
        annotationPoints.forEach(point => point.visible = true)
    } else {
        annotationHint.classList.remove('is-active')
        annotationForm.classList.remove('is-active')
        annotatingButton.classList.remove('is-active')
        annotatingButton.children[0].classList.remove('is-active')
        annotationPoints.forEach(point => point.visible = false)
    }
}

//Animation loop
const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera)
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
    labelRenderer.setSize(window.innerWidth, window.innerHeight)
});

window.addEventListener('click', onPointerClick);

window.addEventListener("mousemove", onPointerMove);

// Sets up the IFC loading
const ifcLoader = new IFCLoader();
ifcLoader.load("models/01.ifc", (ifcModel) => {
    model = ifcModel
    scene.add(ifcModel)
});

ifcLoader.ifcManager.setWasmPath("wasm/");

// Sets up optimized picking
ifcLoader.ifcManager.setupThreeMeshBVH(computeBoundsTree, disposeBoundsTree, acceleratedRaycast);

const input = document.getElementById("file-input");

input.addEventListener(
    "change",
    (changed) => {
        const file = changed.target.files[0];
        var ifcURL = URL.createObjectURL(file);
        scene.remove(model)
        ifcLoader.load(ifcURL, (ifcModel) => {
            model = ifcModel
            scene.add(ifcModel)
        });
    },
    false
);