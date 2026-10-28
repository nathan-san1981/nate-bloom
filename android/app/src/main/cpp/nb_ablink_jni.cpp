// Ableton Link for the Android app: window.NBAbleton (AbletonLink.kt) over native/ablink/nb_ablink.h.
// Its own file so Link's timing maths isn't built with the fast pads' -ffast-math.
#include <jni.h>
#include "nb_ablink.h"
static nbabl::Session gAbl;
extern "C" JNIEXPORT jboolean JNICALL Java_com_natebloom_app_AbletonLink_nAvailable(JNIEnv*, jobject) { return JNI_TRUE; }
extern "C" JNIEXPORT jboolean JNICALL Java_com_natebloom_app_AbletonLink_nEnable(JNIEnv*, jobject, jboolean on, jdouble bpm) { return gAbl.enable(on == JNI_TRUE, bpm) ? JNI_TRUE : JNI_FALSE; }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_AbletonLink_nSync(JNIEnv*, jobject, jboolean on) { gAbl.setSync(on == JNI_TRUE); }
extern "C" JNIEXPORT jstring JNICALL Java_com_natebloom_app_AbletonLink_nState(JNIEnv* env, jobject, jdouble q) { return env->NewStringUTF(gAbl.state(q).c_str()); }
extern "C" JNIEXPORT jdouble JNICALL Java_com_natebloom_app_AbletonLink_nNow(JNIEnv*, jobject) { return gAbl.now(); }
extern "C" JNIEXPORT jdouble JNICALL Java_com_natebloom_app_AbletonLink_nTimeAtBeat(JNIEnv*, jobject, jdouble b, jdouble q) { return gAbl.timeAtBeat(b, q); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_AbletonLink_nTempo(JNIEnv*, jobject, jdouble bpm) { gAbl.setTempo(bpm); }
extern "C" JNIEXPORT jdouble JNICALL Java_com_natebloom_app_AbletonLink_nStart(JNIEnv*, jobject, jdouble at, jdouble q) { return gAbl.start(at, q); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_AbletonLink_nStop(JNIEnv*, jobject, jdouble at) { gAbl.stop(at); }
