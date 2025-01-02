#ifndef AUDIO_PROCESSING_H
#define AUDIO_PROCESSING_H

#include <cstddef>
#include <deque>
#include <vector>

class AGC {
  private:
    float desired_level;
    float attack_coeff;
    float release_coeff;
    float fast_attack_coeff;
    float am_attack_coeff;
    float am_release_coeff;
    size_t look_ahead_samples;
    std::vector<float> gains;
    std::deque<float> lookahead_buffer;
    std::deque<float> lookahead_max;
    float sample_rate;
    float max_gain;  // Maximum allowed gain
    
    // Hang system
    size_t hang_time;
    size_t hang_counter;
    float hang_threshold;

    void push(float sample);
    void pop();
    float max();
    void applyProgressiveAGC(float desired_gain);

  public:
    AGC(float desiredLevel = 0.1f, float attackTimeMs = 50.0f,
        float releaseTimeMs = 300.0f, float lookAheadTimeMs = 10.0f,
        float sr = 44100.0f);
    void process(float *arr, size_t len);
    void reset();
};

#endif