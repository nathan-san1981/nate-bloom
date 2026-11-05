#include "dsp.h"

namespace t77 {

static inline float dbToGain(float db) { return std::pow(10.0f, db / 20.0f); }

void Engine::init(double sampleRate) {
    sr = sampleRate;
    os = sr < 80000.0 ? 2 : 1;
    rate2 = (float)(sr * os);
    dec.design(63);
    chorus.init((float)sr);
    // Each voice card gets its own fixed component spread — the same card always
    // behaves the same way, like real hardware. "Age" scales how far apart they sit.
    for (int i = 0; i < kVoices; ++i) {
        Rng r(0xC580u + (uint32_t)i * 7919u);
        Voice &v = voices[i];
        v.noise = Rng(0xA5A5u + (uint32_t)i * 104729u);
        for (int c = 0; c < 2; ++c) {
            Channel &C = v.ch[c];
            C.tolCents = r.bip();
            C.tolScale = r.bip();
            C.tolCut = r.bip();
            C.tolEnv = r.bip();
            C.tolPwm = r.bip();
            C.vco.phase = r.uni();
            C.vco.pwmPhase = r.uni();
            C.vco.drift = r.bip() * 0.3f;
        }
    }
    reset();
}

void Engine::reset() {
    for (auto &v : voices) {
        v.active = false;
        v.gate = false;
        for (auto &C : v.ch) {
            C.hpf.reset();
            C.lpf.reset();
            C.lp1 = 0;
            C.lp2 = 0;
            C.aeg = AdsrEnv{};
            C.feg = FilterEnv{};
            C.amp = C.ampTarget = 0;
        }
    }
    dec.reset();
    chorus.reset();
    ctlCount = 0;
}

Voice *Engine::allocate() {
    // Cyclic assignment: successive notes land on successive voice cards, so each
    // note picks up a different card's tuning and component spread.
    for (int n = 0; n < kVoices; ++n) {
        Voice &v = voices[(nextVoice + n) % kVoices];
        if (!v.active) { nextVoice = (int)(&v - voices + 1) % kVoices; return &v; }
    }
    Voice *best = nullptr;
    for (auto &v : voices)
        if (!v.gate && (!best || v.stamp < best->stamp)) best = &v;
    if (best) return best;
    for (auto &v : voices)
        if (!best || v.stamp < best->stamp) best = &v;
    return best;
}

void Engine::noteOn(int key, int midiCh, int32_t noteId, float velocity) {
    Voice *v = allocate();
    bool fresh = !v->active;
    v->active = true;
    v->gate = true;
    v->sustained = false;
    v->key = key;
    v->midiCh = midiCh;
    v->noteId = noteId;
    v->stamp = ++stampCounter;
    v->vel = std::clamp(velocity, 0.0f, 1.0f);
    v->pressure = 0;
    v->pressureSm = 0;
    v->tuning = 0;
    v->pitchTarget = (float)key;
    v->pitch = (glideActive && haveLastNote) ? lastPitch : (float)key;
    lastPitch = (float)key;
    haveLastNote = true;
    v->bendEnv = 1.0f;
    v->subFadeT = 0;
    v->ringAttack = true;
    if (fresh) v->ringEnv = 0;
    for (auto &C : v->ch) {
        if (fresh) {
            C.aeg.v = 0;
            C.feg.stage = FilterEnv::Idle;
        }
    }
    if (curP) voiceControl(*v, curP, true);
    for (auto &C : v->ch) {
        C.feg.gateOn(fresh || C.feg.stage == FilterEnv::Idle);
        C.aeg.gateOn();
    }
}

void Engine::noteOff(int key, int midiCh, int32_t noteId) {
    for (auto &v : voices) {
        if (!v.active || !v.gate) continue;
        bool match = noteId >= 0 && v.noteId >= 0 ? v.noteId == noteId
                                                   : (v.key == key && (midiCh < 0 || v.midiCh == midiCh));
        if (!match) continue;
        if (pedal) {
            v.sustained = true;
        } else {
            v.gate = false;
            for (auto &C : v.ch) { C.aeg.gateOff(); C.feg.gateOff(); }
        }
    }
}

void Engine::sustainPedal(bool down) {
    pedal = down;
    if (down) return;
    for (auto &v : voices) {
        if (v.active && v.gate && v.sustained) {
            v.gate = false;
            v.sustained = false;
            for (auto &C : v.ch) { C.aeg.gateOff(); C.feg.gateOff(); }
        }
    }
}

void Engine::chokeAll() {
    for (auto &v : voices) {
        v.active = false;
        v.gate = false;
        for (auto &C : v.ch) { C.aeg = AdsrEnv{}; C.feg = FilterEnv{}; }
    }
}

void Engine::polyPressure(int key, int32_t noteId, float p) {
    for (auto &v : voices) {
        if (!v.active || !v.gate) continue;
        if ((noteId >= 0 && v.noteId == noteId) || (noteId < 0 && v.key == key)) v.pressure = p;
    }
}

void Engine::noteTuning(int key, int32_t noteId, float semis) {
    for (auto &v : voices) {
        if (!v.active) continue;
        if ((noteId >= 0 && v.noteId == noteId) || (noteId < 0 && v.key == key)) v.tuning = semis;
    }
}

// ---------------------------------------------------------------- control
void Engine::globalControl(const float *p) {
    const float ctlRate = (float)sr / kCtl;

    // Sub oscillator — one shared LFO, as on the original.
    float subHz = mapLfo(p[G_SUB_SPEED]);
    subPhase += subHz / ctlRate;
    bool wrapped = false;
    if (subPhase >= 1.0f) { subPhase -= std::floor(subPhase); wrapped = true; }
    int fn = (int)std::lround(p[G_SUB_FN]);
    switch (fn) {
    case 0: subValue = std::sin(kTwoPi * subPhase); break;
    case 1: subValue = subPhase < 0.5f ? 1.0f : -1.0f; break;
    case 2: subValue = 2.0f * subPhase - 1.0f; break;
    case 3: subValue = 1.0f - 2.0f * subPhase; break;
    case 4:
        if (wrapped) subHold = rng.bip();
        subValue = subHold;
        break;
    default: {
        float k = std::min(1.0f, subHz * 6.0f / ctlRate);
        subNoise += (rng.bip() - subNoise) * k;
        subValue = std::clamp(subNoise * 2.5f, -1.0f, 1.0f);
        break;
    }
    }

    ribbonSm += (p[G_RIBBON] - ribbonSm) * 0.25f;
    bendSemis = (ribbonSm + midiBend) * std::round(p[G_RIBBON_RANGE]);

    float glideT = mapGlide(p[G_GLIDE]);
    glideActive = glideT > 0.002f;
    kGlide = glideActive ? rcCoef(glideT / 3.0f, ctlRate) : 1.0f;
    gliss = p[G_GLIDE_MODE] > 0.5f;
    kBend = rcCoef(mapTime(p[G_BEND_TIME]) / 3.0f, ctlRate);

    chorusOn = p[G_CHORUS_ON] > 0.5f;
    chorusHz = mapChorus(p[G_CHORUS_SPEED]);
    chorusDepth = p[G_CHORUS_DEPTH];
    float vol = p[G_VOLUME];
    gainTarget = vol * vol * 1.6f;
}

void Engine::voiceControl(Voice &v, const float *p, bool snap) {
    const float ctlRate = (float)sr / kCtl;
    const float age = p[G_AGE];
    const float steps = (float)(kCtl * os);

    float target = std::max(v.pressure, chanPressure);
    v.pressureSm += (target - v.pressureSm) * (snap ? 1.0f : 0.15f);
    const float pr = v.pressureSm;

    v.pitch += (v.pitchTarget - v.pitch) * kGlide;
    float key = gliss ? std::round(v.pitch) : v.pitch;
    if (!snap) v.bendEnv *= (1.0f - kBend);
    float initBend = -mapBend(p[G_BEND_DEPTH]) * v.bendEnv;

    if (!snap) v.subFadeT += 1.0f / ctlRate;
    float fade = std::clamp(v.subFadeT / mapTime(p[G_SUB_FADE]), 0.0f, 1.0f);
    float sub = subValue * fade;
    float subVco = p[G_SUB_VCO];
    float vib = sub * subVco * subVco * 3.0f + subValue * (modWheelVal * 0.6f + p[G_AT_VIB] * pr * 0.9f);
    float atPitch = p[G_AT_PITCH] * pr * 2.0f;
    float common = key + bendSemis + v.tuning + initBend + atPitch + vib;

    float kpos = std::clamp((v.key - 36) / 60.0f, 0.0f, 1.0f);
    float wLo = std::max(0.0f, (0.5f - kpos) * 2.0f), wHi = std::max(0.0f, (kpos - 0.5f) * 2.0f);
    float kcBrilOct = (p[G_KC_BRIL_LO] * wLo + p[G_KC_BRIL_HI] * wHi) * 3.0f;
    float kcGain = dbToGain((p[G_KC_LVL_LO] * wLo + p[G_KC_LVL_HI] * wHi) * 12.0f);
    float trem = 1.0f - p[G_SUB_VCA] * 0.5f * (1.0f - sub);
    float mix = p[G_MIX];

    static const float feetSemis[4] = {-12.0f, 0.0f, 12.0f, 24.0f};

    for (int c = 0; c < 2; ++c) {
        const uint32_t b = c == 0 ? CH1 : CH2;
        Channel &C = v.ch[c];

        // --- VCO pitch: drift is filtered brown noise; tolerance is fixed per card
        float a = 1.0f / (ctlRate * 1.5f);
        C.vco.driftVel = C.vco.driftVel * (1.0f - a) + v.noise.bip() * std::sqrt(1.5f * a);
        C.vco.drift += (C.vco.driftVel - C.vco.drift) * a;
        int feet = std::clamp((int)std::lround(p[b + C_FEET]), 0, 3);
        float detune = c == 1 ? p[G_DETUNE] * 0.5f : 0.0f;
        // Calibrated against multisamples of a real CS-80: per-card tuning offsets
        // have ~8 c standard deviation (Age 0.5), while a held note wanders < 0.5 c.
        float semis = common + feetSemis[feet] + detune +
                      (C.tolCents * kTolCents + C.vco.drift * kDriftCents) * age * 0.01f;
        semis = 60.0f + (semis - 60.0f) * (1.0f + C.tolScale * 0.002f * age); // expo scale error
        float hz = 440.0f * fastExp2((semis - 69.0f) / 12.0f);
        float dtT = std::clamp(hz / rate2, 0.0f, 0.45f);

        // --- PWM: free-running triangle oscillator per voice/channel
        float pwmHz = mapLfo(p[b + C_PWM_SPEED]) * (1.0f + C.tolPwm * 0.06f * age);
        C.vco.pwmPhase += pwmHz / ctlRate;
        C.vco.pwmPhase -= std::floor(C.vco.pwmPhase);
        float tri = 4.0f * std::fabs(C.vco.pwmPhase - 0.5f) - 1.0f;
        float pw = p[b + C_PW] + p[b + C_PWM] * 0.5f * (tri + 1.0f);
        float dutyT = std::clamp(0.5f - 0.46f * pw, 0.04f, 0.96f);

        C.sawOn = p[b + C_SAW] > 0.5f ? 1.0f : 0.0f;
        C.sqOn = p[b + C_SQUARE] > 0.5f ? 1.0f : 0.0f;
        C.noise = p[b + C_NOISE];
        C.sine = p[b + C_SINE];

        // --- VCF
        // key tracking: measured spectral-centroid tracking on the real instrument has a
        // median of 0.83 oct/oct across patches (keyboard-control levers adjust it per patch)
        float oct = p[G_BRILLIANCE] * 3.0f + kcBrilOct + (v.key - 60) / 12.0f * kKeyTrack + C.tolCut * 0.12f * age;
        float touchOct = p[b + C_TI_BRIL] * v.vel * 2.5f + p[b + C_TA_BRIL] * pr * 3.0f + sub * p[G_SUB_VCF] * 2.5f;
        float lpOctT = std::log2(mapCut(p[b + C_LPF])) + oct + touchOct;
        float gHT = cutoffToG(mapCut(p[b + C_HPF]) * fastExp2(oct), rate2);
        float resL = std::clamp(p[b + C_LPF_RES] + p[G_RESONANCE] * 0.5f, 0.0f, 1.0f);
        C.RL = resToDamping(resL);
        C.extraK = kExtraPoleLo - (kExtraPoleLo - kExtraPoleHi) * resL;
        C.RH = resToDamping(p[b + C_HPF_RES] + p[G_RESONANCE] * 0.5f);

        // --- envelopes (coefficients at the internal rate)
        float es = 1.0f + C.tolEnv * 0.08f * age;
        C.feg.il = p[b + C_IL];
        C.feg.al = p[b + C_AL];
        C.feg.ka = rcCoef(mapTime(p[b + C_FA]) * es / 1.609f, rate2);
        C.feg.kd = rcCoef(mapTime(p[b + C_FD]) * es / 3.0f, rate2);
        C.feg.kr = rcCoef(mapTime(p[b + C_FR]) * es / 3.0f, rate2);
        C.aeg.ka = rcCoef(mapTime(p[b + C_VA]) * es / 1.609f, rate2);
        C.aeg.kd = rcCoef(mapTime(p[b + C_VD]) * es / 3.0f, rate2);
        C.aeg.kr = rcCoef(mapTime(p[b + C_VR]) * es / 3.0f, rate2);
        C.aeg.sus = p[b + C_VS];

        // --- VCA gain
        float lvl = p[b + C_LEVEL];
        float ti = p[b + C_TI_LEVEL];
        float touchLvl = (1.0f - ti) + ti * v.vel;
        float afterLvl = 1.0f + p[b + C_TA_LEVEL] * pr * 0.8f;
        float mixG = c == 0 ? std::cos(mix * kPi * 0.5f) : std::sin(mix * kPi * 0.5f);
        float ampT = lvl * lvl * touchLvl * afterLvl * kcGain * trem * mixG * 1.2f;

        if (snap) {
            C.dt = dtT; C.duty = dutyT; C.lpfBaseOct = lpOctT; C.gH = gHT; C.amp = ampT;
            C.dtInc = C.dutyInc = C.octInc = C.gHInc = C.ampInc = 0;
        } else {
            C.dtInc = (dtT - C.dt) / steps;
            C.dutyInc = (dutyT - C.duty) / steps;
            C.octInc = (lpOctT - C.lpfBaseOct) / steps;
            C.gHInc = (gHT - C.gH) / steps;
            C.ampInc = (ampT - C.amp) / steps;
        }
    }

    // --- ring modulator with its own AD sweep envelope
    float ka = rcCoef(mapTime(p[G_RING_ATK]) / 1.609f, ctlRate);
    float kd = rcCoef(mapTime(p[G_RING_DEC]) / 3.0f, ctlRate);
    if (!snap) {
        if (v.ringAttack) {
            v.ringEnv += (1.25f - v.ringEnv) * ka;
            if (v.ringEnv >= 1.0f) { v.ringEnv = 1.0f; v.ringAttack = false; }
        } else {
            v.ringEnv += (0.0f - v.ringEnv) * kd;
        }
    }
    float ringHz = mapRing(p[G_RING_SPEED]) * fastExp2(p[G_RING_MOD] * v.ringEnv * 4.0f);
    v.ringInc = std::min(ringHz / rate2, 0.45f);
    v.ringDepth = p[G_RING_DEPTH];
}

// ----------------------------------------------------------------- audio
inline float Engine::renderVoice(Voice &v) {
    float out = 0.0f;
    for (int c = 0; c < 2; ++c) {
        Channel &C = v.ch[c];
        C.dt += C.dtInc;
        C.duty += C.dutyInc;
        C.lpfBaseOct += C.octInc;
        C.gH += C.gHInc;
        C.amp += C.ampInc;

        const float dt = C.dt, ph = C.vco.phase, duty = C.duty;
        const float sinPh = std::sin(kTwoPi * ph);
        float x = 0.0f;
        if (C.sawOn > 0) x += 2.0f * ph - 1.0f - polyBlep(ph, dt) - kSawBody * sinPh;
        if (C.sqOn > 0) {
            float sq = ph < duty ? 1.0f : -1.0f;
            sq += polyBlep(ph, dt);
            float t2 = ph - duty;
            if (t2 < 0) t2 += 1.0f;
            sq -= polyBlep(t2, dt);
            x += sq * 0.9f;
        }
        if (C.noise > 0) x += v.noise.bip() * C.noise * 1.2f;
        float sine = C.sine > 0 ? sinPh * C.sine : 0.0f;
        float nph = ph + dt;
        C.vco.phase = nph >= 1.0f ? nph - 1.0f : nph;

        x *= 0.6f;
        float hp, lp, dummy;
        C.hpf.tick(x, C.gH, C.RH, hp, dummy);
        float fe = C.feg.tick();
        float g = cutoffToG(fastExp2(C.lpfBaseOct + fe * 5.0f), rate2);
        C.lpf.tick(hp, g, C.RL, dummy, lp);
        // Measured skirts are 12 dB/oct at low resonance and 16-20 dB/oct at high
        // resonance: one more pole that moves toward the cutoff as resonance rises.
        float g1 = std::min(g * C.extraK, 4.0f);
        float v1 = (lp - C.lp1) * g1 / (1.0f + g1);
        lp = v1 + C.lp1;
        C.lp1 = lp + v1;
        if (kExtraPoles > 1) {
            float v2 = (lp - C.lp2) * g1 / (1.0f + g1);
            lp = v2 + C.lp2;
            C.lp2 = lp + v2;
        }

        float a = C.aeg.tick();
        float y = (lp + sine * 0.8f) * a * C.amp;
        // output coupling capacitor (~8 Hz)
        float hpOut = y - C.dcIn + 0.9995f * C.dcOut;
        C.dcIn = y;
        C.dcOut = hpOut;
        out += hpOut;
    }
    if (v.ringDepth > 0.0f) {
        v.ringPhase += v.ringInc;
        if (v.ringPhase >= 1.0f) v.ringPhase -= 1.0f;
        float rm = std::sin(kTwoPi * v.ringPhase);
        out = out * (1.0f - v.ringDepth) + out * rm * v.ringDepth;
    }
    // voice card output amplifier
    // voice card output amplifier: enough headroom that resonant peaks stay clean
    // (measured skirts on the real instrument show no saturation smear at Q 3-4)
    return fastTanh(out * kVoiceDrive) * (1.0f / kVoiceDrive);
}

void Engine::process(const float *p, float *outL, float *outR, uint32_t frames) {
    curP = p;
    for (uint32_t i = 0; i < frames; ++i) {
        if (ctlCount == 0) {
            globalControl(p);
            for (auto &v : voices)
                if (v.active) voiceControl(v, p, false);
            ctlCount = kCtl;
        }
        --ctlCount;

        float mono;
        if (os == 2) {
            float s0 = 0, s1 = 0;
            for (auto &v : voices)
                if (v.active) s0 += renderVoice(v);
            for (auto &v : voices)
                if (v.active) s1 += renderVoice(v);
            mono = dec.process(s0, s1);
        } else {
            mono = 0;
            for (auto &v : voices)
                if (v.active) mono += renderVoice(v);
        }
        for (auto &v : voices) {
            if (v.active && v.ch[0].aeg.stage == AdsrEnv::Idle && v.ch[1].aeg.stage == AdsrEnv::Idle) {
                v.active = false;
                v.gate = false;
            }
        }
        mono *= 0.32f;

        float L, R;
        chorus.process(mono, chorusHz, chorusDepth, chorusOn, L, R);
        gainSm += (gainTarget - gainSm) * 0.002f;
        // output stage: gentle transformer-style saturation
        outL[i] = fastTanh(L * gainSm * 0.9f) * 1.1111f;
        outR[i] = fastTanh(R * gainSm * 0.9f) * 1.1111f;
    }
}

} // namespace t77
