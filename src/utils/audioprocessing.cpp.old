#include "audioprocessing.h"
#include <cmath>
#include <algorithm>

AGC::AGC(float desiredLevel, float attackTimeMs, float releaseTimeMs, float lookAheadTimeMs, float sr)
    : desired_level(desiredLevel), sample_rate(sr) {
    look_ahead_samples = static_cast<size_t>(lookAheadTimeMs * sample_rate / 1000.0f);
    attack_coeff = 1 - exp(-1.0f / (attackTimeMs * 0.001f * sample_rate));
    release_coeff = 1 - exp(-1.0f / (releaseTimeMs * 0.001f * sample_rate));
    
    // Initialize multiple gain stages (RF, IF1, IF2, IF3, Audio)
    gains.resize(5, 1.0f);

    max_gain = 1000.0f; // was 500.0f Bas ON5HB
    
    // Hang system
    hang_time = static_cast<size_t>(0.05f * sample_rate); // Was 500ms hang time, changed to 50ms, Bas ON5HB
    hang_threshold = 0.05f; // was 0.5f just as above
    
    // Dual time constant
    fast_attack_coeff = 1 - exp(-1.0f / (0.5f * 0.001f * sample_rate)); // 5ms fast attack, made 0.5ms attack Bas ON5HB
    
    // AM time constants
    am_attack_coeff = attack_coeff * 0.1f;
    am_release_coeff = release_coeff * 0.1f;
    
    reset();
}

void AGC::push(float sample) {
    lookahead_buffer.push_back(sample);
    while (!lookahead_max.empty() && std::abs(lookahead_max.back()) < std::abs(sample)) {
        lookahead_max.pop_back();
    }
    lookahead_max.push_back(sample);

    if (lookahead_buffer.size() > look_ahead_samples) {
        pop();
    }
}

void AGC::pop() {
    float sample = lookahead_buffer.front();
    lookahead_buffer.pop_front();
    if (!lookahead_max.empty() && sample == lookahead_max.front()) {
        lookahead_max.pop_front();
    }
}

float AGC::max() {
    return lookahead_max.empty() ? 0.0f : std::abs(lookahead_max.front());
}

void AGC::process(float *arr, size_t len) {
    for (size_t i = 0; i < len; i++) {
        push(arr[i]);

        if (lookahead_buffer.size() == look_ahead_samples) {
            float current_sample = lookahead_buffer.front();
            float peak_sample = max();

            float desired_gain = std::min(desired_level / (peak_sample + 1e-15f), max_gain);

            applyProgressiveAGC(desired_gain);

            // Apply the combined gain to the current sample
            float total_gain = 1.0f;
            for (float g : gains) total_gain *= g;
            total_gain = std::min(total_gain, max_gain);  // Apply maximum gain limit
            arr[i] = current_sample * (total_gain * 0.01f);
        } else {
            arr[i] = 0.0f;
        }
    }
}

void AGC::applyProgressiveAGC(float desired_gain) {
    // Apply AGC progressively to different stages
    for (size_t i = 0; i < gains.size(); ++i) {
        float stage_desired_gain = std::min(std::pow(desired_gain, 1.0f / gains.size()), max_gain);
        
        // Implement hang system
        if (stage_desired_gain < gains[i] * hang_threshold) {
            hang_counter = hang_time;
        }
        
        if (hang_counter > 0) {
            hang_counter--;
        } else {
            // Dual time constant system
            float fast_gain = gains[i] * (1 - fast_attack_coeff) + stage_desired_gain * fast_attack_coeff;
            float slow_gain;
            
            // Use AM time constants for slower AGC
            if (stage_desired_gain < gains[i]) {
                slow_gain = gains[i] * (1 - am_attack_coeff) + stage_desired_gain * am_attack_coeff;
            } else {
                slow_gain = gains[i] * (1 - am_release_coeff) + stage_desired_gain * am_release_coeff;
            }
            
            gains[i] = std::min(fast_gain, slow_gain);
        }
    }
    
    // Delayed AGC for RF stage (first stage)
    if (desired_gain > gains[0]) {
        gains[0] = std::min(gains[0] * (1 - release_coeff * 0.1f) + desired_gain * release_coeff * 0.1f, max_gain);
    }
}

void AGC::reset() {
    std::fill(gains.begin(), gains.end(), 1.0f);
    lookahead_buffer.clear();
    lookahead_max.clear();
    hang_counter = 0;
}