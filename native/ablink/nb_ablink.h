// Ableton Link in the apps (Android: nb_fastpads.cpp, Linux: nb_fastpads_linux.cc). Nate Bloom joins the Link
// session on the network, with Bitwig, Live and the other Link apps: one tempo, one beat grid, and, with Start/Stop
// Sync, Play and Stop together. The page drives it through window.NBAbleton (see index.html, "Ableton Link").
//
// Link itself (github.com/Ableton/link, GPL-2.0-or-later) is fetched by CI into native/ablink/link; see NOTICE.md.
#pragma once
#include <ableton/Link.hpp>
#include <chrono>
#include <cstdio>
#include <memory>
#include <mutex>
#include <string>

namespace nbabl {

class Session {
public:
    // turn Link on or off; the session (and its tempo) is made the first time it's turned on
    bool enable(bool on, double bpm) {
        std::lock_guard<std::mutex> l(m_);
        if (on && !link_) { link_.reset(new ableton::Link(bpm > 0 ? bpm : 120.0)); link_->enableStartStopSync(sync_); }
        if (link_) link_->enable(on);
        return link_ && link_->isEnabled();
    }
    void setSync(bool on) { std::lock_guard<std::mutex> l(m_); sync_ = on; if (link_) link_->enableStartStopSync(on); }

    // the Link clock, in microseconds
    double now() const { std::lock_guard<std::mutex> l(m_); return link_ ? (double) link_->clock().micros().count() : 0.0; }

    // {"on","peers","tempo","now","beat","playing","tPlay","beatAtPlay","sync"}: beat at now, on the quantum's grid
    std::string state(double q) const {
        std::lock_guard<std::mutex> l(m_);
        if (!link_) return "{\"on\":false,\"peers\":0}";
        const auto t = link_->clock().micros();
        const auto s = link_->captureAppSessionState();
        const auto tp = s.timeForIsPlaying();
        char b[400];
        std::snprintf(b, sizeof b,
            "{\"on\":%s,\"peers\":%zu,\"tempo\":%.6f,\"now\":%lld,\"beat\":%.9f,\"playing\":%s,\"tPlay\":%lld,\"beatAtPlay\":%.9f,\"sync\":%s}",
            link_->isEnabled() ? "true" : "false", link_->numPeers(), s.tempo(), (long long) t.count(), s.beatAtTime(t, q),
            s.isPlaying() ? "true" : "false", (long long) tp.count(), s.beatAtTime(tp, q), link_->isStartStopSyncEnabled() ? "true" : "false");
        return b;
    }

    double timeAtBeat(double beat, double q) const {
        std::lock_guard<std::mutex> l(m_);
        if (!link_) return 0.0;
        return (double) link_->captureAppSessionState().timeAtBeat(beat, q).count();
    }

    void setTempo(double bpm) {
        std::lock_guard<std::mutex> l(m_);
        if (!link_ || !(bpm > 0)) return;
        auto s = link_->captureAppSessionState();
        s.setTempo(bpm, link_->clock().micros());
        link_->commitAppSessionState(s);
    }

    // Nate Bloom starts: beat 0 at `at` when nobody else is in the session, else on the next bar of theirs
    // (and, with Start/Stop Sync, the others start too). Returns when beat 0 is, on the Link clock.
    double start(double at, double q) {
        std::lock_guard<std::mutex> l(m_);
        if (!link_) return 0.0;
        auto s = link_->captureAppSessionState();
        const std::chrono::microseconds t((long long) at);
        if (link_->isStartStopSyncEnabled()) s.setIsPlayingAndRequestBeatAtTime(true, t, 0.0, q);
        else s.requestBeatAtTime(0.0, t, q);
        link_->commitAppSessionState(s);
        return (double) s.timeAtBeat(0.0, q).count();
    }
    // Nate Bloom stopped (with Start/Stop Sync, the others stop too)
    void stop(double at) {
        std::lock_guard<std::mutex> l(m_);
        if (!link_ || !link_->isStartStopSyncEnabled()) return;
        auto s = link_->captureAppSessionState();
        s.setIsPlaying(false, std::chrono::microseconds((long long) at));
        link_->commitAppSessionState(s);
    }

private:
    mutable std::mutex m_;
    std::unique_ptr<ableton::Link> link_;
    bool sync_ = true;
};

}  // namespace nbabl
