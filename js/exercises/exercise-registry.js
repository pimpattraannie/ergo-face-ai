/**
 * Exercise Registry - คลังมอดูลท่าบริหาร (Decoupled & Modular Structure)
 * ท่าใหม่ๆ (3 ถึง 9) จะถูกเพิ่มใน Array นี้โดยไม่กระทบ Core Engine
 */
const ExerciseRegistry = [
  // -----------------------------------------------------------------------
  // 🏋️ ท่าที่ 1: ยืดกล้ามเนื้อคอ (Neck Stretch)
  // -----------------------------------------------------------------------
  {
    id: 1,
    title: "ท่าที่ 1: ยืดกล้ามเนื้อคอ (Neck Stretch)",
    steps: [
      { instruction: "1. เอียงคอไปทาง 'ซ้ายมือของคุณ' (ค้างไว้ 15 วินาที)" },
      { instruction: "2. เอียงคอไปทาง 'ขวามือของคุณ' (ค้างไว้ 15 วินาที)" }
    ],
    checkVisibility: function(lm) {
      const lEar = lm[7], rEar = lm[8], lSh = lm[11], rSh = lm[12];
      const ok = (lEar && lEar.visibility > 0.5 && rEar && rEar.visibility > 0.5 &&
                  lSh && lSh.visibility > 0.5 && rSh && rSh.visibility > 0.5);
      return { ready: ok, errorMsg: "⚠️ ไม่เห็นตำแหน่งหูหรือไหล่ชัดเจน" };
    },
    renderSkeleton: function(lm, canvasCtx, width, height) {
      drawLine(lm[7], lm[11], '#FF3D00', canvasCtx, width, height);
      drawLine(lm[8], lm[12], '#FF9100', canvasCtx, width, height);
      drawLine(lm[11], lm[12], '#00E676', canvasCtx, width, height);
      drawPoint(lm[7], '#FF3D00', canvasCtx, width, height); 
      drawPoint(lm[8], '#FF9100', canvasCtx, width, height);
      drawPoint(lm[11], '#00E676', canvasCtx, width, height); 
      drawPoint(lm[12], '#29B6F6', canvasCtx, width, height);
    },
    validateForm: function(lm, stepIdx, canvasWidth, canvasHeight) {
      // 🎯 สรีระจริง: 2 = ตาซ้าย, 5 = ตาขวา
      const lEye = lm[2], rEye = lm[5];
      const lx = lEye.x * canvasWidth, ly = lEye.y * canvasHeight;
      const rx = rEye.x * canvasWidth, ry = rEye.y * canvasHeight;
      
      const dx = Math.abs(lx - rx), dy = Math.abs(ly - ry);
      const angleDeg = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));

      let leftDeg = (ly > ry) ? Math.min(60, angleDeg) : 0;
      let rightDeg = (ry > ly) ? Math.min(60, angleDeg) : 0;

      document.getElementById('left-angle').innerText = leftDeg;
      document.getElementById('right-angle').innerText = rightDeg;

      const isCorrect = (stepIdx === 0) ? (leftDeg >= 20) : (rightDeg >= 20);
      return { success: isCorrect };
    }
  },

  // -----------------------------------------------------------------------
  // 🏋️ ท่าที่ 2: ยืดไหล่ข้ามอก (Cross-Body Stretch)
  // -----------------------------------------------------------------------
  {
    id: 2,
    title: "ท่าที่ 2: ยืดไหล่ข้ามอก (Cross-Body Stretch)",
    steps: [
      { instruction: "1. ดึงแขนขวาข้ามอกไปทางซ้าย แล้วใช้แขนซ้ายล็อคดันไว้" },
      { instruction: "2. ดึงแขนซ้ายข้ามอกไปทางขวา แล้วใช้แขนขวาล็อคดันไว้" }
    ],
    checkVisibility: function(lm) {
      const rWrist = lm[16], lWrist = lm[15], rElbow = lm[14], lElbow = lm[13];
      const isWristVisible = (rWrist && rWrist.visibility > 0.55 && lWrist && lWrist.visibility > 0.55);
      const isElbowVisible = (rElbow && rElbow.visibility > 0.55 && lElbow && lElbow.visibility > 0.55);

      if (!isWristVisible || !isElbowVisible) {
        return { ready: false, errorMsg: "⚠️ มองไม่เห็นมือ/แขน! กรุณาถอยห่างจากกล้องให้เห็นช่วงลำตัวถึงมือชัดเจน" };
      }
      return { ready: true, errorMsg: "" };
    },
    renderSkeleton: function(lm, canvasCtx, width, height) {
      drawPoint(lm[11], '#00E676', canvasCtx, width, height); 
      drawPoint(lm[12], '#29B6F6', canvasCtx, width, height);
      drawPoint(lm[13], '#FFD54F', canvasCtx, width, height); 
      drawPoint(lm[14], '#FFD54F', canvasCtx, width, height);
      drawPoint(lm[15], '#FF3D00', canvasCtx, width, height); 
      drawPoint(lm[16], '#FF9100', canvasCtx, width, height);
      drawLine(lm[11], lm[13], '#00E676', canvasCtx, width, height); 
      drawLine(lm[13], lm[15], '#FF3D00', canvasCtx, width, height);
      drawLine(lm[12], lm[14], '#29B6F6', canvasCtx, width, height); 
      drawLine(lm[14], lm[16], '#FF9100', canvasCtx, width, height);
    },
    validateForm: function(lm, stepIdx) {
      const rWrist = lm[16], lWrist = lm[15];
      const rElbow = lm[14], lElbow = lm[13];
      const lShoulder = lm[11], rShoulder = lm[12];
      const nose = lm[0];

      document.getElementById('left-angle').innerText = "-"; 
      document.getElementById('right-angle').innerText = "-";

      if (stepIdx === 0) {
        // Step 0: ดึงแขนขวาข้ามอกไปทางซ้ายมือของคุณ
        // 1. ระดับศอกขวาไม่ตกต่ำเกินไป (อยู่ในช่วงระดับอก)
        const isArmUp = rElbow.y < (lShoulder.y + 0.25);
        
        // 2. ข้อมือขวา (16) ถูกดึงข้ามแนวกลางลำตัว (Nose) ไปทางซ้ายมือของคุณ (ขวาของหน้าจอ: rWrist.x > nose.x)
        //    หรือดึงข้ามไปใกล้ตำแหน่งไหล่ซ้าย (11)
        const isCrossed = (rWrist.x > nose.x - 0.05) || (rWrist.x > lShoulder.x - 0.05);

        return { success: isArmUp && isCrossed };
      } else {
        // Step 1: ดึงแขนซ้ายข้ามอกไปทางขวามือของคุณ
        // 1. ระดับศอกซ้ายอยู่ในช่วงระดับอก
        const isArmUp = lElbow.y < (rShoulder.y + 0.25);
        
        // 2. ข้อมือซ้าย (15) ถูกดึงข้ามแนวกลางลำตัวไปทางขวามือของคุณ (ซ้ายของหน้าจอ: lWrist.x < nose.x)
        const isCrossed = (lWrist.x < nose.x + 0.05) || (lWrist.x < rShoulder.x + 0.05);

        return { success: isArmUp && isCrossed };
      }
    }
  }

// Helper Functions สำหรับวาดบน Canvas
function drawLine(from, to, color, ctx, width, height) {
  if (!from || !to) return;
  ctx.beginPath();
  ctx.moveTo((1 - from.x) * width, from.y * height);
  ctx.lineTo((1 - to.x) * width, to.y * height);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawPoint(lm, color, ctx, width, height) {
  if (!lm) return;
  ctx.beginPath();
  ctx.arc((1 - lm.x) * width, lm.y * height, 8, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}
