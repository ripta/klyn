// Face detection adapter using face-api.js (TinyFaceDetector + 68-point landmarks).
//
// Returns a uniform shape so the rest of the app doesn't care which library
// produced the numbers. To swap libraries, write a parallel module exposing
// the same API and change app.js's import. See `detector-mediapipe.js` for
// an alternate implementation.
//
// Interface:
//   loadDetector() → Promise<{ detect(image) → Promise<Face[]> }>
//   Face = {
//     eyes:     [{x, y}, {x, y}],   // pixel coords in the input image
//     faceSize: number,             // pixel size used to scale googly eyes
//     bbox:     {x, y, w, h},       // pixel coords; informational
//   }

const FACEAPI_VERSION = "1.7.14";
const LIB_URL   = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}/dist/face-api.esm.js`;
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}/model`;

// 608 reliably finds small faces in group photos at the cost of a bit more
// compute. 416 is the library default and is fine for selfies.
const INPUT_SIZE = 608;
const SCORE_THRESHOLD = 0.3;

let detectorPromise = null;

export function loadDetector() {
    if (!detectorPromise) detectorPromise = build();
    return detectorPromise;
}

async function build() {
    const faceapi = await import(LIB_URL);
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
    return wrap(faceapi);
}

function wrap(faceapi) {
    const opts = new faceapi.TinyFaceDetectorOptions({
        inputSize: INPUT_SIZE,
        scoreThreshold: SCORE_THRESHOLD,
    });
    return {
        async detect(image) {
            const detections = await faceapi
                .detectAllFaces(image, opts)
                .withFaceLandmarks();
            return detections.map(toFace).filter(Boolean);
        },
    };
}

function toFace(detection) {
    const lm = detection.landmarks;
    if (!lm) return null;

    const box = detection.detection.box;
    const bbox = { x: box.x, y: box.y, w: box.width, h: box.height };
    return {
        eyes: [centroid(lm.getLeftEye()), centroid(lm.getRightEye())],
        faceSize: Math.max(bbox.w, bbox.h),
        bbox,
    };
}

function centroid(points) {
    let sx = 0, sy = 0;
    for (const p of points) { sx += p.x; sy += p.y; }
    return { x: sx / points.length, y: sy / points.length };
}
