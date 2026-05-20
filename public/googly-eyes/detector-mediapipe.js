// MediaPipe Face Detector adapter — alternate to the active `detector.js`.
//
// Smaller download than face-api.js but BlazeFace short-range struggles on
// group photos where faces aren't close to the camera. Kept as a reference
// for the swap pattern. To use, swap the import in app.js:
//
//     import { loadDetector } from "./detector-mediapipe.js";
//
// See `detector.js` for the interface contract.

const TASKS_VERSION = "0.10.35";
const BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_BASE  = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise = null;

export function loadDetector() {
    if (!detectorPromise) detectorPromise = build();
    return detectorPromise;
}

async function build() {
    const { FilesetResolver, FaceDetector } = await import(BUNDLE_URL);
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const mp = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
    });
    return wrap(mp);
}

function wrap(mp) {
    return {
        async detect(image) {
            const w = image.naturalWidth || image.width;
            const h = image.naturalHeight || image.height;
            const { detections } = mp.detect(image);

            return detections
                .map((d) => toFace(d, w, h))
                .filter(Boolean);
        },
    };
}

function toFace(detection, w, h) {
    // MediaPipe Face Detector keypoints (normalized 0..1):
    //   0 = right eye (subject's right → viewer's left)
    //   1 = left eye  (subject's left  → viewer's right)
    const kp = detection.keypoints;
    if (!kp || kp.length < 2) return null;

    const eyes = [
        { x: kp[0].x * w, y: kp[0].y * h },
        { x: kp[1].x * w, y: kp[1].y * h },
    ];

    const bb = detection.boundingBox;
    const bbox = bb
        ? { x: bb.originX, y: bb.originY, w: bb.width, h: bb.height }
        : null;

    const faceSize = bbox
        ? Math.max(bbox.w, bbox.h)
        : Math.hypot(eyes[0].x - eyes[1].x, eyes[0].y - eyes[1].y) * 2.4;

    return { eyes, faceSize, bbox };
}
