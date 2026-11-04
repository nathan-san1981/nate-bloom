  // ======================================================================
  // (202) Airwindows effects, Linux app: the FX Lab's Density, Lo-fi and Hall+, each sound's Effects Drive and the
  // master compressor run Chris Johnson's Airwindows algorithms (MIT licence, Copyright (c) 2018 Chris Johnson:
  // Density, DeRez2, Galactic, ToTape6, Pressure4), ported to JavaScript line for line and checked sample by sample
  // against the original C++ (linux/ci/airwindows). The master also gets a true-peak lookahead limiter.
  // ======================================================================
  const NB_AW_SRC = `
// (202) Airwindows effects ported to JavaScript for Nate Bloom's audio thread (the Linux app). Each is Chris Johnson's
// algorithm from airwindows/airwindows (MIT licence, Copyright (c) 2018 Chris Johnson), processReplacing transcribed
// line for line, in double precision; only the 32-bit output dither is left out (about -140 dB). Parameters A-F are
// the plugin's own 0-1 sliders. Checked against the original C++ in CI-style tests (linux/ci/aw_check).
class AWBase {
  constructor(sr) { this.sr = sr || 48000; this.fpdL = 17; this.fpdR = 4567; }
  nextL() { let f = this.fpdL; f = (f ^ (f << 13)) >>> 0; f = (f ^ (f >>> 17)) >>> 0; f = (f ^ (f << 5)) >>> 0; this.fpdL = f; }
  nextR() { let f = this.fpdR; f = (f ^ (f << 13)) >>> 0; f = (f ^ (f >>> 17)) >>> 0; f = (f ^ (f << 5)) >>> 0; this.fpdR = f; }
  set(o) { for (const k in o) if (k in this) this[k] = Math.fround(o[k]); }
}

class AWDensity extends AWBase {
  constructor(sr) { super(sr); this.A = Math.fround(0.2); this.B = 0; this.C = 1; this.D = 1; this.iirSampleAL = 0; this.iirSampleBL = 0; this.iirSampleAR = 0; this.iirSampleBR = 0; this.fpFlip = false; }
  process(in1, in2, out1, out2, n) {
    const overallscale = this.sr / 44100;
    let density = (this.A * 5.0) - 1.0; const iirAmount = Math.pow(this.B, 3) / overallscale, output = this.C, wet = this.D, dry = 1.0 - wet;
    let out = Math.abs(density); density = density * Math.abs(density);
    for (let i = 0; i < n; i++) {
      let L = in1[i], R = in2[i];
      if (Math.abs(L) < 1.18e-23) L = this.fpdL * 1.18e-17;
      if (Math.abs(R) < 1.18e-23) R = this.fpdR * 1.18e-17;
      const dL = L, dR = R;
      if (this.fpFlip) { this.iirSampleAL = (this.iirSampleAL * (1.0 - iirAmount)) + (L * iirAmount); L -= this.iirSampleAL; this.iirSampleAR = (this.iirSampleAR * (1.0 - iirAmount)) + (R * iirAmount); R -= this.iirSampleAR; }
      else { this.iirSampleBL = (this.iirSampleBL * (1.0 - iirAmount)) + (L * iirAmount); L -= this.iirSampleBL; this.iirSampleBR = (this.iirSampleBR * (1.0 - iirAmount)) + (R * iirAmount); R -= this.iirSampleBR; }
      this.fpFlip = !this.fpFlip;
      let count = density, b;
      while (count > 1.0) {
        b = Math.abs(L) * 1.57079633; if (b > 1.57079633) b = 1.57079633; b = Math.sin(b); L = L > 0.0 ? b : -b;
        b = Math.abs(R) * 1.57079633; if (b > 1.57079633) b = 1.57079633; b = Math.sin(b); R = R > 0.0 ? b : -b;
        count = count - 1.0;
      }
      while (out > 1.0) out = out - 1.0;
      b = Math.abs(L) * 1.57079633; if (b > 1.57079633) b = 1.57079633;
      b = density > 0 ? Math.sin(b) : 1 - Math.cos(b);
      L = L > 0 ? (L * (1 - out)) + (b * out) : (L * (1 - out)) - (b * out);
      b = Math.abs(R) * 1.57079633; if (b > 1.57079633) b = 1.57079633;
      b = density > 0 ? Math.sin(b) : 1 - Math.cos(b);
      R = R > 0 ? (R * (1.0 - out)) + (b * out) : (R * (1.0 - out)) - (b * out);
      if (output < 1.0) { L *= output; R *= output; }
      if (wet < 1.0) { L = (dL * dry) + (L * wet); R = (dR * dry) + (R * wet); }
      this.nextL(); this.nextR();
      out1[i] = L; out2[i] = R;
    }
  }
}

class AWDeRez2 extends AWBase {
  constructor(sr) { super(sr); this.A = 1; this.B = 1; this.C = 1; this.D = 1; this.lastSampleL = 0; this.heldSampleL = 0; this.lastDrySampleL = 0; this.lastOutputSampleL = 0; this.lastSampleR = 0; this.heldSampleR = 0; this.lastDrySampleR = 0; this.lastOutputSampleR = 0; this.position = 0; this.incrementA = 0; this.incrementB = 0; }
  process(in1, in2, out1, out2, n) {
    let targetA = Math.pow(this.A, 3) + 0.0005; if (targetA > 1.0) targetA = 1.0;
    const soften = (1.0 + targetA) / 2, targetB = Math.pow(1.0 - this.B, 3) / 3, hard = this.C, wet = this.D, overallscale = this.sr / 44100;
    targetA /= overallscale;
    const L256 = Math.log(256);
    for (let i = 0; i < n; i++) {
      let L = in1[i], R = in2[i];
      if (Math.abs(L) < 1.18e-23) L = this.fpdL * 1.18e-17;
      if (Math.abs(R) < 1.18e-23) R = this.fpdR * 1.18e-17;
      const dL = L, dR = R;
      this.incrementA = ((this.incrementA * 999.0) + targetA) / 1000.0;
      this.incrementB = ((this.incrementB * 999.0) + targetB) / 1000.0;
      this.position += this.incrementA;
      let oL = this.heldSampleL, oR = this.heldSampleR;
      if (this.position > 1.0) {
        this.position -= 1.0;
        this.heldSampleL = (this.lastSampleL * this.position) + (L * (1.0 - this.position)); oL = (oL * (1.0 - soften)) + (this.heldSampleL * soften);
        this.heldSampleR = (this.lastSampleR * this.position) + (R * (1.0 - this.position)); oR = (oR * (1.0 - soften)) + (this.heldSampleR * soften);
      }
      L = oL; R = oR;
      let tL, tR;
      if (L !== this.lastOutputSampleL) { tL = L; L = (L * hard) + (this.lastDrySampleL * (1.0 - hard)); this.lastOutputSampleL = tL; } else this.lastOutputSampleL = L;
      if (R !== this.lastOutputSampleR) { tR = R; R = (R * hard) + (this.lastDrySampleR * (1.0 - hard)); this.lastOutputSampleR = tR; } else this.lastOutputSampleR = R;
      this.lastDrySampleL = dL; this.lastDrySampleR = dR;
      tL = L; tR = R;
      if (L > 1.0) L = 1.0; if (L < -1.0) L = -1.0; if (R > 1.0) R = 1.0; if (R < -1.0) R = -1.0;
      if (L > 0) L = Math.log(1.0 + (255 * Math.abs(L))) / L256; if (L < 0) L = -Math.log(1.0 + (255 * Math.abs(L))) / L256;
      if (R > 0) R = Math.log(1.0 + (255 * Math.abs(R))) / L256; if (R < 0) R = -Math.log(1.0 + (255 * Math.abs(R))) / L256;
      L = (tL * hard) + (L * (1.0 - hard)); R = (tR * hard) + (R * (1.0 - hard));
      const ib = this.incrementB;
      if (ib > 0.0005) {   // (the original steps down by ib one at a time; this lands on the same multiple of ib directly)
        if (L > 0) { let t = L; t -= Math.ceil(t / ib) * ib; if (t > 0) t -= ib; L -= t; }
        if (R > 0) { let t = R; t -= Math.ceil(t / ib) * ib; if (t > 0) t -= ib; R -= t; }
        if (L < 0) { let t = L; t -= Math.floor(t / ib) * ib; if (t < 0) t += ib; L -= t; }
        if (R < 0) { let t = R; t -= Math.floor(t / ib) * ib; if (t < 0) t += ib; R -= t; }
        L *= (1.0 - ib); R *= (1.0 - ib);
      }
      tL = L; tR = R;
      if (L > 1.0) L = 1.0; if (L < -1.0) L = -1.0; if (R > 1.0) R = 1.0; if (R < -1.0) R = -1.0;
      if (L > 0) L = (Math.pow(256, Math.abs(L)) - 1.0) / 255; if (L < 0) L = -(Math.pow(256, Math.abs(L)) - 1.0) / 255;
      if (R > 0) R = (Math.pow(256, Math.abs(R)) - 1.0) / 255; if (R < 0) R = -(Math.pow(256, Math.abs(R)) - 1.0) / 255;
      L = (tL * hard) + (L * (1.0 - hard)); R = (tR * hard) + (R * (1.0 - hard));
      if (wet !== 1.0) { L = (L * wet) + (dL * (1.0 - wet)); R = (R * wet) + (dR * (1.0 - wet)); }
      this.lastSampleL = dL; this.lastSampleR = dR;
      this.nextL(); this.nextR();
      out1[i] = L; out2[i] = R;
    }
  }
}

class AWPressure4 extends AWBase {
  constructor(sr) { super(sr); this.A = 0; this.B = Math.fround(0.2); this.C = 1; this.D = 1; this.muSpeedA = 10000; this.muSpeedB = 10000; this.muCoefficientA = 1; this.muCoefficientB = 1; this.muVary = 1; this.flip = false; this.gr = 1; }
  process(in1, in2, out1, out2, n) {
    const overallscale = this.sr / 44100, threshold = 1.0 - (this.A * 0.95), muMakeupGain = 1.0 / threshold;
    let release = Math.pow((1.28 - this.B), 5) * 32768.0; release /= overallscale;
    const fastest = Math.sqrt(release), outputGain = this.D;
    let mewiness = (this.C * 2.0) - 1.0, unmewiness, positivemu;
    if (mewiness >= 0) { positivemu = true; unmewiness = 1.0 - mewiness; } else { positivemu = false; mewiness = -mewiness; unmewiness = 1.0 - mewiness; }
    let grMin = 1;
    for (let i = 0; i < n; i++) {
      let L = in1[i], R = in2[i];
      if (Math.abs(L) < 1.18e-23) L = this.fpdL * 1.18e-17;
      if (Math.abs(R) < 1.18e-23) R = this.fpdR * 1.18e-17;
      L = L * muMakeupGain; R = R * muMakeupGain;
      let inputSense = Math.abs(L); if (Math.abs(R) > inputSense) inputSense = Math.abs(R);
      let muAttack, muNewSpeed;
      if (this.flip) {
        if (inputSense > threshold) {
          this.muVary = threshold / inputSense; muAttack = Math.sqrt(Math.abs(this.muSpeedA));
          this.muCoefficientA = this.muCoefficientA * (muAttack - 1.0);
          this.muCoefficientA = this.muCoefficientA + (this.muVary < threshold ? threshold : this.muVary);
          this.muCoefficientA = this.muCoefficientA / muAttack;
        } else { this.muCoefficientA = this.muCoefficientA * ((this.muSpeedA * this.muSpeedA) - 1.0); this.muCoefficientA = this.muCoefficientA + 1.0; this.muCoefficientA = this.muCoefficientA / (this.muSpeedA * this.muSpeedA); }
        muNewSpeed = this.muSpeedA * (this.muSpeedA - 1); muNewSpeed = muNewSpeed + Math.abs(inputSense * release) + fastest; this.muSpeedA = muNewSpeed / this.muSpeedA;
      } else {
        if (inputSense > threshold) {
          this.muVary = threshold / inputSense; muAttack = Math.sqrt(Math.abs(this.muSpeedB));
          this.muCoefficientB = this.muCoefficientB * (muAttack - 1);
          this.muCoefficientB = this.muCoefficientB + (this.muVary < threshold ? threshold : this.muVary);
          this.muCoefficientB = this.muCoefficientB / muAttack;
        } else { this.muCoefficientB = this.muCoefficientB * ((this.muSpeedB * this.muSpeedB) - 1.0); this.muCoefficientB = this.muCoefficientB + 1.0; this.muCoefficientB = this.muCoefficientB / (this.muSpeedB * this.muSpeedB); }
        muNewSpeed = this.muSpeedB * (this.muSpeedB - 1); muNewSpeed = muNewSpeed + Math.abs(inputSense * release) + fastest; this.muSpeedB = muNewSpeed / this.muSpeedB;
      }
      const mc = this.flip ? this.muCoefficientA : this.muCoefficientB;
      let coefficient = positivemu ? Math.pow(mc, 2) : Math.sqrt(mc);
      coefficient = (coefficient * mewiness) + (mc * unmewiness);
      L *= coefficient; R *= coefficient; if (coefficient < grMin) grMin = coefficient;
      // (the original never toggles flip, so it always runs the B side; kept as is so it sounds the same)
      if (outputGain !== 1.0) { L *= outputGain; R *= outputGain; }
      let b = Math.abs(L); b = b > 1.57079633 ? 1.0 : Math.sin(b); L = L > 0 ? b : -b;
      b = Math.abs(R); b = b > 1.57079633 ? 1.0 : Math.sin(b); R = R > 0 ? b : -b;
      this.nextL(); this.nextR();
      out1[i] = L; out2[i] = R;
    }
    this.gr = grMin;   // (the block's deepest gain reduction, for a meter)
  }
}

class AWGalactic extends AWBase {
  constructor(sr) {
    super(sr); this.A = 0.5; this.B = 0.5; this.C = 0.5; this.D = 1; this.E = 1;
    const mk = k => new Float64Array(k);
    this.aIL = mk(6480); this.aJL = mk(3660); this.aKL = mk(1720); this.aLL = mk(680); this.aAL = mk(9700); this.aBL = mk(6000); this.aCL = mk(2320); this.aDL = mk(940); this.aEL = mk(15220); this.aFL = mk(8460); this.aGL = mk(4540); this.aHL = mk(3200); this.aML = mk(3111);
    this.aIR = mk(6480); this.aJR = mk(3660); this.aKR = mk(1720); this.aLR = mk(680); this.aAR = mk(9700); this.aBR = mk(6000); this.aCR = mk(2320); this.aDR = mk(940); this.aER = mk(15220); this.aFR = mk(8460); this.aGR = mk(4540); this.aHR = mk(3200); this.aMR = mk(3111);
    this.iirAL = 0; this.iirAR = 0; this.iirBL = 0; this.iirBR = 0;
    this.feedbackAL = 0; this.feedbackAR = 0; this.feedbackBL = 0; this.feedbackBR = 0; this.feedbackCL = 0; this.feedbackCR = 0; this.feedbackDL = 0; this.feedbackDR = 0;
    this.lastRefL = new Float64Array(7); this.lastRefR = new Float64Array(7);
    this.countI = 1; this.countJ = 1; this.countK = 1; this.countL = 1; this.countA = 1; this.countB = 1; this.countC = 1; this.countD = 1; this.countE = 1; this.countF = 1; this.countG = 1; this.countH = 1; this.countM = 1;
    this.cycle = 0; this.vibM = 3.0; this.oldfpd = 429496.7295;
  }
  process(in1, in2, out1, out2, n) {
    const s = this, overallscale = s.sr / 44100;
    let cycleEnd = Math.floor(overallscale); if (cycleEnd < 1) cycleEnd = 1; if (cycleEnd > 4) cycleEnd = 4;
    if (s.cycle > cycleEnd - 1) s.cycle = cycleEnd - 1;
    const regen = 0.0625 + ((1.0 - s.A) * 0.0625), attenuate = (1.0 - (regen / 0.125)) * 1.333;
    const lowpass = Math.pow(1.00001 - (1.0 - s.B), 2.0) / Math.sqrt(overallscale), drift = Math.pow(s.C, 3) * 0.001;
    const size = (s.D * 1.77) + 0.1, wet = 1.0 - (Math.pow(1.0 - s.E, 3));
    const dI = Math.trunc(3407.0 * size), dJ = Math.trunc(1823.0 * size), dK = Math.trunc(859.0 * size), dL = Math.trunc(331.0 * size);
    const dA = Math.trunc(4801.0 * size), dB = Math.trunc(2909.0 * size), dC = Math.trunc(1153.0 * size), dD = Math.trunc(461.0 * size);
    const dE = Math.trunc(7607.0 * size), dF = Math.trunc(4217.0 * size), dG = Math.trunc(2269.0 * size), dH = Math.trunc(1597.0 * size), dM = 256;
    const rd = (a, c, d) => a[c - ((c > d) ? d + 1 : 0)];
    const TAU = 3.141592653589793238 * 2.0;
    for (let i = 0; i < n; i++) {
      let L = in1[i], R = in2[i];
      if (Math.abs(L) < 1.18e-23) L = s.fpdL * 1.18e-17;
      if (Math.abs(R) < 1.18e-23) R = s.fpdR * 1.18e-17;
      const drL = L, drR = R;
      s.vibM += (s.oldfpd * drift);
      if (s.vibM > TAU) { s.vibM = 0.0; s.oldfpd = 0.4294967295 + (s.fpdL * 0.0000000000618); }
      s.aML[s.countM] = L * attenuate; s.aMR[s.countM] = R * attenuate;
      s.countM++; if (s.countM < 0 || s.countM > dM) s.countM = 0;
      const offL = (Math.sin(s.vibM) + 1.0) * 127, offR = (Math.sin(s.vibM + (3.141592653589793238 / 2.0)) + 1.0) * 127;
      const wL = s.countM + Math.trunc(offL), wR = s.countM + Math.trunc(offR);
      const fL = offL - Math.floor(offL), fR = offR - Math.floor(offR);
      L = s.aML[wL - ((wL > dM) ? dM + 1 : 0)] * (1 - fL) + s.aML[wL + 1 - ((wL + 1 > dM) ? dM + 1 : 0)] * fL;
      R = s.aMR[wR - ((wR > dM) ? dM + 1 : 0)] * (1 - fR) + s.aMR[wR + 1 - ((wR + 1 > dM) ? dM + 1 : 0)] * fR;
      s.iirAL = (s.iirAL * (1.0 - lowpass)) + (L * lowpass); L = s.iirAL;
      s.iirAR = (s.iirAR * (1.0 - lowpass)) + (R * lowpass); R = s.iirAR;
      s.cycle++;
      if (s.cycle === cycleEnd) {
        s.aIL[s.countI] = L + (s.feedbackAR * regen); s.aJL[s.countJ] = L + (s.feedbackBR * regen); s.aKL[s.countK] = L + (s.feedbackCR * regen); s.aLL[s.countL] = L + (s.feedbackDR * regen);
        s.aIR[s.countI] = R + (s.feedbackAL * regen); s.aJR[s.countJ] = R + (s.feedbackBL * regen); s.aKR[s.countK] = R + (s.feedbackCL * regen); s.aLR[s.countL] = R + (s.feedbackDL * regen);
        s.countI++; if (s.countI < 0 || s.countI > dI) s.countI = 0;
        s.countJ++; if (s.countJ < 0 || s.countJ > dJ) s.countJ = 0;
        s.countK++; if (s.countK < 0 || s.countK > dK) s.countK = 0;
        s.countL++; if (s.countL < 0 || s.countL > dL) s.countL = 0;
        const oIL = rd(s.aIL, s.countI, dI), oJL = rd(s.aJL, s.countJ, dJ), oKL = rd(s.aKL, s.countK, dK), oLL = rd(s.aLL, s.countL, dL);
        const oIR = rd(s.aIR, s.countI, dI), oJR = rd(s.aJR, s.countJ, dJ), oKR = rd(s.aKR, s.countK, dK), oLR = rd(s.aLR, s.countL, dL);
        s.aAL[s.countA] = (oIL - (oJL + oKL + oLL)); s.aBL[s.countB] = (oJL - (oIL + oKL + oLL)); s.aCL[s.countC] = (oKL - (oIL + oJL + oLL)); s.aDL[s.countD] = (oLL - (oIL + oJL + oKL));
        s.aAR[s.countA] = (oIR - (oJR + oKR + oLR)); s.aBR[s.countB] = (oJR - (oIR + oKR + oLR)); s.aCR[s.countC] = (oKR - (oIR + oJR + oLR)); s.aDR[s.countD] = (oLR - (oIR + oJR + oKR));
        s.countA++; if (s.countA < 0 || s.countA > dA) s.countA = 0;
        s.countB++; if (s.countB < 0 || s.countB > dB) s.countB = 0;
        s.countC++; if (s.countC < 0 || s.countC > dC) s.countC = 0;
        s.countD++; if (s.countD < 0 || s.countD > dD) s.countD = 0;
        const oAL = rd(s.aAL, s.countA, dA), oBL = rd(s.aBL, s.countB, dB), oCL = rd(s.aCL, s.countC, dC), oDL = rd(s.aDL, s.countD, dD);
        const oAR = rd(s.aAR, s.countA, dA), oBR = rd(s.aBR, s.countB, dB), oCR = rd(s.aCR, s.countC, dC), oDR = rd(s.aDR, s.countD, dD);
        s.aEL[s.countE] = (oAL - (oBL + oCL + oDL)); s.aFL[s.countF] = (oBL - (oAL + oCL + oDL)); s.aGL[s.countG] = (oCL - (oAL + oBL + oDL)); s.aHL[s.countH] = (oDL - (oAL + oBL + oCL));
        s.aER[s.countE] = (oAR - (oBR + oCR + oDR)); s.aFR[s.countF] = (oBR - (oAR + oCR + oDR)); s.aGR[s.countG] = (oCR - (oAR + oBR + oDR)); s.aHR[s.countH] = (oDR - (oAR + oBR + oCR));
        s.countE++; if (s.countE < 0 || s.countE > dE) s.countE = 0;
        s.countF++; if (s.countF < 0 || s.countF > dF) s.countF = 0;
        s.countG++; if (s.countG < 0 || s.countG > dG) s.countG = 0;
        s.countH++; if (s.countH < 0 || s.countH > dH) s.countH = 0;
        const oEL = rd(s.aEL, s.countE, dE), oFL = rd(s.aFL, s.countF, dF), oGL = rd(s.aGL, s.countG, dG), oHL = rd(s.aHL, s.countH, dH);
        const oER = rd(s.aER, s.countE, dE), oFR = rd(s.aFR, s.countF, dF), oGR = rd(s.aGR, s.countG, dG), oHR = rd(s.aHR, s.countH, dH);
        s.feedbackAL = (oEL - (oFL + oGL + oHL)); s.feedbackBL = (oFL - (oEL + oGL + oHL)); s.feedbackCL = (oGL - (oEL + oFL + oHL)); s.feedbackDL = (oHL - (oEL + oFL + oGL));
        s.feedbackAR = (oER - (oFR + oGR + oHR)); s.feedbackBR = (oFR - (oER + oGR + oHR)); s.feedbackCR = (oGR - (oER + oFR + oHR)); s.feedbackDR = (oHR - (oER + oFR + oGR));
        L = (oEL + oFL + oGL + oHL) / 8.0; R = (oER + oFR + oGR + oHR) / 8.0;
        const fl = s.lastRefL, fr = s.lastRefR;
        if (cycleEnd === 4) { fl[0] = fl[4]; fl[2] = (fl[0] + L) / 2; fl[1] = (fl[0] + fl[2]) / 2; fl[3] = (fl[2] + L) / 2; fl[4] = L; fr[0] = fr[4]; fr[2] = (fr[0] + R) / 2; fr[1] = (fr[0] + fr[2]) / 2; fr[3] = (fr[2] + R) / 2; fr[4] = R; }
        if (cycleEnd === 3) { fl[0] = fl[3]; fl[2] = (fl[0] + fl[0] + L) / 3; fl[1] = (fl[0] + L + L) / 3; fl[3] = L; fr[0] = fr[3]; fr[2] = (fr[0] + fr[0] + R) / 3; fr[1] = (fr[0] + R + R) / 3; fr[3] = R; }
        if (cycleEnd === 2) { fl[0] = fl[2]; fl[1] = (fl[0] + L) / 2; fl[2] = L; fr[0] = fr[2]; fr[1] = (fr[0] + R) / 2; fr[2] = R; }
        if (cycleEnd === 1) { fl[0] = L; fr[0] = R; }
        s.cycle = 0; L = fl[s.cycle]; R = fr[s.cycle];
      } else { L = s.lastRefL[s.cycle]; R = s.lastRefR[s.cycle]; }
      s.iirBL = (s.iirBL * (1.0 - lowpass)) + (L * lowpass); L = s.iirBL;
      s.iirBR = (s.iirBR * (1.0 - lowpass)) + (R * lowpass); R = s.iirBR;
      if (wet < 1.0) { L = (L * wet) + (drL * (1.0 - wet)); R = (R * wet) + (drR * (1.0 - wet)); }
      s.nextL(); s.nextR();
      out1[i] = L; out2[i] = R;
    }
  }
}

class AWToTape6 extends AWBase {
  constructor(sr) {
    super(sr); this.A = 0.5; this.B = 0.5; this.C = 0.5; this.D = 0.5; this.E = 0.5; this.F = 1;
    this.iirMidRollerAL = 0; this.iirMidRollerBL = 0; this.iirHeadBumpAL = 0; this.iirHeadBumpBL = 0; this.iirMidRollerAR = 0; this.iirMidRollerBR = 0; this.iirHeadBumpAR = 0; this.iirHeadBumpBR = 0;
    const b = () => new Float64Array(9); this.bAL = b(); this.bBL = b(); this.bCL = b(); this.bDL = b(); this.bAR = b(); this.bBR = b(); this.bCR = b(); this.bDR = b();
    this.flip = false; this.dL = new Float64Array(501); this.dR = new Float64Array(501); this.gcount = 0; this.rateof = 0.5; this.sweep = Math.PI; this.nextmax = 0.5; this.lastSampleL = 0; this.lastSampleR = 0;
  }
  process(in1, in2, out1, out2, n) {
    const s = this, overallscale = s.sr / 44100;
    const inputgain = Math.pow(10.0, ((s.A - 0.5) * 24.0) / 20.0), SoftenControl = Math.pow(s.B, 2), RollAmount = (1.0 - (SoftenControl * 0.45)) / overallscale;
    const HeadBumpControl = s.C * 0.25 * inputgain, HeadBumpFreq = 0.12 / overallscale;
    const setBq = (arrs, f, q) => { const K = Math.tan(Math.PI * f), norm = 1.0 / (1.0 + K / q + K * K); for (const a of arrs) { a[0] = f; a[1] = q; a[2] = K / q * norm; a[4] = -a[2]; a[5] = 2.0 * (K * K - 1.0) * norm; a[6] = (1.0 - K / q + K * K) * norm; } };
    setBq([s.bAL, s.bBL, s.bAR, s.bBR], 0.007 / overallscale, 0.0009);
    setBq([s.bCL, s.bDL, s.bCR, s.bDR], 0.032 / overallscale, 0.0007);
    const depth = Math.pow(s.D, 2) * overallscale * 70, fluttertrim = (0.0024 * Math.pow(s.D, 2)) / overallscale;
    const outputgain = Math.pow(10.0, ((s.E - 0.5) * 24.0) / 20.0), refclip = 0.99, softness = 0.618033988749894848204586, wet = s.F;
    const UINT32_MAX = 4294967295;
    const bq = (a, x) => { const t = (x * a[2]) + a[7]; a[7] = (x * a[3]) - (t * a[5]) + a[8]; a[8] = (x * a[4]) - (t * a[6]); return t; };
    const clamp1 = x => x > 1.0 ? 1.0 : x < -1.0 ? -1.0 : x;
    for (let i = 0; i < n; i++) {
      let L = in1[i], R = in2[i];
      if (Math.abs(L) < 1.18e-23) L = s.fpdL * 1.18e-17;
      if (Math.abs(R) < 1.18e-23) R = s.fpdR * 1.18e-17;
      const drL = L, drR = R;
      if (inputgain < 1.0) { L *= inputgain; R *= inputgain; }
      const flutterrandy = s.fpdL / UINT32_MAX;
      if (s.gcount < 0 || s.gcount > 499) s.gcount = 499;
      s.dL[s.gcount] = L; s.dR[s.gcount] = R;
      let count = s.gcount;
      if (depth !== 0.0) {
        const offset = depth + (depth * Math.pow(s.rateof, 2) * Math.sin(s.sweep)), fo = offset - Math.floor(offset);
        count += Math.floor(offset);
        L = s.dL[count - ((count > 499) ? 500 : 0)] * (1 - fo); R = s.dR[count - ((count > 499) ? 500 : 0)] * (1 - fo);
        L += s.dL[count + 1 - ((count + 1 > 499) ? 500 : 0)] * fo; R += s.dR[count + 1 - ((count + 1 > 499) ? 500 : 0)] * fo;
        s.rateof = (s.rateof * (1.0 - fluttertrim)) + (s.nextmax * fluttertrim);
        s.sweep += s.rateof * fluttertrim;
        if (s.sweep >= (Math.PI * 2.0)) { s.sweep -= Math.PI; s.nextmax = 0.24 + (flutterrandy * 0.74); }
      }
      s.gcount--;
      const vL = L, vR = R; let hL = 0, hR = 0;
      if (s.flip) {
        s.iirMidRollerAL = (s.iirMidRollerAL * (1.0 - RollAmount)) + (L * RollAmount); s.iirMidRollerAR = (s.iirMidRollerAR * (1.0 - RollAmount)) + (R * RollAmount);
        hL = L - s.iirMidRollerAL; hR = R - s.iirMidRollerAR;
        s.iirHeadBumpAL += (L * 0.05); s.iirHeadBumpAR += (R * 0.05);
        s.iirHeadBumpAL -= (s.iirHeadBumpAL * s.iirHeadBumpAL * s.iirHeadBumpAL * HeadBumpFreq); s.iirHeadBumpAR -= (s.iirHeadBumpAR * s.iirHeadBumpAR * s.iirHeadBumpAR * HeadBumpFreq);
        s.iirHeadBumpAL = Math.sin(s.iirHeadBumpAL); s.iirHeadBumpAR = Math.sin(s.iirHeadBumpAR);
        s.iirHeadBumpAL = Math.asin(clamp1(bq(s.bAL, s.iirHeadBumpAL))); s.iirHeadBumpAR = Math.asin(clamp1(bq(s.bAR, s.iirHeadBumpAR)));
        L = Math.asin(clamp1(bq(s.bCL, Math.sin(L)))); R = Math.asin(clamp1(bq(s.bCR, Math.sin(R))));
      } else {
        s.iirMidRollerBL = (s.iirMidRollerBL * (1.0 - RollAmount)) + (L * RollAmount); s.iirMidRollerBR = (s.iirMidRollerBR * (1.0 - RollAmount)) + (R * RollAmount);
        hL = L - s.iirMidRollerBL; hR = R - s.iirMidRollerBR;
        s.iirHeadBumpBL += (L * 0.05); s.iirHeadBumpBR += (R * 0.05);
        s.iirHeadBumpBL -= (s.iirHeadBumpBL * s.iirHeadBumpBL * s.iirHeadBumpBL * HeadBumpFreq); s.iirHeadBumpBR -= (s.iirHeadBumpBR * s.iirHeadBumpBR * s.iirHeadBumpBR * HeadBumpFreq);
        s.iirHeadBumpBL = Math.sin(s.iirHeadBumpBL); s.iirHeadBumpBR = Math.sin(s.iirHeadBumpBR);
        s.iirHeadBumpBL = Math.asin(clamp1(bq(s.bBL, s.iirHeadBumpBL))); s.iirHeadBumpBR = Math.asin(clamp1(bq(s.bBR, s.iirHeadBumpBR)));
        L = Math.asin(clamp1(bq(s.bDL, Math.sin(L)))); R = Math.asin(clamp1(bq(s.bDR, Math.sin(R))));
      }
      s.flip = !s.flip;
      const gL = vL - L, gR = vR - R;
      if (inputgain > 1.0) { L *= inputgain; R *= inputgain; }
      let a = Math.abs(hL) * 1.57079633; if (a > 1.57079633) a = 1.57079633; a = 1 - Math.cos(a); if (hL > 0) L -= a; if (hL < 0) L += a;
      a = Math.abs(hR) * 1.57079633; if (a > 1.57079633) a = 1.57079633; a = 1 - Math.cos(a); if (hR > 0) R -= a; if (hR < 0) R += a;
      let sup = (1.0 - Math.abs(L)) * 0.00013;
      if (s.iirHeadBumpAL > sup) s.iirHeadBumpAL -= sup; if (s.iirHeadBumpAL < -sup) s.iirHeadBumpAL += sup;
      if (s.iirHeadBumpBL > sup) s.iirHeadBumpBL -= sup; if (s.iirHeadBumpBL < -sup) s.iirHeadBumpBL += sup;
      sup = (1.0 - Math.abs(R)) * 0.00013;
      if (s.iirHeadBumpAR > sup) s.iirHeadBumpAR -= sup; if (s.iirHeadBumpAR < -sup) s.iirHeadBumpAR += sup;
      if (s.iirHeadBumpBR > sup) s.iirHeadBumpBR -= sup; if (s.iirHeadBumpBR < -sup) s.iirHeadBumpBR += sup;
      L += ((s.iirHeadBumpAL + s.iirHeadBumpBL) * HeadBumpControl); R += ((s.iirHeadBumpAR + s.iirHeadBumpBR) * HeadBumpControl);
      L = clamp1(L); let mojo = Math.pow(Math.abs(L), 0.25); if (mojo > 0.0) L = Math.sin(L * mojo * Math.PI * 0.5) / mojo;
      R = clamp1(R); mojo = Math.pow(Math.abs(R), 0.25); if (mojo > 0.0) R = Math.sin(R * mojo * Math.PI * 0.5) / mojo;
      L += gL; R += gR;
      if (outputgain !== 1.0) { L *= outputgain; R *= outputgain; }
      if (s.lastSampleL >= refclip) s.lastSampleL = L < refclip ? (refclip * softness) + (L * (1.0 - softness)) : refclip;
      if (s.lastSampleL <= -refclip) s.lastSampleL = L > -refclip ? (-refclip * softness) + (L * (1.0 - softness)) : -refclip;
      if (L > refclip) L = s.lastSampleL < refclip ? (refclip * softness) + (s.lastSampleL * (1.0 - softness)) : refclip;
      if (L < -refclip) L = s.lastSampleL > -refclip ? (-refclip * softness) + (s.lastSampleL * (1.0 - softness)) : -refclip;
      s.lastSampleL = L;
      if (s.lastSampleR >= refclip) s.lastSampleR = R < refclip ? (refclip * softness) + (R * (1.0 - softness)) : refclip;
      if (s.lastSampleR <= -refclip) s.lastSampleR = R > -refclip ? (-refclip * softness) + (R * (1.0 - softness)) : -refclip;
      if (R > refclip) R = s.lastSampleR < refclip ? (refclip * softness) + (s.lastSampleR * (1.0 - softness)) : refclip;
      if (R < -refclip) R = s.lastSampleR > -refclip ? (-refclip * softness) + (s.lastSampleR * (1.0 - softness)) : -refclip;
      s.lastSampleR = R;
      if (L > refclip) L = refclip; if (L < -refclip) L = -refclip; if (R > refclip) R = refclip; if (R < -refclip) R = -refclip;
      if (wet !== 1.0) { L = (L * wet) + (drL * (1.0 - wet)); R = (R * wet) + (drR * (1.0 - wet)); }
      s.nextL(); s.nextR();
      out1[i] = L; out2[i] = R;
    }
  }
}

// (202) Nate Bloom's master safety limiter: true-peak (inter-sample peaks found by 4x oversampling with a 12-tap-per-phase
// windowed sinc, as in ITU-R BS.1770), 1.5 ms lookahead, a hold then a box average of the same length so the gain is already
// down when a peak arrives (never over the ceiling, no clicks), then a smooth release. Written for Nate Bloom (GPL-3).
class NBTruePeak {
  constructor(sr) {
    this.sr = sr || 48000; this.ceil = 0.84; this.rel = 1 - Math.exp(-1 / (0.09 * this.sr));
    const W = this.W = Math.max(8, Math.round(this.sr * 0.0015));
    this.T = 12; this.dly = W - 1 + 5;   // (5: the interpolator looks 5 samples past the one it checks)
    this.bL = new Float64Array(this.dly + 1); this.bR = new Float64Array(this.dly + 1); this.bi = 0;
    this.hL = new Float64Array(16); this.hR = new Float64Array(16); this.hi = 0;
    this.rq = new Float64Array(W).fill(1); this.ri = 0; this.hq = new Float64Array(W).fill(1); this.sum = W; this.g = 1; this.gr = 1;
    this.ph = NBTruePeak.taps();
  }
  static taps() {   // phases 1/4, 2/4, 3/4 between history samples 5 and 6 (oldest first)
    return [0.25, 0.5, 0.75].map(fr => { const t = new Float64Array(12); let s = 0; for (let k = 0; k < 12; k++) { const x = k - 5 - fr, w = 0.42 + 0.5 * Math.cos(Math.PI * x / 6.5) + 0.08 * Math.cos(2 * Math.PI * x / 6.5); t[k] = (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; s += t[k]; } for (let k = 0; k < 12; k++) t[k] /= s; return t; });
  }
  set(o) { if (o.ceil) this.ceil = o.ceil; }
  process(in1, in2, out1, out2, n) {
    const W = this.W, c = this.ceil, ph = this.ph, hL = this.hL, hR = this.hR; let grMin = 1;
    for (let i = 0; i < n; i++) {
      const xl = in1[i], xr = in2[i];
      const hi = this.hi = (this.hi + 1) & 15; hL[hi] = xl; hR[hi] = xr;
      const o0 = (hi - 11) & 15;   // the oldest of the 12
      let pk = Math.max(Math.abs(hL[(o0 + 6) & 15]), Math.abs(hR[(o0 + 6) & 15]));
      for (let p = 0; p < 3; p++) {
        const t = ph[p]; let a = 0, b = 0;
        for (let k = 0; k < 12; k++) { const j = (o0 + k) & 15; a += t[k] * hL[j]; b += t[k] * hR[j]; }
        a = a < 0 ? -a : a; b = b < 0 ? -b : b; if (a > pk) pk = a; if (b > pk) pk = b;
      }
      const need = pk > c ? c / pk : 1;
      this.rq[this.ri] = need; this.ri = this.ri + 1 === W ? 0 : this.ri + 1;
      let h = 1; const rq = this.rq; for (let k = 0; k < W; k++) if (rq[k] < h) h = rq[k];
      const hj = this.ri; this.sum += h - this.hq[hj]; this.hq[hj] = h;
      let s = this.sum / W; if (s > 1) s = 1;
      if (s < this.g) this.g = s; else this.g += (s - this.g) * this.rel;
      if (this.g < grMin) grMin = this.g;
      this.bL[this.bi] = xl; this.bR[this.bi] = xr; this.bi = this.bi === this.dly ? 0 : this.bi + 1;
      out1[i] = this.bL[this.bi] * this.g; out2[i] = this.bR[this.bi] * this.g;
    }
    this.gr = grMin;
  }
}
const NB_AW_CL = { Density: AWDensity, DeRez2: AWDeRez2, Pressure4: AWPressure4, Galactic: AWGalactic, ToTape6: AWToTape6, TruePeak: NBTruePeak };
class NBAwProc extends AudioWorkletProcessor {
  constructor(o) {
    super(); const po = (o && o.processorOptions) || {};
    this.fx = new NB_AW_CL[po.kind](sampleRate); if (po.p) this.fx.set(po.p);
    this.by = !!po.by; this.post = po.post == null ? 1 : po.post; this.fade = 0; this.FADE = 480; this.alive = true; this.n = 0; this.grm = 1;
    this.alloc(128);
    this.port.onmessage = e => { const d = e.data || {}; if (d.p) this.fx.set(d.p); if (d.post != null) this.post = d.post; if (d.by != null && !!d.by !== this.by) { this.by = !!d.by; this.fade = this.FADE; } if (d.end) this.alive = false; };
  }
  alloc(n) { this.z = new Float32Array(n); this.wL = new Float64Array(n); this.wR = new Float64Array(n); }
  process(ins, outs) {
    const o = outs[0]; if (!o || !o.length) return this.alive;
    const n = o[0].length; if (n > this.z.length) this.alloc(n);
    const i = ins[0], L = i && i.length ? i[0] : this.z, R = i && i.length > 1 ? i[1] : L, oL = o[0], oR = o[1];
    if (this.by && !this.fade) { oL.set(L); if (oR) oR.set(R); return this.alive; }
    const wL = this.wL, wR = this.wR, post = this.post;
    this.fx.process(L, R, wL, wR, n);
    if (!this.fade) { for (let k = 0; k < n; k++) { oL[k] = wL[k] * post; if (oR) oR[k] = wR[k] * post; } }
    else for (let k = 0; k < n; k++) {
      const f = this.fade > 0 ? this.fade-- / this.FADE : 0, a = this.by ? f : 1 - f;   // a: how much of the effect
      oL[k] = wL[k] * post * a + L[k] * (1 - a); if (oR) oR[k] = wR[k] * post * a + R[k] * (1 - a);
    }
    if (this.fx.gr != null) { if (this.fx.gr < this.grm) this.grm = this.fx.gr; this.n += n; if (this.n >= 2400) { this.port.postMessage({ gr: this.grm }); this.n = 0; this.grm = 1; } }
    return this.alive;
  }
}
registerProcessor("nb-aw", NBAwProc);
`;
  // ---------- main thread ----------
  const AW = (window.__aw = { ok: false, loading: null, ctx: null, nodes: 0, master: { gr: 1, lim: 1 }, src: () => NB_AW_SRC });
  AW.fxSet = o => { Object.assign(state.fx, o); applyFx(); for (const id in fxChan) fxcApply(id); };   // (for tests)
  AW.chan = id => fxcGet(id);
  AW.openMixer = () => openMixer();
  AW.hallMap = P => ({ A: awLerp2(AW_HALL_A, P.hdecay, P.hsize), db: awLerp2(AW_HALL_DB, P.hdecay, P.hsize) });
  AW.oldHall = P => hallIR(ctx.sampleRate, Object.assign({}, bfx, P || {}));
  AW.labSet = o => { Object.assign(bfx, o); applyBfx(true); };
  AW.dbg = () => ({ lab: !!(B && B.__aw), master: !!(fx && fx.comp && fx.comp.__aw), mc: awMcOn(), chans: Object.keys(fxChan).map(id => [id, !!fxChan[id].tape, fxChan[id].tape ? JSON.stringify(fxChan[id].tape.__l) : '']), gr: AW.master });
  const awLinux = !!(window.NB_NATIVE && NB_NATIVE.platform === "linux");
  const AW_MC_KEY = "nightbloom-mastercomp";
  const awMcOn = () => { try { return localStorage.getItem(AW_MC_KEY) !== "off"; } catch (e) { return true; } };
  function awLoad() {
    if (!awLinux || !ctx || !ctx.audioWorklet) return Promise.resolve(false);
    if (AW.loading && AW.ctx === ctx) return AW.loading;
    AW.ctx = ctx; AW.ok = false;
    return (AW.loading = (async () => {
      for (const url of [() => URL.createObjectURL(new Blob([NB_AW_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(NB_AW_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); AW.ok = true; break; } catch (e) {}
      }
      if (AW.ok) awAll();
      return AW.ok;
    })());
  }
  function awNode(kind, p, opt) {
    opt = opt || {};
    const n = new AudioWorkletNode(ctx, "nb-aw", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", processorOptions: { kind, p, by: !!opt.by, post: opt.post } });
    n.nbAw = kind; n.__l = { by: JSON.stringify(!!opt.by) }; AW.nodes++;
    // only what changed goes to the audio thread
    n.send = m => { const d = {}; let any = false; for (const k in m) { const v = JSON.stringify(m[k]); if (n.__l[k] !== v) { n.__l[k] = v; d[k] = m[k]; any = true; } } if (any) try { n.port.postMessage(d); } catch (e) {} };
    return n;
  }
  const awReady = () => awLinux && AW.ok && AW.ctx === ctx;

  // 1. FX Lab: Density -> Airwindows Density, Lo-fi -> DeRez2, Hall+ -> Galactic (same knobs, same switches)
  const AW_HALL_BUF = { duration: 0, airwindows: "Galactic" };
  const hallKey = () => [bfx.hdecay, bfx.hsize, bfx.hdamp, bfx.hwidth].map(x => (+x).toFixed(3)).join();
  function awLab() {
    if (!awReady() || !B || B.__aw || !B.lofiIn || !B.hallIn) return;
    const dens = awNode("Density", { A: 0.2, B: 0, C: 1, D: 1 }), lofi = awNode("DeRez2", { A: 1, B: 1, C: 0.5, D: 1 }), hall = awNode("Galactic", { A: 0.5, B: 0.5, C: 0.5, D: 1, E: 1 });
    try { B.densShaper.disconnect(); } catch (e) {} try { B.densIn.disconnect(B.densShaper); } catch (e) {}
    B.densIn.connect(dens); dens.connect(B.densWet);
    try { B.lofiIn.disconnect(B.bitShaper); } catch (e) {} try { B.bitShaper.disconnect(); } catch (e) {}
    B.lofiIn.connect(lofi); lofi.connect(B.lofiTone);
    try { B.hallIn.disconnect(B.hall); } catch (e) {} try { B.hall.disconnect(); } catch (e) {}
    B.hallIn.connect(hall); hall.connect(B.hallWet);
    // (090 still sets these on whatever B holds: harmless on the new nodes, and the hall's impulse is never built)
    Object.defineProperty(hall, "buffer", { get: () => AW_HALL_BUF, set: () => {} });
    Object.defineProperty(hall, "__k", { get: hallKey, set: () => {} });
    const old = B;
    // a new B object: the resource diet (220) sees a rebuilt chain, so it starts from "all plugged in", which they are
    B = Object.assign({}, old, { densShaper: dens, bitShaper: lofi, hall, __aw: true, __old: { densShaper: old.densShaper, bitShaper: old.bitShaper, hall: old.hall } });
    fx.chainNodes && fx.chainNodes.push(dens, lofi, hall);
    applyBfx(false);
  }
  function awLabParams() {
    if (!B || !B.__aw) return;
    const c = (v, d) => (v == null ? d : +v);
    const dA = 0.2 + c(bfx.dens, 0.35) * 0.44;
    B.densShaper.send({ p: { A: dA, B: 0, C: 1, D: 1 }, post: 1 / awDensGain(dA) });   // (quiet parts come out at the level they went in; loud parts saturate)
    B.bitShaper.send({ p: { A: 0.45 + c(bfx.tone, 0.6) * 0.55, B: 0.35 + c(bfx.bits, 0.35) * 0.6, C: 1, D: 1 } });   // (C 1: plain steps, the plugin's default; its in-between settings change the level)
    // an off stage idles (passes its input through, unheard) once its sound has gone: 0.3 s, the hall's tail 8 s
    const on = state.fx.on !== false;
    awIdle(B.densShaper, on && bfx.densOn && c(bfx.dens, 0.35) > 0.01, 0.3);
    awIdle(B.bitShaper, on && bfx.lofiOn, 0.3);
    awIdle(B.hall, on && bfx.hallOn, 8);
    const hd = c(bfx.hdecay, 0.55), hs = c(bfx.hsize, 0.5);
    B.hall.send({ p: { A: awLerp2(AW_HALL_A, hd, hs), B: 1 - c(bfx.hdamp, 0.45) * 0.75, C: 0.15 + c(bfx.hwidth, 0.8) * 0.5, D: 0.25 + hs * 0.75, E: 1 }, post: Math.pow(10, awLerp2(AW_HALL_DB, hd, hs) / 20) });
  }
  function awIdle(n, on, tail) {
    clearTimeout(n.__idleT);
    if (on) { n.send({ by: false }); n.__idle = false; }
    else if (!n.__idle) n.__idleT = setTimeout(() => { n.send({ by: true }); n.__idle = true; }, tail * 1000);
  }
  // Density's gain on quiet signals: each full sine stage is a slope of pi/2, the last one is blended in
  function awDensGain(A) {
    const d = A * 5 - 1, d2 = d * Math.abs(d); let out = Math.abs(d), n = 0, k = d2;
    while (k > 1) { n++; k -= 1; } while (out > 1) out -= 1;
    return Math.pow(Math.PI / 2, n) * (d2 > 0 ? (1 - out) + out * Math.PI / 2 : 1);
  }
  // Galactic's Replace for each Decay and Size, found so its tail falls 30 dB in the time the old hall's did (1 s at Decay
  // 0.1, 2.7 s at 0.5, 6.5 s at 0.9; at the biggest sizes it can't get shorter than 2.3 s), and the gain that makes its
  // first second as loud as the old hall's. Rows: Size 0.1, 0.5, 0.9; columns: Decay 0.1, 0.3, 0.5, 0.7, 0.9.
  const AW_HALL_A = [[0.998, 0.562, 0.343, 0.217, 0.137], [0.998, 0.929, 0.619, 0.393, 0.225], [0.998, 0.998, 0.906, 0.585, 0.34]];
  const AW_HALL_DB = [[-5.5, 1.8, 7.5, 11.8, 15.7], [-8.4, -3.4, 2.4, 7.1, 12.1], [-5.5, -0.8, 3.1, 7.5, 12.3]];
  function awLerp2(T, hd, hs) {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const x = cl((hd - 0.1) / 0.2, 0, 4), y = cl((hs - 0.1) / 0.4, 0, 2), i = Math.min(3, Math.floor(x)), j = Math.min(1, Math.floor(y)), fx_ = x - i, fy = y - j;
    const r0 = T[j][i] * (1 - fx_) + T[j][i + 1] * fx_, r1 = T[j + 1][i] * (1 - fx_) + T[j + 1][i + 1] * fx_;
    return r0 * (1 - fy) + r1 * fy;
  }

  // 2. the Effects Drive on each sound -> Airwindows ToTape6; at 0 it's a true bypass (no curve, no gain)
  function awChan(c) {
    if (!c || c.tape || !awReady()) return;
    const t = awNode("ToTape6", { A: 0.5, B: 0.5, C: 0.5, D: 0, E: 0.5, F: 1 }, { by: true });
    try { c.driveIn.disconnect(); } catch (e) {} try { c.shaper.disconnect(); } catch (e) {}
    c.driveIn.connect(t).connect(c.wobbleDelay);
    c.tape = t; c.nodes.push(t);
  }
  function awChanParams(c, drive) {
    if (!c || !c.tape) return;
    const d = Math.max(0, Math.min(1, drive || 0)), t = ctx.currentTime;
    c.driveIn.gain.cancelScheduledValues(t); c.driveIn.gain.setTargetAtTime(1, t, 0.02);
    if (d < 0.005) { c.tape.send({ by: true }); return; }
    const post = Math.pow(10, (-5 - 11.1 * d + 3 * d * d) / 20);   // level-neutral for a sound peaking at 0.3; louder peaks round off
    c.tape.send({ by: false, p: { A: 0.5 + 0.42 * d, B: 0.5, C: 0.5, D: 0, E: 0.5, F: 1 }, post });
  }

  // 3. the master: Airwindows Pressure4 as the master compressor (can be switched off), and a true-peak lookahead
  //    limiter at -1.5 dBTP in place of the browser's limiter. The browser's compressor and limiter stay as flat
  //    junctions, since everything connects to them.
  const AW_P4 = { A: 0.2, B: 0.2, C: 1, D: 1 };   // (A 0.2: as loud as the old compressor, within a dB, from -6 to +6 dB of input)
  function awMaster() {
    if (!awReady() || !fx || !fx.comp || !fx.limiter || fx.comp.__aw) return;
    const comp = fx.comp, lim = fx.limiter, cn = fx.chainNodes || [], li = cn.indexOf(lim), trim = li >= 0 ? cn[li + 1] : null, safe = fx.safe;
    if (!trim || !safe) return;
    const snap = n => ({ threshold: { value: n.threshold.value }, knee: { value: n.knee.value }, ratio: { value: n.ratio.value }, attack: { value: n.attack.value }, release: { value: n.release.value } });
    fx.__awComp0 = snap(comp); fx.__awLim0 = snap(lim);   // (the offline pad renders keep using these: 330)
    const p4 = awNode("Pressure4", AW_P4, { by: !awMcOn() }), tp = awNode("TruePeak", { ceil: 0.84 });
    const flat = n => { n.threshold.value = 0; n.knee.value = 0; n.ratio.value = 1; };
    flat(comp); flat(lim); trim.__g0 = trim.gain.value; trim.gain.value = 1;
    const cc = comp.connect.bind(comp), cd = comp.disconnect.bind(comp);
    try { cd(); } catch (e) {}
    cc(p4);
    comp.connect = function () { return p4.connect.apply(p4, arguments); };
    comp.disconnect = function () { return p4.disconnect.apply(p4, arguments); };
    const nbw = window.__nbw && window.__nbw.NBW;
    if (nbw && nbw.fxIn && nbw.fxComp === comp && nbw.fxIn.context === ctx) p4.connect(nbw.fxIn); else p4.connect(lim);
    try { trim.disconnect(); } catch (e) {}
    trim.connect(tp).connect(safe);
    comp.__aw = true; fx.awP4 = p4; fx.awTP = tp; cn.push(p4, tp);
    p4.port.onmessage = e => { if (e.data && e.data.gr != null) AW.master.gr = e.data.gr; };
    tp.port.onmessage = e => { if (e.data && e.data.gr != null) AW.master.lim = e.data.gr; };
    try { Object.defineProperty(lim, "reduction", { get: () => 20 * Math.log10(Math.max(1e-4, AW.master.lim)) }); } catch (e) {}
    awMcPaint();
  }
  function awMcSet(on) {
    try { localStorage.setItem(AW_MC_KEY, on ? "on" : "off"); } catch (e) {}
    if (fx && fx.awP4) fx.awP4.send({ by: !on });
    awMcPaint();
  }
  function awMcPaint() {
    const b = document.getElementById("awMcBtn"), s = document.getElementById("awMcInfo"); if (!b) return;
    const on = awMcOn(); b.textContent = on ? "On" : "Off"; b.setAttribute("aria-pressed", on ? "true" : "false");
    if (s) s.textContent = !awReady() ? "starts with the sound" : on ? "Airwindows Pressure4, then a true-peak limiter at −1.5 dBTP" : "off: only the true-peak limiter at −1.5 dBTP";
  }

  function awAll() {
    if (!awReady()) return;
    try { awLab(); awLabParams(); } catch (e) {}
    try { for (const id in fxChan) { awChan(fxChan[id]); fxcApply(id); } } catch (e) {}
    try { awMaster(); } catch (e) {}
  }

  if (awLinux) {
    { const bc = buildChain; buildChain = function () { const r = bc.apply(this, arguments); if (awReady()) awAll(); else awLoad(); return r; }; }
    { const ab = applyBfx; applyBfx = function () { const r = ab.apply(this, arguments); try { awLabParams(); } catch (e) {} return r; }; }
    { const fb = fxcBuild; fxcBuild = function () { const c = fb.apply(this, arguments); try { awChan(c); } catch (e) {} return c; }; }
    { const fa = fxcApply; fxcApply = function (id) {
        const r = fa.apply(this, arguments); const c = fxChan[id];
        if (c && c.tape) { const a = fxcAmt(id); try { awChanParams(c, (state.fx.drive || 0) * a); } catch (e) {} }
        return r;
      }; }
    setInterval(() => { if (ctx && ctx.state === "running" && !awReady()) awLoad(); }, 500);
    // the Mixer: a Master compressor switch under Master volume
    { const rm = renderMixer; renderMixer = function () {
        const r = rm.apply(this, arguments);
        try {
          const first = mxList.querySelector(".mx-row");
          if (first && !document.getElementById("awMcRow")) {
            const row = document.createElement("div"); row.className = "mx-row"; row.id = "awMcRow";
            row.innerHTML = '<div class="mx-lab"><b>Master compressor</b><small id="awMcInfo"></small></div><button class="btn" id="awMcBtn" aria-pressed="true"></button>';
            first.after(row);
            row.querySelector("#awMcBtn").addEventListener("click", () => awMcSet(!awMcOn()));
            awMcPaint();
          }
        } catch (e) {}
        return r;
      }; }
    // (203) four of Nate Bloom's plugins have Linux builds: same names and keys (saved chains load into them), new insides
    try {
      const HQ = {
        "natebloom/ladder": ["natebloom/ladderhq/index.js", "The Moog ladder as Antti Huovilainen modelled it: it drives, squelches and self-oscillates. An LFO, free or in time with the song, and an envelope follower move it."],
        "natebloom/compressor": ["natebloom/compressorhq/index.js", "Glue for the whole mix on Airwindows Pressure4's gain computer, with Console saturation. Lower Mix for parallel (New York) compression."],
        "natebloom/autopan": ["natebloom/autopanhq/index.js", "Tremolo (Pan at 0) or auto-pan (Pan at 100), free or in time with the song; five waves, smooth or choppy."],
        "natebloom/ringmod": ["natebloom/ringmodhq/index.js", "A ring modulator for bells, metallic shimmer and alien drones: four carrier waves and a sweep, free or in time with the song."],
      };
      const cat = window.__nbw && window.__nbw.CAT;
      if (cat) cat.forEach(e => { const h = HQ[e.key]; if (h) { e.url = h[0]; e.desc = h[1]; e.hq = true; } });
    } catch (e) {}
    // FX Lab labels say what's running now
    try {
      BFX_ROWS.forEach(r => { if (r[0] === "densOn") r[2] = "Airwindows Density: sine saturation, mixed in"; if (r[0] === "lofiOn") r[2] = "Airwindows DeRez2: Bits crushes, Tone lowers the sample rate"; if (r[0] === "hallOn") r[2] = "Airwindows Galactic: a huge, smooth hall"; });
    } catch (e) {}
  }
