// (Nate Bloom) no MTS-ESP in the browser
#pragma once
struct MTSClient;
static inline bool MTS_HasMaster(MTSClient *) { return false; }
static inline double MTS_NoteToFrequency(MTSClient *, int, int) { return 0; }
