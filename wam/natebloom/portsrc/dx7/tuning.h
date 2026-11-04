// (Nate Bloom) standard 12-TET only: Dexed's tuning.h without the Scala tuning library
#ifndef __SYNTH_TUNING_H
#define __SYNTH_TUNING_H
#include "synth.h"
class TuningState {
public:
  int32_t midinote_to_logfreq(int midinote) { return 50857777 + ((1 << 24) / 12) * midinote; }
  bool is_standard_tuning() { return true; }
};
#endif
