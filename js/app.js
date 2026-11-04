const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const faceLabelTag = document.getElementById('face-label-tag');
const frameWarningBox = document.getElementById('frame-warning');

const poseStatus = document.getElementById('pose-status');
const timerVal = document.getElementById('timer-val');
const roundVal = document.getElementById('round-val');
const exNameVal = document.getElementById('ex-name');
const totalScoreVal = document.getElementById('total-score-val');
const camScoreVal = document.getElementById('cam-score');
const sensorScoreVal = document.getElementById('sensor-score');
const stepBadge = document.getElementById('step-badge');
const userDisplayName = document.getElementById('user-display-name');
const userRegType = document.getElementById('user-reg-type');
const summaryBox = document.getElementById('summary-box');
const sessionPts = document.getElementById('session-pts');
const summaryDetail = document.getElementById('summary-detail');

let isFaceModelsLoaded = false;
let currentSystemStep = 1;     
let isFaceScanFinished = false;
let isPoseSessionActive = false;
let isScanningInProgress = false;
let isPoseProcessing = false; // ป้องกันคำสั่ง pose.send ชนกัน
let lastScanTime = 0;
let detectedFaceBox = null;
let currentPoseLandmarks = null;
let cameraUtils = null;

let currentExerciseIndex = 0;
let currentStepIndex = 0;     
let currentRound = 1;
const TOTAL_ROUNDS = 2;

let holdStartTime = null;
let lastValidTime = null;
const HOLD_DURATION = 15;
const GRACE_PERIOD_MS = 1000; 

let simulatedFSRRelaxed = false;
let knownFaces = [];
let activeUser = null;
let currentSessionScore = 0;

// Temp Canvas สำหรับสแน็ปเฟรมส่ง MediaPipe ป้องกัน Stream Deadlock
const poseSnapCanvas = document.createElement('canvas');
poseSnapCanvas.width = 640;
poseSnapCanvas.height = 480;
const poseSnapCtx = poseSnapCanvas.getContext('2d');

// --- MediaPipe Setup ---
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

pose.onResults((results) => {
  currentPoseLandmarks = results.poseLandmarks || null;
  isPoseProcessing = false; // ปลดล็อกเมื่อประมวลผลเสร็จ 1 เฟรม
});

window.addEventListener('load', async () => {
  loadKnownFacesFromStorage();
  poseStatus.innerText = "⏳ กำลังโหลดโมเดล Face Recognition...";
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    isFaceModelsLoaded = true;
    poseStatus.innerText = "🔍 พร้อมสแกน! กรุณามองตรงมาที่กล้อง...";
  } catch (err) {
    poseStatus.innerText = "⚠️ ใช้โหมดสำรอง (Face Model Error)";
  }
  startWebcam();
});

function startWebcam() {
  cameraUtils = new Camera(videoElement, {
    onFrame: async () => {
      // 1. วาดวิดีโอลง Canvas หลักเป็นด่านแรก (กล้องจะไม่ค้างแน่นอน)
      drawFrame();
      
      const now = Date.now();
      
      // Step 1: สแกนใบหน้า
      if (currentSystemStep === 1 && !isFaceScanFinished && now - lastScanTime > 500) {
        lastScanTime = now;
        processFaceScanRealtime();
      }
      
      // Step 2: ส่งเฟรมภาพสดไป MediaPipe Pose (ใช้วิธี Copy Bitmap ป้องกัน Resource Lock)
      if (currentSystemStep === 2 && isPoseSessionActive && !isPoseProcessing) {
        isPoseProcessing = true;
        poseSnapCtx.drawImage(videoElement, 0, 0, 640, 480);
        try {
          await pose.send({ image: poseSnapCanvas });
        } catch (e) {
          isPoseProcessing = false;
        }
      }
    },
    width: 640, height: 480
  });
  cameraUtils.start();
}

function drawFrame() {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();

  if (detectedFaceBox) {
    const mirroredX = canvasElement.width - detectedFaceBox.box.x - detectedFaceBox.box.width;
    canvasCtx.strokeStyle = detectedFaceBox.color;
    canvasCtx.lineWidth = 4;
    canvasCtx.strokeRect(mirroredX, detectedFaceBox.box.y, detectedFaceBox.box.width, detectedFaceBox.box.height);
  }

  if (currentSystemStep === 2 && currentPoseLandmarks) {
    processPoseGamificationEngine(currentPoseLandmarks);
  }
}

async function processFaceScanRealtime() {
  if (isFaceScanFinished || isScanningInProgress) return;
  if (!isFaceModelsLoaded) { fallbackDefaultUser("Guest Profile"); return; }
  isScanningInProgress = true;

  try {
    const detection = await faceapi.detectSingleFace(videoElement).withFaceLandmarks().withFaceDescriptor();
    if (detection) {
      const currentDescriptor = detection.descriptor;
      let matchedUser = null;

      for (let user of knownFaces) {
        if (!user.descriptor) continue;
        if (faceapi.euclideanDistance(currentDescriptor, new Float32Array(user.descriptor)) < 0.60) {
          matchedUser = user; break;
        }
      }

      const box = detection.detection.box;
      let labelText = "", bgColor = "#00E676";

      if (!matchedUser) {
        const newId = "User_" + String(knownFaces.length + 1).padStart(3, '0');
        matchedUser = { id: newId, name: `คุณ (${newId})`, descriptor: Array.from(currentDescriptor), score: 0 };
        knownFaces.push(matchedUser);
        saveKnownFacesToStorage();
        userRegType.innerText = "Auto-Registered ใหม่"; userRegType.style.color = "#FF9100";
        bgColor = "#FF9100"; labelText = `✨ ลงทะเบียนใหม่: ${matchedUser.name}`;
      } else {
        userRegType.innerText = "ผู้ใช้เดิมในระบบ"; userRegType.style.color = "#00E676";
        bgColor = "#00E676"; labelText = `✅ ตรวจพบ: ${matchedUser.name}`;
      }

      activeUser = matchedUser;
      userDisplayName.innerText = activeUser.name;
      totalScoreVal.innerText = activeUser.score;
      poseStatus.innerText = `ยืนยันตัวตนสำเร็จ: ${activeUser.name}`;

      showHTMLLabel(box, bgColor, labelText);
      detectedFaceBox = { box: box, color: bgColor };
      isFaceScanFinished = true;

      // ปลดซ่อนแท็กแล้วย้ายไป Step 2
      setTimeout(() => {
        faceLabelTag.style.display = "none";
        detectedFaceBox = null;
        startPoseGamificationSession();
      }, 1000);

    } else {
      poseStatus.innerText = "🔍 กรุณามองตรงมาที่กล้องเพื่อระบุตัวตน...";
    }
  } catch (e) { console.error(e); } 
  finally { isScanningInProgress = false; }
}

function showHTMLLabel(box, color, text) {
  const mirroredX = canvasElement.width - box.x - box.width;
  faceLabelTag.style.background = color;
  faceLabelTag.style.left = `${mirroredX}px`;
  faceLabelTag.style.top = `${Math.max(box.y - 40, 10)}px`;
  faceLabelTag.innerText = text;
  faceLabelTag.style.display = "block";
}

function fallbackDefaultUser(reason) {
  isFaceScanFinished = true;
  activeUser = { id: "User_001", name: "คุณ (User_001)", score: 0 };
  userDisplayName.innerText = activeUser.name;
  userRegType.innerText = reason;
  startPoseGamificationSession();
}

function startPoseGamificationSession() {
  currentSystemStep = 2;
  currentExerciseIndex = 0;
  currentStepIndex = 0;
  currentRound = 1;
  holdStartTime = null;
  lastValidTime = null;
  isPoseProcessing = false;
  isPoseSessionActive = true;
  
  stepBadge.innerText = "STEP 2: MediaPipe Motion Engine";
  stepBadge.style.background = "#00E676";
  timerVal.innerText = `⏱️ ${HOLD_DURATION}`;
}

// 🕹️ CENTRAL MOTION GAMIFICATION ENGINE
function processPoseGamificationEngine(landmarks) {
  const currentTime = Date.now();
  const activeEx = ExerciseRegistry[currentExerciseIndex];

  if (!activeEx) return;

  exNameVal.innerText = activeEx.title;
  roundVal.innerText = `รอบที่ ${currentRound} / ${TOTAL_ROUNDS}`;

  // 1. Visibility Check
  const visCheck = activeEx.checkVisibility(landmarks);
  if (!visCheck.ready) {
    holdStartTime = null;
    lastValidTime = null;
    frameWarningBox.innerText = visCheck.errorMsg;
    frameWarningBox.style.display = "block";
    poseStatus.innerText = "⚠️ หลุดขอบเฟรม! สแกนท่าทางหยุดชั่วคราว";
    poseStatus.style.color = "#FF5252";
    camScoreVal.innerText = "0% (Out of Frame)";
    timerVal.innerText = `⏱️ ${HOLD_DURATION}`;
    return;
  } else {
    frameWarningBox.style.display = "none";
  }

  // 2. Render Overlay
  activeEx.renderSkeleton(landmarks, canvasCtx, canvasElement.width, canvasElement.height);

  // 3. Form Validation
  const form = activeEx.validateForm(landmarks, currentStepIndex, canvasElement.width, canvasElement.height);

  if (form.success) {
    lastValidTime = currentTime;

    if (!holdStartTime) holdStartTime = currentTime;
    
    const elapsed = Math.floor((currentTime - holdStartTime) / 1000);
    const remaining = HOLD_DURATION - elapsed;

    camScoreVal.innerText = "100% (Form Perfect)";
    camScoreVal.style.color = "#00E676";

    if (remaining > 0) {
      poseStatus.innerText = `ดีมาก! ค้างท่าไว้... (${activeEx.steps[currentStepIndex].instruction})`;
      poseStatus.style.color = "#00E676";
      timerVal.innerText = `⏱️ ${remaining}`;
    } else {
      let setScore = 50 + (simulatedFSRRelaxed ? 20 : 0);
      currentSessionScore += setScore;
      addScoreToActiveUser(setScore);

      holdStartTime = null;
      lastValidTime = null;
      
      if (currentStepIndex < activeEx.steps.length - 1) {
        currentStepIndex++;
      } else {
        currentStepIndex = 0;
        if (currentRound < TOTAL_ROUNDS) {
          currentRound++;
        } else {
          currentExerciseIndex++;
          currentRound = 1;
          
          if (currentExerciseIndex >= ExerciseRegistry.length) {
            exNameVal.innerText = "🏆 การบริหารเสร็จสิ้นสมบูรณ์!";
            roundVal.innerText = "ครบทุกท่าบริหาร";
            poseStatus.innerText = `🎉 ยอดเยี่ยม! บันทึกคะแนนรวม ${currentSessionScore} XP เรียบร้อยแล้ว`;
            poseStatus.style.color = "#00E676";
            timerVal.innerText = "✅ สำเร็จ";
            isPoseSessionActive = false;
            
            sessionPts.innerText = `+${currentSessionScore}`;
            summaryDetail.innerText = `ทำครบทุกท่าบริหารเรียบร้อย ${simulatedFSRRelaxed ? '+ โบนัสเซนเซอร์ FSR คลายแรงกด' : ''}`;
            summaryBox.style.display = "block";
            return;
          }
        }
      }
      timerVal.innerText = `⏱️ ${HOLD_DURATION}`;
    }
  } else {
    if (holdStartTime && lastValidTime && (currentTime - lastValidTime < GRACE_PERIOD_MS)) {
      poseStatus.innerText = "⚠️ ท่าทางเริ่มหลุด! พยายามค้างท่าไว้...";
      poseStatus.style.color = "#FF9100";
    } else {
      holdStartTime = null;
      lastValidTime = null;
      camScoreVal.innerText = "0% (ท่าทางยังไม่เข้าเกณฑ์)";
      camScoreVal.style.color = "#FFD54F";
      poseStatus.innerText = activeEx.steps[currentStepIndex].instruction;
      poseStatus.style.color = "#FFD54F";
      timerVal.innerText = `⏱️ ${HOLD_DURATION}`;
    }
  }
}

function triggerIntervention() {
  currentSystemStep = 1; currentExerciseIndex = 0; currentStepIndex = 0; currentRound = 1;
  isFaceScanFinished = false; isPoseSessionActive = false; isScanningInProgress = false; isPoseProcessing = false;
  detectedFaceBox = null; currentPoseLandmarks = null;
  faceLabelTag.style.display = "none"; summaryBox.style.display = "none"; frameWarningBox.style.display = "none";
  currentSessionScore = 0;

  stepBadge.innerText = "STEP 1: Face ID Scanning"; stepBadge.style.background = "#FF9100";
  poseStatus.innerText = "🔍 สัญญาณ Node 1 แจ้งเตือน! กำลังสแกนใบหน้า...";
  userDisplayName.innerText = "กำลังสแกนใบหน้า...";
}

function addScoreToActiveUser(pts) {
  if (!activeUser) return;
  activeUser.score += pts;
  totalScoreVal.innerText = activeUser.score;
  saveKnownFacesToStorage();
}

function toggleFSRRelaxation() {
  simulatedFSRRelaxed = !simulatedFSRRelaxed;
  sensorScoreVal.innerText = simulatedFSRRelaxed ? "FSR Released (+20 Bonus)" : "FSR Pressed";
  sensorScoreVal.style.color = simulatedFSRRelaxed ? "#00E676" : "#aaa";
}

function saveKnownFacesToStorage() { localStorage.setItem("ergo_face_db", JSON.stringify(knownFaces)); }
function loadKnownFacesFromStorage() { const data = localStorage.getItem("ergo_face_db"); if (data) knownFaces = JSON.parse(data); }
function clearFaceDatabase() {
  if (confirm("คุณต้องการล้างฐานข้อมูลใบหน้าและคะแนนทั้งหมดใช่หรือไม่?")) {
    localStorage.removeItem("ergo_face_db"); knownFaces = []; activeUser = null;
    userDisplayName.innerText = "ยังไม่ระบุตัวตน"; totalScoreVal.innerText = "0"; summaryBox.style.display = "none";
    alert("ล้างฐานข้อมูลเรียบร้อยแล้ว!");
  }
}
